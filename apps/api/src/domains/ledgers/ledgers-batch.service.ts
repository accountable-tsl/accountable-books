import type { Knex } from 'knex';
import z from 'zod';

import type { ApiResponse } from '../../core/types/api.types.js';
import { knexClient } from '../../db/knexClient.js';
import { logger } from '../../shared/index.js';
import { ensurePartitionsForDates } from '../../shared/services/partitionManagement.service.js';
import { toYMD } from '../../shared/utils/date.utils.js';
import {
  AppError,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { enqueueGLBalance } from '../balances/index.js';
import { runConstraints } from '../constraints/constraint-runner.js';
import {
  determineMonetaryEntries,
  makeFxTransactionId,
  upsertFxPosition,
} from '../fx/index.js';
import { getCompanySetting } from '../settings/settings.service.js';
import { isSystemUser } from '../users/users.model.js';
import { logLedgerEvent } from './ledger-audit-logs.service.js';
import type {
  NewLedgerEntry,
  NewLedgerTransaction,
  NewLedgerTransactionData,
} from './ledgers.types.js';
import { newLedgerTransactionData } from './ledgers.types.js';
import {
  processEntriesDates,
  resolveFx,
  validateBankLegAmount,
  validateIds,
} from './ledgers.utils.js';

/**
 * Batch create multiple ledger transactions atomically
 *
 * This is more efficient than calling createLedgerRecord multiple times because:
 * 1. Single database transaction for all records (atomic)
 * 2. Advisory locks acquired once (not N times)
 * 3. Partitions created once upfront
 * 4. Balance recalculation enqueued once per COA (merged ranges)
 * 5. Company settings fetched once
 * 6. Contact/project validation done once for all transactions
 * 7. Bank transactions fetched in one query
 * 8. Source entity linking done in batch (CASE WHEN updates)
 *
 * @param transactions - Array of ledger transaction data
 * @param autoPost - Whether this is an auto-post operation (affects audit logging)
 * @param companyId - The company ID (can be short_code or UUID)
 * @param userId - The user creating these transactions
 * @returns Success response with all transaction IDs and warnings, or error response
 */
export async function createLedgerRecordsBatch({
  transactions,
  autoPost = false,
  companyId,
  userId,
}: {
  transactions: NewLedgerTransactionData[];
  autoPost?: boolean;
  companyId: string;
  userId: string;
}): Promise<ApiResponse> {
  // PHASE 1: INPUT VALIDATION
  if (transactions.length === 0) {
    return errorResponse('No transactions provided');
  }

  // Validate all transactions upfront
  const validatedTransactions: NewLedgerTransactionData[] = [];
  for (let i = 0; i < transactions.length; i++) {
    const validate = newLedgerTransactionData.safeParse(transactions[i]);
    if (!validate.success) {
      return errorResponse(
        `Invalid transaction at index ${i}`,
        z.treeifyError(validate.error),
      );
    }
    validatedTransactions.push(validate.data);
  }

  const exec = async (txn: Knex.Transaction) => {
    const results: Array<{
      ledgerTransactionId: string;
      warnings?: { [key: string]: string };
      affectedCOAs: number;
      dateRange: { min: string | null; max: string | null };
    }> = [];

    // STEP 1: COMPANY RESOLUTION (ONCE FOR ALL)
    const company: { id: string; reporting_currency_id: string } =
      (await txn('companies')
        .where((b) => b.where('short_code', companyId).orWhere('id', companyId))
        .where('is_deleted', false)
        .first('id', 'reporting_currency_id')) ?? null;

    if (!company || !company.reporting_currency_id || !company.id) {
      throw new AppError(`Company not found: ${companyId}`);
    }
    const companyUUID = company.id;
    const reportingCurrencyId = company.reporting_currency_id;

    // Check FX tracking settings once
    const fxSettingsResult = await getCompanySetting({
      companyId: companyUUID,
      settingKeys: ['track_fx_positions'],
      trx: txn,
    });
    const trackFxPositions =
      fxSettingsResult.success && fxSettingsResult.data
        ? fxSettingsResult.data.track_fx_positions
        : false;

    // STEP 2: ADVISORY LOCK (ONCE FOR ALL)
    await txn.raw(`SELECT pg_advisory_xact_lock(hashtext(?))`, [companyUUID]);

    // Collect all bank transaction IDs to lock
    const bankTxnIdsForLock = new Set<string>();
    for (const tx of validatedTransactions) {
      if (
        tx.transaction_source === 'bank_transaction' &&
        tx.source_transaction_id
      ) {
        bankTxnIdsForLock.add(tx.source_transaction_id);
      }
    }

    // Lock all bank transactions at once
    for (const bankTxnId of bankTxnIdsForLock) {
      await txn.raw(`SELECT pg_advisory_xact_lock(hashtext(?))`, [
        `bank_txn:${bankTxnId}`,
      ]);
    }

    // STEP 3: PARTITION MANAGEMENT (ONCE FOR ALL)
    // Collect all unique dates across all transactions
    const allDates = new Set<Date>();
    for (const tx of validatedTransactions) {
      const { transactionDates } = processEntriesDates(tx.transactions);
      transactionDates.forEach((d) => allDates.add(d));
    }
    await ensurePartitionsForDates('ledger_entries', Array.from(allDates), txn);

    // STEP 4: COLLECT ALL CONTACT & PROJECT IDS (FOR BATCH VALIDATION)
    // Instead of validating per transaction, we collect all IDs upfront
    // and validate them in one batch query - much more efficient
    const allContactIdsGlobal = new Set<string>();
    const allProjectIdsGlobal = new Set<string>();

    // First pass: collect all IDs and check for bank transaction duplicates
    for (let txIndex = 0; txIndex < validatedTransactions.length; txIndex++) {
      const txData = validatedTransactions[txIndex]!;
      const { transactions: entries, ...ledgerTx } = txData;

      const isBankTransaction =
        ledgerTx.transaction_source === 'bank_transaction';
      const sourceTxId = ledgerTx.source_transaction_id;
      const sourceTxDate = ledgerTx.source_transaction_date;

      // Early idempotency check for bank transactions
      if (isBankTransaction && sourceTxId && sourceTxDate) {
        const existing = await txn('ledger_transactions')
          .where({
            company_id: companyUUID,
            source_transaction_id: sourceTxId,
            source_transaction_date: toYMD(sourceTxDate),
            is_deleted: false,
          })
          .first('id');

        if (existing) {
          throw new AppError(
            `Transaction ${txIndex}: Ledger transaction already exists for bank transaction ${sourceTxId}`,
            {
              existingLedgerTransactionId: existing.id,
              sourceTransactionId: sourceTxId,
            },
          );
        }
      }

      // Collect contact IDs
      if (ledgerTx.contact_id) {
        allContactIdsGlobal.add(ledgerTx.contact_id);
      }
      for (const e of entries) {
        if (e.contact_id) allContactIdsGlobal.add(e.contact_id);
        if (e.project_id) allProjectIdsGlobal.add(e.project_id);
      }
    }

    // Validate all contacts and projects in one batch query
    await validateIds(
      'contacts',
      Array.from(allContactIdsGlobal),
      companyUUID,
      txn,
    );
    await validateIds(
      'projects',
      Array.from(allProjectIdsGlobal),
      companyUUID,
      txn,
    );

    // STEP 5: FETCH ALL BANK TRANSACTIONS IN BATCH (FOR BANK TRANSACTIONS)
    // Collect all bank transaction IDs and fetch them in one query
    const bankTxnIds = validatedTransactions
      .filter(
        (tx) =>
          tx.transaction_source === 'bank_transaction' &&
          tx.source_transaction_id &&
          tx.source_transaction_date,
      )
      .map((tx) => ({
        id: tx.source_transaction_id!,
        date: toYMD(tx.source_transaction_date!),
      }));

    // Fetch all bank transactions in one query
    const bankTxnMap = new Map<
      string,
      {
        amount: number;
        system_exchange_rate: number;
        bank_coa_id: string;
        bank_currency_id: string;
        contact_id?: string | null;
        contact_type_snapshot?: string | null;
      }
    >();

    if (bankTxnIds.length > 0) {
      // Build WHERE clause for composite key matching
      // We need to match on (bt.id, bt.date) pairs
      const bankTxnResults = await txn('bank_transactions as bt')
        .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
        .where('ba.company_id', companyUUID)
        .where('bt.is_deleted', false)
        .where((builder) => {
          for (const btxn of bankTxnIds) {
            builder.orWhere((subBuilder) => {
              subBuilder.where('bt.id', btxn.id).andWhere('bt.date', btxn.date);
            });
          }
        })
        .select(
          'bt.id',
          'bt.date',
          'bt.amount',
          'bt.system_exchange_rate',
          'bt.contact_id',
          'bt.contact_type_snapshot',
          'ba.coa_id as bank_coa_id',
          'ba.currency_id as bank_currency_id',
        );

      for (const row of bankTxnResults) {
        const key = `${row.id}|${row.date}`;
        bankTxnMap.set(key, {
          amount: Number(row.amount),
          system_exchange_rate: Number(row.system_exchange_rate),
          bank_coa_id: row.bank_coa_id,
          bank_currency_id: row.bank_currency_id,
          contact_id: row.contact_id ?? null,
          contact_type_snapshot: row.contact_type_snapshot ?? null,
        });
      }
    }

    // STEP 6: COLLECT GLOBAL COA BOUNDS (FOR BATCH BALANCE RECALC)
    // We'll merge all COA date ranges across all transactions
    // and enqueue balance recalc once at the end
    const globalCoaBounds = new Map<string, { min: string; max: string }>();

    // STEP 6: PROCESS EACH TRANSACTION
    for (let txIndex = 0; txIndex < validatedTransactions.length; txIndex++) {
      const txData = validatedTransactions[txIndex]!;
      const { transactions: entries, ...ledgerTx } = txData;

      // Extract commonly used values
      const isBankTransaction =
        ledgerTx.transaction_source === 'bank_transaction';
      const sourceTxId = ledgerTx.source_transaction_id;
      const sourceTxDate = ledgerTx.source_transaction_date;
      const sourceTxAmount = ledgerTx.source_transaction_amount;
      const sourceTxCurrencyId = ledgerTx.source_transaction_currency_id;

      const requiredBankTxSourceFieldsExist =
        !!sourceTxId && !!sourceTxDate && !!sourceTxAmount;
      if (isBankTransaction && !requiredBankTxSourceFieldsExist) {
        throw new AppError(
          `Transaction ${txIndex}: Bank transaction must have source fields`,
        );
      }

      const result: {
        ledgerTransactionId: string;
        warnings?: { [key: string]: string };
        affectedCOAs: number;
        dateRange: { min: string | null; max: string | null };
      } = {
        ledgerTransactionId: '',
        warnings: {},
        affectedCOAs: 0,
        dateRange: { min: null, max: null },
      };

      // Note: Idempotency check already done in first pass (Step 4)

      // Process dates for this transaction
      const { bounds, minYMD, maxYMD } = processEntriesDates(entries);

      // Bank leg validation
      const bankLegs = entries.filter((e) => e.is_bank_leg === true);
      if (bankLegs.length > 0 && !isBankTransaction) {
        throw new AppError(
          `Transaction ${txIndex}: Bank leg entries only allowed for bank transactions`,
        );
      }

      if ((isBankTransaction && bankLegs.length === 0) || bankLegs.length > 1) {
        throw new AppError(
          `Transaction ${txIndex}: Bank transaction must have exactly one bank leg entry`,
        );
      }

      // Bank transaction validation
      // Note: Bank transactions already fetched in batch (Step 5)
      let bankTxn: {
        amount: number;
        system_exchange_rate: number;
        bank_coa_id: string;
        bank_currency_id: string;
        contact_id?: string | null;
        contact_type_snapshot?: string | null;
      } | null = null;

      if (isBankTransaction && requiredBankTxSourceFieldsExist) {
        const bankTxnKey = `${sourceTxId}|${toYMD(sourceTxDate)}`;
        bankTxn = bankTxnMap.get(bankTxnKey) ?? null;

        if (!bankTxn) {
          throw new AppError(
            `Transaction ${txIndex}: Bank transaction not found: ${sourceTxId}`,
          );
        }

        const bankLeg = bankLegs[0]!;

        if (bankLeg.coa_id !== bankTxn.bank_coa_id) {
          throw new AppError(`Transaction ${txIndex}: Bank leg COA mismatch`);
        }

        if (bankLeg.source_currency_id !== bankTxn.bank_currency_id) {
          throw new AppError(
            `Transaction ${txIndex}: Bank leg currency mismatch`,
          );
        }

        const bankValidation = validateBankLegAmount({
          entries: [bankLeg],
          bankTransactionAmount: bankTxn.amount,
        });

        if (!bankValidation.valid) {
          throw new AppError(`Transaction ${txIndex}: ${bankValidation.error}`);
        }
      }

      // Contact & project resolution
      // Note: Contact/project validation already done in first pass (Step 4)
      const [transactionContactId, transactionContactType] = (() => {
        let id = ledgerTx.contact_id ?? null;
        let type = ledgerTx.contact_type ?? null;

        if (!id && bankTxn?.contact_id) {
          id = bankTxn.contact_id;
          type = (bankTxn.contact_type_snapshot as typeof type) ?? null;
        }

        return [id, type];
      })();

      // FX resolution
      const {
        systemExRate,
        customExRate,
        warnings: fxWarnings,
      } = await resolveFx({
        entries,
        ledgerTxDate: new Date(ledgerTx.date),
        sourceCurrencyId: sourceTxCurrencyId,
        reportingCurrencyId,
        bankTxnSystemRate: bankTxn?.system_exchange_rate,
      });

      if (fxWarnings.length > 0) {
        result.warnings = result.warnings || {};
        result.warnings.fxWarnings = fxWarnings.join(', ');
      }

      // Constraint validation
      const constraintEntries = entries.map((entry, index) => ({
        id: `${index}`,
        amount: entry.source_amount,
        coa_id: entry.coa_id,
        fs_date: toYMD(entry.fs_date),
        project_id: entry.project_id ?? null,
        is_bank_leg: entry.is_bank_leg ?? false,
        system_exchange_rate: systemExRate,
        custom_exchange_rate: customExRate,
      }));

      const constraintResult = await runConstraints({
        companyUUID,
        entries: constraintEntries,
        transaction_date: toYMD(ledgerTx.date),
      });

      if (!constraintResult.isValid) {
        const errorMessages = constraintResult.errors.map((e) => e.message);
        throw new AppError(
          `Transaction ${txIndex}: ${errorMessages.join('; ')}`,
        );
      }

      if (constraintResult.warnings.length > 0) {
        result.warnings = result.warnings || {};
        result.warnings.constraintWarnings = constraintResult.warnings
          .map((w) => w.message)
          .join('\n');
      }

      // Insert ledger transaction
      const ledgerTransaction: NewLedgerTransaction = {
        ...ledgerTx,
        contact_id: transactionContactId,
        contact_type: transactionContactType,
        company_id: companyUUID,
        created_by_id: userId,
        updated_by_id: userId,
      };

      const [row] = await txn('ledger_transactions')
        .insert(ledgerTransaction)
        .returning('id');
      const ledgerTransactionId = String(row.id);
      result.ledgerTransactionId = ledgerTransactionId;

      // Monetary entry determination
      const monetaryResult = await determineMonetaryEntries({
        entries,
        companyId: companyUUID,
        reportingCurrencyId,
        trx: txn,
      });
      const monetaryMap = monetaryResult.monetaryMap;

      // FX position tracking
      let fxTransactionId: string | null = null;
      if (
        sourceTxCurrencyId !== reportingCurrencyId &&
        monetaryResult.monetaryEntries.length > 0
      ) {
        fxTransactionId = makeFxTransactionId({
          type: 'LEDGER_TX',
          ledgerTransactionId,
        });

        if (trackFxPositions) {
          for (const {
            index,
            entry: _baseEntry,
          } of monetaryResult.monetaryEntries) {
            const fullEntry = entries[index]!;
            const calculatedAmount = fullEntry.source_amount * customExRate;

            await upsertFxPosition({
              companyId: companyUUID,
              fx_transaction_id: fxTransactionId,
              account_id: fullEntry.coa_id,
              foreign_currency_id: fullEntry.source_currency_id,
              source_amount: fullEntry.source_amount,
              amount: calculatedAmount,
              exchange_rate: customExRate,
              trx: txn,
            });
          }
        }
      }

      // Build & insert ledger entries
      const entriesToInsert: NewLedgerEntry[] = entries.map((e, index) => ({
        ...e,
        ledger_transaction_id: ledgerTransactionId,
        is_bank_leg: e.is_bank_leg ?? false,
        system_exchange_rate: systemExRate,
        custom_exchange_rate: customExRate,
        contact_id: e.contact_id ? e.contact_id : transactionContactId,
        contact_type: e.contact_type ? e.contact_type : transactionContactType,
        is_monetary: monetaryMap.get(index) ?? false,
        fx_transaction_id: monetaryMap.get(index) ? fxTransactionId : null,
        updated_by_id: userId,
      }));

      await txn('ledger_entries').insert(entriesToInsert);

      // STEP 7: CREATE LEDGER AUDIT LOG
      // Automatically create audit log entry for all ledger transactions
      try {
        const systemUser = await isSystemUser(userId, txn);
        const eventType =
          systemUser && autoPost
            ? 'ledger_posted_auto'
            : 'ledger_posted_manual';

        const actorType = systemUser ? 'system' : 'user';

        // Build comment based on event type and source
        const comment =
          eventType === 'ledger_posted_auto'
            ? `Auto-posted from ${ledgerTx.categorization_source} candidate`
            : 'Manual posting';

        const categorizationTaskId =
          ledgerTx.metadata?.categorization_task_id &&
          typeof ledgerTx.metadata.categorization_task_id === 'string'
            ? ledgerTx.metadata.categorization_task_id
            : null;

        // Build metadata for audit log
        const auditMetadata: Record<string, unknown> = {
          transaction_source: ledgerTx.transaction_source,
          categorization_source: ledgerTx.categorization_source,
        };

        if (ledgerTx.categorization_candidate_id) {
          auditMetadata.categorization_candidate_id =
            ledgerTx.categorization_candidate_id;
        }

        if (sourceTxId) {
          auditMetadata.source_transaction_id = sourceTxId;
        }

        await logLedgerEvent({
          ledgerTransactionId,
          actorId: userId,
          actorType,
          eventType,
          categorizationTaskId,
          comment,
          metadata: auditMetadata,
          trx: txn,
        });
      } catch (error) {
        // Audit log creation failure should not block ledger transaction creation
        // Log error but continue with transaction
        logger.error(
          {
            error: error instanceof Error ? error.message : 'Unknown error',
            ledgerTransactionId,
            companyId: companyUUID,
            transactionIndex: txIndex,
          },
          'Failed to create ledger audit log in batch, but ledger transaction was created',
        );
      }

      // MERGE COA bounds into global map
      for (const [coaId, range] of bounds) {
        const existing = globalCoaBounds.get(coaId);
        if (!existing) {
          globalCoaBounds.set(coaId, { min: range.min, max: range.max });
        } else {
          if (range.min < existing.min) existing.min = range.min;
          if (range.max > existing.max) existing.max = range.max;
        }
      }

      // Set result values
      result.affectedCOAs = bounds.size;
      result.dateRange = { min: minYMD, max: maxYMD };

      if (result.warnings && Object.keys(result.warnings).length > 0) {
        // Keep warnings
      } else {
        result.warnings = undefined;
      }

      results.push(result);
    }

    // STEP 6: ENQUEUE BALANCE RECALCULATION (ONCE PER COA)
    // This is the key optimization: instead of enqueuing N times per COA,
    // we enqueue once with the merged date range
    for (const [coaId, range] of globalCoaBounds) {
      await enqueueGLBalance({
        companyId: companyUUID,
        coaId,
        recalcFrom: range.min,
        recalcTo: range.max,
        triggeredBy: 'ledger_entry',
      });
    }

    // STEP 8: LINK BACK TO SOURCE ENTITIES
    // Automatically link ledger transactions back to source entities in batch
    // This ensures bidirectional relationship for traceability
    const bankTxnUpdates: Array<{ id: string; ledgerTransactionId: string }> =
      [];
    const journalBatchUpdates: Array<{
      id: string;
      ledgerTransactionId: string;
    }> = [];

    for (let txIndex = 0; txIndex < validatedTransactions.length; txIndex++) {
      const txData = validatedTransactions[txIndex]!;
      const result = results[txIndex]!;
      const isBankTransaction =
        txData.transaction_source === 'bank_transaction';
      const sourceTxId = txData.source_transaction_id;

      if (isBankTransaction && sourceTxId) {
        bankTxnUpdates.push({
          id: sourceTxId,
          ledgerTransactionId: result.ledgerTransactionId,
        });
      } else if (txData.transaction_source === 'manual_journal' && sourceTxId) {
        journalBatchUpdates.push({
          id: sourceTxId,
          ledgerTransactionId: result.ledgerTransactionId,
        });
      }
    }

    // Batch update bank transactions
    if (bankTxnUpdates.length > 0) {
      try {
        // Use CASE WHEN for efficient batch update
        const caseWhen = bankTxnUpdates
          .map((u) => `WHEN id = '${u.id}' THEN '${u.ledgerTransactionId}'`)
          .join(' ');

        await txn.raw(`
          UPDATE bank_transactions
          SET ledger_transaction_id = (CASE ${caseWhen} END)
          WHERE id IN (${bankTxnUpdates.map((u) => `'${u.id}'`).join(',')})
        `);

        logger.debug(
          {
            count: bankTxnUpdates.length,
          },
          'Linked bank transactions to ledger transactions in batch',
        );
      } catch (error) {
        // Linking failure should not block ledger transaction creation
        // Log warning but continue
        logger.warn(
          {
            error: error instanceof Error ? error.message : 'Unknown error',
            count: bankTxnUpdates.length,
          },
          'Failed to link bank transactions to ledger transactions in batch',
        );
      }
    }

    // Batch update journal batches
    if (journalBatchUpdates.length > 0) {
      try {
        const caseWhen = journalBatchUpdates
          .map((u) => `WHEN id = '${u.id}' THEN '${u.ledgerTransactionId}'`)
          .join(' ');

        await txn.raw(`
          UPDATE journal_batches
          SET ledger_transaction_id = (CASE ${caseWhen} END)
          WHERE id IN (${journalBatchUpdates.map((u) => `'${u.id}'`).join(',')})
        `);

        logger.debug(
          {
            count: journalBatchUpdates.length,
          },
          'Linked journal batches to ledger transactions in batch',
        );
      } catch (error) {
        logger.warn(
          {
            error: error instanceof Error ? error.message : 'Unknown error',
            count: journalBatchUpdates.length,
          },
          'Failed to link journal batches to ledger transactions in batch',
        );
      }
    }

    return results;
  };

  try {
    const results = await knexClient.transaction(exec);
    return successResponse('Batch ledger transactions created', {
      count: results.length,
      transactions: results,
    });
  } catch (err) {
    logger.error(
      {
        error: err,
        companyId,
        userId,
        transactionCount: transactions.length,
      },
      'Failed to create batch ledger transactions',
    );

    return errorResponse(
      'Failed to create batch ledger transactions',
      err instanceof Error ? err.message : 'Unknown error',
    );
  }
}
