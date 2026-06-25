import type { Knex } from 'knex';
import z from 'zod';

import { knexClient } from '../../db/knexClient.js';
import { logger } from '../../shared/index.js';
import {
  acquireAdvisoryXactLocks,
  lockKeyBankTxn,
  lockKeyCompany,
} from '../../shared/services/advisoryLocks.service.js';
import { toYMD } from '../../shared/utils/date.utils.js';
import { getIdentifierType } from '../../shared/utils/formatting.utils.js';
import {
  AppError,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { scheduleGLBalanceAfterCommit } from '../balances/index.js';
import { runConstraints } from '../constraints/constraint-runner.js';
import {
  determineMonetaryEntries,
  makeFxTransactionId,
  upsertFxPosition,
} from '../fx/index.js';
import { scheduleCloseSignalEvalAfterCommit } from '../reporting/close-readiness/signals/close-signal-eval.queue.js';
import { getCompanySetting } from '../settings/settings.service.js';
import { isSystemUser } from '../users/users.model.js';
// import { getBankTransactionContactResolutions } from './bank-transaction-contact-resolution.service.js';
import { logLedgerEvent } from './ledger-audit-logs.service.js';
import { newLedgerTransactionData } from './ledgers.types.js';
import {
  buildOpenEndedGLBalanceRecalcRequests,
  fetchLookupMap,
  processEntriesDates,
  resolveFx,
  validateBankLegAmount,
} from './ledgers.utils.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type { ContactType } from '../contacts/index.js';
import type {
  NewLedgerEntry,
  NewLedgerTransaction,
  NewLedgerTransactionData,
} from './ledgers.types.js';

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
        .where(
          getIdentifierType(companyId) === 'uuid'
            ? { id: companyId }
            : { short_code: companyId },
        )
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

    // STEP 2: ADVISORY LOCKS (ONCE FOR ALL, DETERMINISTIC ORDER)
    const advisoryKeys = [lockKeyCompany(companyUUID)];
    for (const tx of validatedTransactions) {
      if (
        tx.transaction_source === 'bank_transaction' &&
        tx.source_transaction_id
      ) {
        advisoryKeys.push(lockKeyBankTxn(tx.source_transaction_id));
      }
    }
    await acquireAdvisoryXactLocks(txn, advisoryKeys);

    // STEP 3: COLLECT ALL CONTACT & PROJECT IDS (FOR BATCH VALIDATION)
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
            transaction_source: 'bank_transaction',
            source_transaction_id: sourceTxId,
            status: 'posted',
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
        resolved_contact_id: string | null;
        resolved_contact_type: ContactType | null;
      }
    >();

    // if (bankTxnIds.length > 0) {
    // const contactResolutionByBankTxnId =
    //   await getBankTransactionContactResolutions({
    //     companyId: companyUUID,
    //     bankTransactionIds: bankTxnIds.map((bankTxn) => bankTxn.id),
    //     trx: txn,
    //   });

    // const bankTxnResults = await txn('bank_transactions as bt')
    //   .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
    //   .where('ba.company_id', companyUUID)
    //   .where('bt.is_deleted', false)
    //   .whereIn(
    //     'bt.id',
    //     bankTxnIds.map((bankTxn) => bankTxn.id),
    //   )
    //   .select(
    //     'bt.id',
    //     'bt.transaction_date as date',
    //     'bt.amount',
    //     'bt.system_exchange_rate',
    //     'ba.coa_id as bank_coa_id',
    //     'ba.currency_id as bank_currency_id',
    //   );

    // for (const row of bankTxnResults) {
    //   const key = `${row.id}|${row.date}`;
    //   const contactResolution = contactResolutionByBankTxnId.get(row.id);
    //   bankTxnMap.set(key, {
    //     amount: Number(row.amount),
    //     system_exchange_rate: Number(row.system_exchange_rate),
    //     bank_coa_id: row.bank_coa_id,
    //     bank_currency_id: row.bank_currency_id,
    //     resolved_contact_id: contactResolution?.contact_id ?? null,
    //     resolved_contact_type: contactResolution?.contact_type ?? null,
    //   });
    //   if (contactResolution?.contact_id) {
    //     allContactIdsGlobal.add(contactResolution.contact_id);
    //   }
    // }
    // }

    const contactNameByIdGlobal = await fetchLookupMap({
      table: 'contacts',
      ids: Array.from(allContactIdsGlobal),
      companyId: companyUUID,
      txn,
    });
    const projectNameByIdGlobal = await fetchLookupMap({
      table: 'projects',
      ids: Array.from(allProjectIdsGlobal),
      companyId: companyUUID,
      txn,
    });

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
        resolved_contact_id: string | null;
        resolved_contact_type: ContactType | null;
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

        if (!id && bankTxn?.resolved_contact_id) {
          id = bankTxn.resolved_contact_id;
          type = bankTxn.resolved_contact_type;
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
        ledgerTxDate: new Date(ledgerTx.transaction_date),
        sourceCurrencyId: sourceTxCurrencyId,
        reportingCurrencyId,
        bankTxnSystemRate: bankTxn?.system_exchange_rate,
        trx: txn,
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

      const constraintResult = await runConstraints(
        {
          companyUUID,
          entries: constraintEntries,
          transaction_date: toYMD(ledgerTx.transaction_date),
        },
        txn, // Pass the transaction to avoid deadlocks and ensure consistency
      );

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
      }

      // Build & insert ledger entries
      const resolvedEntries = entries.map((entry) => ({
        ...entry,
        contact_id: entry.contact_id ? entry.contact_id : transactionContactId,
        contact_type: entry.contact_type
          ? entry.contact_type
          : transactionContactType,
      }));
      const entriesToInsert: NewLedgerEntry[] = resolvedEntries.map(
        (entry, index) => ({
          ...entry,
          company_id: companyUUID,
          ledger_transaction_id: ledgerTransactionId,
          is_bank_leg: entry.is_bank_leg ?? false,
          system_exchange_rate: systemExRate,
          custom_exchange_rate: customExRate,
          is_monetary: monetaryMap.get(index) ?? false,
          fx_transaction_id: monetaryMap.get(index) ? fxTransactionId : null,
          updated_by_id: userId,
        }),
      );

      const insertedEntries = await txn('ledger_entries')
        .insert(entriesToInsert)
        .returning<
          Array<{
            id: string;
            coa_id: string;
            source_currency_id: string;
            source_amount: string | number;
            amount: string | number;
            is_monetary: boolean;
            fx_transaction_id: string | null;
            fs_date: string | Date;
          }>
        >(['id', 'coa_id', 'source_currency_id', 'source_amount', 'amount', 'is_monetary', 'fx_transaction_id', 'fs_date']);

      if (trackFxPositions && fxTransactionId) {
        for (const entry of insertedEntries) {
          if (!entry.is_monetary || !entry.fx_transaction_id) continue;

          await upsertFxPosition({
            companyId: companyUUID,
            fx_transaction_id: entry.fx_transaction_id,
            account_id: entry.coa_id,
            foreign_currency_id: entry.source_currency_id,
            source_amount: Number(entry.source_amount),
            amount: Number(entry.amount),
            exchange_rate: customExRate,
            source_type: 'ledger_entry',
            source_id: entry.id,
            ledger_transaction_id: ledgerTransactionId,
            ledger_entry_id: entry.id,
            movement_date: toYMD(entry.fs_date),
            created_by_id: userId,
            trx: txn,
          });
        }
      }

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
    for (const request of buildOpenEndedGLBalanceRecalcRequests({
      companyId: companyUUID,
      bounds: globalCoaBounds,
      triggeredBy: 'ledger_entry',
    })) {
      await scheduleGLBalanceAfterCommit(request, txn);
    }

    // Re-evaluate close review signals once per created ledger transaction.
    for (const result of results) {
      await scheduleCloseSignalEvalAfterCommit(
        {
          companyId: companyUUID,
          ledgerTransactionId: result.ledgerTransactionId,
          triggeredBy: 'ledger_write',
        },
        txn,
      );
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
