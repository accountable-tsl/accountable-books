import type { Knex } from 'knex';
import z from 'zod';

import { knexClient } from '../../db/knexClient.js';
import { logger } from '../../shared/index.js';
import {
  acquireAdvisoryXactLocks,
  isDeadlockError,
  lockKeyBankTxn,
  lockKeyCompany,
  sleep,
} from '../../shared/services/advisoryLocks.service.js';
import { toYMD } from '../../shared/utils/date.utils.js';
import { getIdentifierType } from '../../shared/utils/formatting.utils.js';
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
import { getBankTransactionContactResolution } from './bank-transaction-contact-resolution.service.js';
import { logLedgerEvent } from './ledger-audit-logs.service.js';
import { newLedgerTransactionData } from './ledgers.types.js';
import {
  detectChangedFields,
  fetchLookupMap,
  normalizeDateForComparison,
  processEntriesDates,
  resolveFx,
  validateBankLegAmount,
} from './ledgers.utils.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type { ContactType } from '../contacts/index.js';
import type {
  LedgerEntry,
  LedgerEntryInput,
  LedgerTransaction,
  LedgerTransactionWithEntries,
  LedgerTransactionWithEntriesFiltered,
  NewLedgerEntry,
  NewLedgerTransaction,
  NewLedgerTransactionData,
} from './ledgers.types.js';

interface CreateLedgerRecordResult {
  ledgerTransactionId: string;
  warnings?: { [key: string]: string };
  affectedCOAs: number;
  dateRange: {
    min: string | null;
    max: string | null;
  };
}

/**
 * Create a ledger transaction and its entries atomically
 *
 * This function creates a complete accounting transaction (journal entry) in the ledger.
 * It ensures all accounting rules are followed and maintains data integrity.
 *
 * Key Features:
 * - Validates all inputs before processing
 * - Ensures double-entry bookkeeping (debits = credits)
 * - Validates bank transactions match their source
 * - Handles foreign currency exchange rates
 * - Tracks FX positions if enabled
 * - Uses advisory locks to prevent race conditions
 * - All operations happen in a database transaction (all-or-nothing)
 *
 * @param data - The ledger transaction data including entries
 * @param companyId - The company ID (can be short_code or UUID)
 * @param userId - The user creating this transaction
 * @param trx - Optional existing database transaction (if not provided, creates a new one)
 * @returns Success response with transaction ID and warnings, or error response
 */
export async function createLedgerRecord({
  data,
  autoPost = false,
  companyId,
  userId,
  trx,
  ledgerTransactionIdOverride,
}: {
  data: NewLedgerTransactionData;
  autoPost?: boolean;
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
  ledgerTransactionIdOverride?: string;
}): Promise<ApiResponse<CreateLedgerRecordResult>> {
  // PHASE 1: INPUT VALIDATION
  // Validate that the input data matches our expected schema
  // This catches errors early before we do any database work
  const validate = newLedgerTransactionData.safeParse(data);
  if (!validate.success) {
    return errorResponse('Invalid input', z.treeifyError(validate.error));
  }

  const { transactions: entries, ...ledgerTx } = validate.data;

  // A ledger transaction must have at least 2 entries (debit and credit)
  if (entries.length === 0) {
    return errorResponse('No entries provided');
  }

  // Extract commonly used values for readability
  const isBankTransaction = ledgerTx.transaction_source === 'bank_transaction';
  const sourceTxId = ledgerTx.source_transaction_id;
  const sourceTxDate = ledgerTx.source_transaction_date;
  const sourceTxAmount = ledgerTx.source_transaction_amount;
  const sourceTxCurrencyId = ledgerTx.source_transaction_currency_id;

  // For bank transactions, we need these fields to link back to the source
  const requiredBankTxSourceFieldsExist =
    !!sourceTxId && !!sourceTxDate && !!sourceTxAmount;
  if (isBankTransaction && !requiredBankTxSourceFieldsExist) {
    return errorResponse(
      'Bank transaction must have source_transaction_id, source_transaction_date and source_transaction_amount',
    );
  }

  const exec = async (
    txn: Knex.Transaction,
  ): Promise<CreateLedgerRecordResult> => {
    // Track warnings that don't block the transaction but should be reported
    const result: CreateLedgerRecordResult = {
      ledgerTransactionId: '',
      warnings: {},
      affectedCOAs: 0,
      dateRange: { min: null, max: null },
    };

    // STEP 1: COMPANY RESOLUTION & SETUP
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

    // Check if FX tracking is enabled for this company
    const fxSettingsResult = await getCompanySetting({
      companyId: companyUUID,
      settingKeys: ['track_fx_positions'],
      trx: txn,
    });
    const trackFxPositions =
      fxSettingsResult.success && fxSettingsResult.data
        ? fxSettingsResult.data.track_fx_positions
        : false;

    // STEP 2: IDEMPOTENCY CHECK (BANK TRANSACTIONS ONLY)
    // For bank transactions, check if we've already created a ledger transaction
    // for this bank transaction. This prevents duplicate work and errors.
    // We do this BEFORE acquiring locks to avoid unnecessary blocking.
    if (isBankTransaction && requiredBankTxSourceFieldsExist) {
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
          `Ledger transaction already exists for bank transaction ${sourceTxId}`,
          {
            existingLedgerTransactionId: existing.id,
            sourceTransactionId: sourceTxId,
            sourceTransactionDate: sourceTxDate,
          },
        );
      }
    }

    // STEP 3: ADVISORY LOCKS (PREVENT RACE CONDITIONS)
    // Advisory locks ensure only one transaction processes at a time for:
    // 1. The company (prevents concurrent modifications to the same company's ledger)
    // 2. The bank transaction (if applicable, prevents duplicate ledger transactions)
    // These locks are automatically released when the transaction commits or rolls back
    const advisoryKeys = [lockKeyCompany(companyUUID)];
    // Only lock the bank transaction if this is actually a bank transaction.
    if (sourceTxId && isBankTransaction) {
      advisoryKeys.push(lockKeyBankTxn(sourceTxId));
    }
    await acquireAdvisoryXactLocks(txn, advisoryKeys);

    // STEP 4: EXTRACT DATE BOUNDS FOR GL BALANCE ENQUEUE
    const { bounds, minYMD, maxYMD } = processEntriesDates(entries);

    // STEP 5: PRE-CONSTRAINT VALIDATIONS
    // These validations happen before we run the constraint system
    // They check business rules that are specific to this function

    // 5a. Bank Leg Validation
    // A "bank leg" is the entry that represents the bank account side of a transaction
    // Only bank transactions can have bank legs, and they must have exactly one
    const bankLegs = entries.filter((e) => e.is_bank_leg === true);
    if (bankLegs.length > 0 && !isBankTransaction) {
      throw new AppError('Bank leg entries only allowed for bank transactions');
    }

    if ((isBankTransaction && bankLegs.length === 0) || bankLegs.length > 1) {
      throw new AppError(
        'Bank transaction must have exactly one bank leg entry',
      );
    }

    // 5b. Bank Transaction Validation & Matching
    // For bank transactions, we must:
    // 1. Fetch the original bank transaction from the database
    // 2. Verify it exists and belongs to this company
    // 3. Ensure the bank leg matches the bank account (COA and currency)
    // 4. Ensure the bank leg amount matches the bank transaction amount
    let bankTxn: {
      amount: number;
      system_exchange_rate: number;
      bank_coa_id: string;
      bank_currency_id: string;
      resolved_contact_id: string | null;
      resolved_contact_type: ContactType | null;
    } | null = null;

    if (isBankTransaction && requiredBankTxSourceFieldsExist) {
      // Fetch the bank transaction along with its bank account details
      // We need the bank account's COA and currency to validate the bank leg
      const bankTxnResult = await txn('bank_transactions as bt')
        .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
        .where({
          'bt.id': sourceTxId,
          'ba.company_id': companyUUID,
          'bt.is_deleted': false,
          'ba.is_deleted': false,
        })
        .first(
          'bt.amount',
          'bt.system_exchange_rate',
          'ba.coa_id as bank_coa_id',
          'ba.currency_id as bank_currency_id',
        );

      if (!bankTxnResult) {
        throw new AppError(
          `Bank transaction not found or does not belong to company: ${sourceTxId}`,
        );
      }

      const contactResolution = await getBankTransactionContactResolution({
        companyId: companyUUID,
        bankTransactionId: sourceTxId!,
        trx: txn,
      });

      bankTxn = {
        amount: Number(bankTxnResult.amount),
        system_exchange_rate: Number(bankTxnResult.system_exchange_rate),
        bank_coa_id: bankTxnResult.bank_coa_id,
        bank_currency_id: bankTxnResult.bank_currency_id,
        resolved_contact_id: contactResolution.contact_id,
        resolved_contact_type: contactResolution.contact_type,
      };

      const bankLeg = bankLegs[0];

      // The bank leg must use the same Chart of Account as the bank account
      if (bankLeg.coa_id !== bankTxn.bank_coa_id) {
        throw new AppError(
          `Bank leg COA (${bankLeg.coa_id}) does not match bank account COA (${bankTxn.bank_coa_id})`,
        );
      }

      // The bank leg must use the same currency as the bank account
      if (bankLeg.source_currency_id !== bankTxn.bank_currency_id) {
        throw new AppError(
          `Bank leg currency (${bankLeg.source_currency_id}) does not match bank account currency (${bankTxn.bank_currency_id})`,
        );
      }

      // The bank leg amount must match the bank transaction amount
      // Note: We check magnitude only (signs may differ for debit/credit)
      const bankValidation = validateBankLegAmount({
        entries: [bankLeg],
        bankTransactionAmount: bankTxn.amount,
      });

      if (!bankValidation.valid) {
        throw new AppError(bankValidation.error!);
      }
    }

    // STEP 6: CONTACT & PROJECT RESOLUTION
    // Contacts and projects can be specified at the transaction level or entry level.
    // If no transaction-level contact is provided, bank transactions snapshot the
    // current contact resolution row rather than reading contact data from the raw
    // bank transaction record.
    // Then we validate that all referenced contacts and projects exist and belong to the company

    // Resolve transaction-level contact (cascades from bank transaction if not provided)
    const [transactionContactId, transactionContactType] = (() => {
      let id = ledgerTx.contact_id ?? null;
      let type = ledgerTx.contact_type ?? null;

      // If no contact was specified, snapshot the current bank transaction resolution.
      if (!id && bankTxn?.resolved_contact_id) {
        id = bankTxn.resolved_contact_id;
        type = bankTxn.resolved_contact_type;
      }

      return [id, type];
    })();

    // Collect all contact and project IDs that need validation
    // (from both transaction level and entry level)
    const allContactIds = new Set<string>();
    const allProjectIds = new Set<string>();

    if (transactionContactId) {
      allContactIds.add(transactionContactId);
    }

    for (const e of entries) {
      if (e.contact_id) {
        allContactIds.add(e.contact_id);
      }

      if (e.project_id) {
        allProjectIds.add(e.project_id);
      }
    }

    // Validate that all referenced contacts and projects exist and belong to this company
    // This prevents orphaned references and ensures data integrity
    const contactIds = Array.from(allContactIds);
    const projectIds = Array.from(allProjectIds);

    await fetchLookupMap({
      table: 'contacts',
      ids: contactIds,
      companyId: companyUUID,
      txn,
    });
    await fetchLookupMap({
      table: 'projects',
      ids: projectIds,
      companyId: companyUUID,
      txn,
    });

    // STEP 7: FOREIGN EXCHANGE RATE RESOLUTION
    // All entries in a ledger transaction must use the same source currency
    // If that currency differs from the reporting currency, we need exchange rates
    // This function:
    // - Determines the system exchange rate (from rate tables or bank transaction)
    // - Handles custom exchange rates (if provided by user)
    // - Validates rates are reasonable
    // - Returns warnings for suspicious rates (but doesn't block the transaction)
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

    // Store FX warnings to return to the caller
    if (fxWarnings.length > 0) {
      result.warnings = result.warnings || {};
      result.warnings.fxWarnings = fxWarnings.join(', ');
    }

    // STEP 8: CONSTRAINT VALIDATION
    // The constraint system enforces accounting rules:
    // - Debits must equal credits (double-entry bookkeeping)
    // - All COAs must exist and be active
    // - Fiscal periods must be open (not locked or closed)
    // - Exchange rates must be valid
    // - Projects must exist
    // - And more...
    // We transform entries into the format expected by the constraint system
    const constraintEntries = entries.map((entry, index) => {
      return {
        id: `${index}`,
        amount: entry.source_amount,
        coa_id: entry.coa_id,
        fs_date: toYMD(entry.fs_date),
        project_id: entry.project_id ?? null,
        is_bank_leg: entry.is_bank_leg ?? false,
        system_exchange_rate: systemExRate,
        custom_exchange_rate: customExRate,
      };
    });

    const constraintResult = await runConstraints(
      {
        companyUUID,
        entries: constraintEntries,
        transaction_date: toYMD(ledgerTx.transaction_date),
      },
      txn, // Pass the transaction to avoid deadlocks and ensure consistency
    );

    // If constraints fail, we cannot proceed - the transaction violates accounting rules
    if (!constraintResult.isValid) {
      const errorMessages = constraintResult.errors.map((e) => e.message);

      logger.error(
        {
          companyId: companyUUID,
          errors: errorMessages,
          warnings: constraintResult.warnings,
        },
        'Ledger transaction creation failed due to constraint errors',
      );
      throw new AppError(
        errorMessages.join('\n'),
        constraintResult.warnings,
        true,
      );
    }

    // Store constraint warnings (non-blocking issues)
    if (constraintResult.warnings.length > 0) {
      result.warnings = result.warnings || {};
      result.warnings.constraintWarnings = constraintResult.warnings
        .map((w) => w.message)
        .join('\n');
    }

    // STEP 9: CREATE LEDGER TRANSACTION RECORD
    // Create the main ledger transaction record (the "header" of the journal entry)
    // This links all the entries together and stores transaction-level metadata
    const ledgerTransaction: NewLedgerTransaction = {
      ...ledgerTx,
      contact_id: transactionContactId,
      contact_type: transactionContactType,
      company_id: companyUUID,
      created_by_id: userId,
      updated_by_id: userId,
    };

    const [row] = await txn('ledger_transactions')
      .insert({
        ...(ledgerTransactionIdOverride
          ? { id: ledgerTransactionIdOverride }
          : {}),
        ...ledgerTransaction,
      })
      .returning('id');
    const ledgerTransactionId = String(row.id);
    result.ledgerTransactionId = ledgerTransactionId;

    // STEP 10: MONETARY ENTRY DETERMINATION & FX POSITION TRACKING
    // Determine which entries are "monetary" (subject to FX revaluation)
    // Monetary accounts (like cash, receivables, payables) need FX tracking
    // Non-monetary accounts (like fixed assets) use historical cost
    const monetaryResult = await determineMonetaryEntries({
      entries,
      companyId: companyUUID,
      reportingCurrencyId,
      trx: txn,
    });
    const monetaryMap = monetaryResult.monetaryMap;

    // Generate FX transaction ID for monetary entries in foreign currency
    // This ID groups related entries (initial posting, revaluations, settlements)
    // Even if FX tracking is disabled, we still generate the ID for metadata
    let fxTransactionId: string | null = null;
    if (
      sourceTxCurrencyId !== reportingCurrencyId &&
      monetaryResult.monetaryEntries.length > 0
    ) {
      // All monetary entries in the same transaction share the same FX transaction ID
      fxTransactionId = makeFxTransactionId({
        type: 'LEDGER_TX',
        ledgerTransactionId,
      });

      // Only create/update fx_positions table if the company has FX tracking enabled
      // This table tracks foreign currency exposures for revaluation
      if (trackFxPositions) {
        // For each monetary entry, create or update the FX position
        for (const {
          index,
          entry: _baseEntry,
        } of monetaryResult.monetaryEntries) {
          const fullEntry = entries[index]!;
          // Convert the foreign currency amount to reporting currency
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

    // STEP 11: BUILD & INSERT LEDGER ENTRIES
    // Transform the input entries into database records
    // Apply FX rates, contact resolution, and monetary flags
    const resolvedEntries = entries.map((entry) => ({
      ...entry,
      contact_id: entry.contact_id ? entry.contact_id : transactionContactId,
      contact_type: entry.contact_type
        ? entry.contact_type
        : transactionContactType,
    }));
    const entriesToInsert: NewLedgerEntry[] = resolvedEntries.map(
      (entry, index) => {
        return {
          ...entry,
          company_id: companyUUID,
          ledger_transaction_id: ledgerTransactionId,
          is_bank_leg: entry.is_bank_leg ?? false,
          system_exchange_rate: systemExRate,
          custom_exchange_rate: customExRate,
          is_monetary: monetaryMap.get(index) ?? false,
          fx_transaction_id: monetaryMap.get(index) ? fxTransactionId : null,
          updated_by_id: userId,
        };
      },
    );

    // Insert all entries into the database
    await txn('ledger_entries').insert(entriesToInsert);

    // STEP 12: ENQUEUE BALANCE RECALCULATION
    // After inserting entries, we need to recalculate account balances
    // This is done asynchronously via a job queue for performance
    // We enqueue one job per affected Chart of Account
    for (const [coaId, range] of bounds) {
      await enqueueGLBalance({
        companyId: companyUUID,
        coaId,
        recalcFrom: range.min,
        triggeredBy: 'ledger_entry',
      });
    }

    // STEP 13: CREATE LEDGER AUDIT LOG
    // Automatically create audit log entry for all ledger transactions
    // This ensures complete audit trail regardless of how the transaction was created
    try {
      const systemUser = await isSystemUser(userId, txn);
      const eventType =
        systemUser && autoPost ? 'ledger_posted_auto' : 'ledger_posted_manual';

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
        },
        'Failed to create ledger audit log, but ledger transaction was created',
      );
    }

    // STEP 14: LINK BACK TO SOURCE ENTITIES
    // Automatically link ledger transaction back to source entity (bank_transaction or journal_batch)
    // This ensures bidirectional relationship for traceability
    try {
      if (isBankTransaction && sourceTxId) {
        // Link back to bank transaction
        await txn('bank_transactions')
          .where({ id: sourceTxId })
          .update({ ledger_transaction_id: ledgerTransactionId });

        logger.debug(
          {
            bankTransactionId: sourceTxId,
            ledgerTransactionId,
          },
          'Linked bank transaction to ledger transaction',
        );
      } else if (
        ledgerTx.transaction_source === 'manual_journal' &&
        sourceTxId
      ) {
        // Assume journal and Link back to journal batch
        await txn('journal_batches')
          .where({ id: sourceTxId })
          .update({ ledger_transaction_id: ledgerTransactionId });

        logger.debug(
          {
            journalBatchId: sourceTxId,
            ledgerTransactionId,
          },
          'Linked journal batch to ledger transaction',
        );
      }
    } catch (error) {
      // Linking failure should not block ledger transaction creation
      // Log warning but continue
      logger.warn(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          ledgerTransactionId,
          sourceTransactionId: sourceTxId,
          transactionSource: ledgerTx.transaction_source,
        },
        'Failed to link source entity to ledger transaction, but ledger transaction was created',
      );
    }

    // // Return success with transaction details and any warnings
    // return successResponse('Ledger transaction created', {
    //   ledgerTransactionId,
    //   affectedCOAs: bounds.size,
    //   dateRange: { min: minYMD, max: maxYMD },
    //   warnings:
    //     Object.keys(result.warnings).length > 0 ? result.warnings : undefined,
    // });

    // Set final result values
    result.ledgerTransactionId = ledgerTransactionId;
    result.affectedCOAs = bounds.size;
    result.dateRange = { min: minYMD, max: maxYMD };

    // Only include warnings if there are any
    if (result.warnings && Object.keys(result.warnings).length > 0) {
      // Keep warnings as is
    } else {
      result.warnings = undefined;
    }

    return result;
  };

  // EXECUTE TRANSACTION
  // If an existing transaction was provided, use it (for nested transactions)
  // Otherwise, create a new transaction (auto-commits on success, auto-rolls back on error)
  try {
    if (trx) {
      const result = await exec(trx);
      return successResponse('Ledger transaction created', result);
    }

    const maxAttempts = 3;
    let attempt = 0;
    while (attempt < maxAttempts) {
      try {
        const result = await knexClient.transaction(exec);
        return successResponse('Ledger transaction created', result);
      } catch (err) {
        attempt += 1;
        if (!isDeadlockError(err) || attempt >= maxAttempts) {
          throw err;
        }
        // Simple exponential backoff to reduce contention.
        await sleep(25 * attempt * attempt);
      }
    }

    // Unreachable, but keeps TS happy.
    throw new Error('Failed to create ledger transaction after retries');
  } catch (err) {
    // Log the error for debugging and monitoring
    logger.error(
      {
        error: err,
        companyId,
        userId,
        transactionSource: data.transaction_source,
      },
      'Failed to create ledger transaction',
    );
    // If we're in an existing transaction, re-throw (let caller handle rollback)
    // Otherwise, return an error response
    if (trx) {
      throw new AppError(
        `Failed to create ledger transaction: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      );
    }

    return errorResponse(
      'Failed to create ledger transaction',
      err instanceof Error ? err.message : 'Unknown error',
    );
  }
}

/**
 * Get ledger transaction by ID
 */
export async function getLedgerTransaction(
  id: string,
  trx?: Knex.Transaction,
): Promise<LedgerTransaction | null> {
  const client = trx || knexClient;

  const result = await client('ledger_transactions')
    .where('id', id)
    .where('status', 'posted')
    .first();

  return result || null;
}

/**
 * Get ledger entries for a transaction
 */
export async function getLedgerEntriesForTransaction(
  ledgerTransactionId: string,
  trx?: Knex.Transaction,
): Promise<LedgerEntry[]> {
  const client = trx || knexClient;

  const entries = await client('ledger_entries as le')
    .leftJoin('coa', 'le.coa_id', 'coa.id')
    .leftJoin('contacts', 'le.contact_id', 'contacts.id')
    .leftJoin('projects', 'le.project_id', 'projects.id')
    .where('le.ledger_transaction_id', ledgerTransactionId)
    .orderBy('le.created_at', 'asc')
    .select(
      'le.*',
      'coa.name as coa_name',
      'contacts.display_name as contact_name',
      'projects.name as project_name',
    );

  return entries;
}

/**
 * Get ledger transactions with their entries
 *
 * This function retrieves ledger transactions and their associated entries
 * by either ledger transaction ID or source transaction ID. It supports
 * filtering out auto-generated fields (database + computed fields).
 *
 * @param ledgerTransactionIds - Optional array of ledger transaction IDs
 * @param sourceTransactionIds - Optional array of source transaction IDs
 * @param excludeAutoGeneratedFields - If true, excludes auto-generated fields from results
 * @param trx - Optional database transaction
 * @returns Array of ledger transactions with their entries
 * @throws AppError if both or neither ID arrays are provided
 */
export async function getLedgerTransactionsWithEntries({
  ledgerTransactionIds,
  sourceTransactionIds,
  excludeAutoGeneratedFields = false,
  trx,
}: {
  ledgerTransactionIds?: string[];
  sourceTransactionIds?: string[];
  excludeAutoGeneratedFields?: boolean;
  trx?: Knex.Transaction;
}): Promise<
  Array<LedgerTransactionWithEntries | LedgerTransactionWithEntriesFiltered>
> {
  const client = trx || knexClient;

  const hasLedgerIds =
    Array.isArray(ledgerTransactionIds) && ledgerTransactionIds.length > 0;
  const hasSourceIds =
    Array.isArray(sourceTransactionIds) && sourceTransactionIds.length > 0;

  if (hasLedgerIds && hasSourceIds) {
    throw new AppError(
      'Cannot provide both ledgerTransactionIds and sourceTransactionIds.',
    );
  }

  if (!hasLedgerIds && !hasSourceIds) {
    throw new AppError(
      'Must provide either ledgerTransactionIds or sourceTransactionIds.',
    );
  }

  const idsToUse = hasLedgerIds ? ledgerTransactionIds! : sourceTransactionIds!;
  if (idsToUse.length === 0) {
    return [];
  }

  const transactions: LedgerTransaction[] = await client('ledger_transactions')
    .where('status', 'posted')
    .modify((qb) => {
      if (hasLedgerIds) qb.whereIn('id', idsToUse);
      else qb.whereIn('source_transaction_id', idsToUse);
    })
    .orderBy('created_at', 'asc');

  if (!transactions.length) return [];

  const transactionIdsFetched = transactions.map((t) => t.id);

  const entries: LedgerEntry[] = await client('ledger_entries as le')
    .leftJoin('coa', 'le.coa_id', 'coa.id')
    .leftJoin('contacts', 'le.contact_id', 'contacts.id')
    .leftJoin('projects', 'le.project_id', 'projects.id')
    .whereIn('le.ledger_transaction_id', transactionIdsFetched)
    .orderBy('le.created_at', 'asc')
    .select(
      'le.*',
      'coa.name as coa_name',
      'contacts.display_name as contact_name',
      'projects.name as project_name',
    );

  const entriesByTransactionId = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const list = entriesByTransactionId.get(entry.ledger_transaction_id) || [];
    list.push(entry);
    entriesByTransactionId.set(entry.ledger_transaction_id, list);
  }

  return transactions.map((transaction) => {
    const transactionEntries = entriesByTransactionId.get(transaction.id) || [];

    if (excludeAutoGeneratedFields) {
      const { created_at, updated_at, ...t } = transaction;
      const filteredEntries = transactionEntries.map(
        ({
          created_at,
          updated_at,
          absolute_source_amount,
          amount,
          absolute_amount,
          transaction_side,
          search_text,
          ...e
        }) => e,
      );
      return {
        ...t,
        entries: filteredEntries,
      } as LedgerTransactionWithEntriesFiltered;
    }

    return {
      ...transaction,
      entries: transactionEntries,
    } as LedgerTransactionWithEntries;
  });
}

/**
 * Update metadata fields on an existing ledger transaction
 *
 * This function updates non-accounting fields (description, reference, notes, etc.)
 * on an existing ledger transaction and its entries without creating a new version.
 *
 * Key Features:
 * - Updates only metadata fields (no accounting impact)
 * - No balance recalculation needed
 * - Logs changes to audit trail
 * - Validates that transaction exists and is not deleted
 *
 * @param ledgerTransactionId - ID of existing ledger transaction to update
 * @param updates - Metadata updates for transaction and/or entries
 * @param userId - User making the update
 * @param trx - Database transaction
 * @returns Success response with ledger transaction ID
 */
export async function updateLedgerMetadata({
  ledgerTransactionId,
  updates,
  userId,
  trx,
}: {
  ledgerTransactionId: string;
  updates: {
    transaction?: {
      description?: string | null;
      reference?: string | null;
      note?: string | null;
      metadata?: Record<string, unknown>;
    };
    entries?: Array<{
      entryId: string;
      description?: string | null;
      reference?: string | null;
      metadata?: Record<string, unknown>;
      human_reviewed?: boolean;
      review_notes?: string | null;
      reviewed_by_id?: string | null;
      reviewed_at?: Date | null;
    }>;
  };
  userId: string;
  trx: Knex.Transaction;
}): Promise<ApiResponse<{ ledgerTransactionId: string }>> {
  try {
    // 1. Validate transaction exists and is not deleted
    const existingTxn = await trx('ledger_transactions')
      .where({ id: ledgerTransactionId, status: 'posted' })
      .first();

    if (!existingTxn) {
      return errorResponse(
        `Ledger transaction not found or deleted: ${ledgerTransactionId}`,
      );
    }

    const changedFields: string[] = [];
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    // 2. Update transaction-level metadata if provided
    if (updates.transaction) {
      const txnUpdates: Record<string, unknown> = {
        updated_at: new Date(),
        updated_by_id: userId,
      };

      for (const [field, value] of Object.entries(updates.transaction)) {
        if (value !== undefined) {
          txnUpdates[field] = value;
          changedFields.push(`transaction.${field}`);
          oldValues[`transaction.${field}`] = existingTxn[field];
          newValues[`transaction.${field}`] = value;
        }
      }

      await trx('ledger_transactions')
        .where({ id: ledgerTransactionId })
        .update(txnUpdates);
    }

    // 3. Update entry-level metadata if provided
    if (updates.entries && updates.entries.length > 0) {
      for (const entryUpdate of updates.entries) {
        const { entryId, ...entryFields } = entryUpdate;

        const existingEntry = await trx('ledger_entries')
          .where({
            id: entryId,
            ledger_transaction_id: ledgerTransactionId,
          })
          .first();

        if (!existingEntry) {
          logger.warn(
            { entryId, ledgerTransactionId },
            'Ledger entry not found for metadata update, skipping',
          );
          continue;
        }

        const entryUpdates: Record<string, unknown> = {
          updated_at: new Date(),
          updated_by_id: userId,
        };

        if (entryFields.review_notes != null) {
          entryFields.human_reviewed ??= true;
          entryFields.reviewed_by_id ??= userId;
          entryFields.reviewed_at ??= new Date();
        } else if (
          entryFields.human_reviewed === true &&
          !existingEntry.human_reviewed
        ) {
          entryFields.reviewed_by_id ??= userId;
          entryFields.reviewed_at ??= new Date();
        }

        for (const [field, value] of Object.entries(entryFields)) {
          if (value !== undefined) {
            entryUpdates[field] = value;
            changedFields.push(`entry.${entryId}.${field}`);
            oldValues[`entry.${entryId}.${field}`] = existingEntry[field];
            newValues[`entry.${entryId}.${field}`] = value;
          }
        }

        await trx('ledger_entries')
          .where({
            id: entryId,
            ledger_transaction_id: ledgerTransactionId,
          })
          .update(entryUpdates);
      }
    }

    // 4. Create audit log entry
    try {
      await logLedgerEvent({
        ledgerTransactionId,
        actorId: userId,
        actorType: 'user',
        eventType: 'metadata_updated',
        categorizationTaskId: null,
        comment: 'Updated non-accounting metadata',
        metadata: {
          updated_fields: changedFields,
          old_values: oldValues,
          new_values: newValues,
        },
        trx,
      });
    } catch (error) {
      // Audit log failure should not block metadata update
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          ledgerTransactionId,
        },
        'Failed to create audit log for metadata update, but update succeeded',
      );
    }

    return successResponse('Ledger metadata updated', {
      ledgerTransactionId,
    });
  } catch (err) {
    logger.error(
      {
        error: err,
        ledgerTransactionId,
        userId,
      },
      'Failed to update ledger metadata',
    );

    return errorResponse(
      'Failed to update ledger metadata',
      err instanceof Error ? err.message : 'Unknown error',
    );
  }
}

/**
 * Supersede an existing ledger transaction with a new version
 *
 * This function replaces an existing ledger transaction when accounting changes
 * are made (COA changes, amount changes, splits, etc.). The old transaction is
 * soft-deleted and a new one is created.
 *
 * Key Features:
 * - Soft-deletes old transaction (preserves audit trail)
 * - Creates new transaction via createLedgerRecord
 * - Logs both supersession and creation events
 * - Triggers balance recalculation for both old and new dates/accounts
 * - Preserves bank leg fields for bank transactions (immutable)
 * - Validates fiscal period locks
 *
 * @param oldLedgerTransactionId - ID of transaction to supersede
 * @param newData - Complete data for new transaction
 * @param companyId - Company ID
 * @param userId - User making the change
 * @param trx - Database transaction
 * @returns Success response with both old and new transaction IDs
 */
export async function supersedeLedgerTransaction({
  oldLedgerTransactionId,
  newData,
  companyId,
  userId,
  trx,
}: {
  oldLedgerTransactionId: string;
  newData: NewLedgerTransactionData;
  companyId: string;
  userId: string;
  trx: Knex.Transaction;
}): Promise<
  ApiResponse<{
    oldLedgerTransactionId: string;
    newLedgerTransactionId: string;
    warnings?: Record<string, string>;
  }>
> {
  try {
    // 1. Fetch old ledger transaction and entries
    const oldTxn = await trx('ledger_transactions')
      .where({ id: oldLedgerTransactionId, status: 'posted' })
      .first();

    if (!oldTxn) {
      return errorResponse(
        `Ledger transaction not found or already deleted: ${oldLedgerTransactionId}`,
      );
    }

    const oldEntries = await trx('ledger_entries')
      .where({ ledger_transaction_id: oldLedgerTransactionId })
      .orderBy('created_at', 'asc');

    if (oldEntries.length === 0) {
      return errorResponse(
        `No ledger entries found for transaction: ${oldLedgerTransactionId}`,
      );
    }

    // 2. Validate fiscal period lock on old transaction date
    // TODO: Implement fiscal period lock check when that system is ready
    // For now, we'll allow supersession (period lock enforcement is future work)

    // 3. Detect what fields changed for audit purposes
    const changedFields: string[] = [];

    // Compare entries to detect changes
    const proposedEntries = newData.transactions;
    if (proposedEntries.length !== oldEntries.length) {
      changedFields.push('entry_count');
    }

    for (
      let i = 0;
      i < Math.min(oldEntries.length, proposedEntries.length);
      i++
    ) {
      const oldEntry = oldEntries[i];
      const newEntry = proposedEntries[i];

      if (!oldEntry || !newEntry) continue;

      if (oldEntry.coa_id !== newEntry.coa_id)
        changedFields.push(`entry_${i}_coa_id`);
      if (Math.abs(oldEntry.source_amount - newEntry.source_amount) > 0.01) {
        changedFields.push(`entry_${i}_source_amount`);
      }
      if (oldEntry.contact_id !== newEntry.contact_id)
        changedFields.push(`entry_${i}_contact_id`);
      if (oldEntry.project_id !== newEntry.project_id)
        changedFields.push(`entry_${i}_project_id`);
    }

    const nextLedgerTransactionIdResult = await trx.raw<{
      rows: Array<{ id: string }>;
    }>('SELECT uuid_generate_v7() AS id');
    const newLedgerTransactionId = String(
      nextLedgerTransactionIdResult.rows[0]!.id,
    );

    // 4. Supersede old transaction before creating the replacement. The
    // self-reference is deferrable, so the replacement can be inserted later
    // in this same database transaction.
    await trx('ledger_transactions')
      .where({ id: oldLedgerTransactionId })
      .update({
        status: 'superseded',
        superseded_by_ledger_transaction_id: newLedgerTransactionId,
        superseded_at: new Date(),
        superseded_by_id: userId,
        updated_at: new Date(),
        updated_by_id: userId,
      });

    logger.debug(
      { oldLedgerTransactionId },
      'Superseded old ledger transaction',
    );

    // 5. Trigger balance recalculation for old entries
    // Get unique COAs and date range from old entries
    const oldCoaIds = new Set(oldEntries.map((e) => e.coa_id));
    const oldDates = oldEntries.map((e) => toYMD(e.fs_date));
    const oldMinDate = oldDates.reduce(
      (min, d) => (d < min ? d : min),
      oldDates[0]!,
    );

    for (const coaId of oldCoaIds) {
      await enqueueGLBalance({
        companyId,
        coaId,
        recalcFrom: oldMinDate,
        triggeredBy: 'supersession',
      });
    }

    // 7. Create new ledger transaction
    const createResult = await createLedgerRecord({
      data: newData,
      autoPost: false, // This is a user edit, not an auto-post
      companyId,
      userId,
      trx,
      ledgerTransactionIdOverride: newLedgerTransactionId,
    });

    if (!createResult.success) {
      // Rollback will happen automatically due to transaction
      return errorResponse(
        'Failed to create new ledger transaction after supersession',
        createResult.error,
      );
    }

    logger.debug(
      {
        oldLedgerTransactionId,
        newLedgerTransactionId,
      },
      'Created new ledger transaction to replace old one',
    );

    // 8. Log supersession event on old transaction
    try {
      await logLedgerEvent({
        ledgerTransactionId: oldLedgerTransactionId,
        actorId: userId,
        actorType: 'user',
        eventType: 'ledger_superseded',
        categorizationTaskId: null,
        comment: 'Transaction superseded due to accounting changes',
        metadata: {
          superseded_by_ledger_id: newLedgerTransactionId,
          changed_fields: changedFields,
          reason: 'user_edit',
        },
        trx,
      });
    } catch (error) {
      // Audit log failure should not block supersession
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          oldLedgerTransactionId,
          newLedgerTransactionId,
        },
        'Failed to create audit log for supersession, but supersession succeeded',
      );
    }

    // Note: The new transaction's creation is already logged by createLedgerRecord

    return successResponse('Ledger transaction superseded', {
      oldLedgerTransactionId,
      newLedgerTransactionId,
      warnings: createResult.data?.warnings,
    });
  } catch (err) {
    logger.error(
      {
        error: err,
        oldLedgerTransactionId,
        companyId,
        userId,
      },
      'Failed to supersede ledger transaction',
    );

    return errorResponse(
      'Failed to supersede ledger transaction',
      err instanceof Error ? err.message : 'Unknown error',
    );
  }
}

/**
 * Update or create ledger transactions intelligently
 *
 * This is the main orchestrator function that handles both creating new ledger transactions
 * and updating existing ones. It intelligently routes to the appropriate handler based on:
 * - Whether a ledger transaction already exists
 * - What fields are being changed (metadata vs accounting)
 *
 * Key Features:
 * - Creates new ledger transactions from unresolved bank transactions or candidates
 * - Updates metadata in-place for non-accounting changes
 * - Supersedes transactions for accounting changes
 * - Supports batch processing
 * - Maintains bank leg immutability
 * - Triggers appropriate balance recalculations
 * - Complete audit trail
 *
 * @param data - Array of ledger transaction data (new or updates)
 * @param companyId - Company ID
 * @param userId - User making the changes
 * @param trx - Optional database transaction
 * @returns Array of results for each transaction
 */
export async function updateOrCreateLedger({
  data,
  companyId,
  userId,
  trx,
}: {
  data: Partial<NewLedgerTransactionData>[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<
    {
      operation: 'created' | 'updated_metadata' | 'superseded';
      ledgerTransactionId: string;
      oldLedgerTransactionId?: string;
      warnings?: Record<string, string>;
    }[]
  >
> {
  /**
   * Still a little bit confused on how to approach this but let me doc my thoughs
   *
   * Focusing on bank transactions
   * In the UI, user likely sees either of three things by default:
   * 1. A bank transaction that is yet to be resolved by rule or ML or was not resolvable
   * 2. Candidates that have not been reviewed or posted to the ledger
   * 3. Auto categorized transactions that have yet been reviewed
   * 3b. They could also filter to see already posted and reviewed transactions
   * -- All they see are the non bank legs
   *
   * UI has two main modes: review and auto save mode
   *
   * They are likely to want to do the following:
   * For bank transactions:
   * 1. Categorize it, or update it and categorize it. For this case, we do not send request to the API until an account is selected
   * // Can't think of anything else they might want to do here; maybe update after they select an account and that has been persisted - but then that's no longer a bank transaction
   *
   * For candidates that have not been reviewed or posted to the ledger:
   * 1. Update some fields that have no accounting implication [Description, Reference, Contact, Attachments, Tags, Notes]
   * 2. Update fields that have accounting implications [COA, Projects (for people using project accounting), Date, Exchange Rate, Splits (which affect COAs and amounts)]
   * 3. Accept the recommended account/category without changes
   *
   * For auto categorized transactions that have yet been reviewed:
   * 1. I think same things as we have in candidates, except we have to remember to add a log to task events to indicate that this was rejected if it was or if accounts were changed
   * 2. Make changes to transactions that are already split
   *
   * For manual journals - This kind of issue does not really exist
   *
   * Some things to keep in mind. Will add more as they become clearer
   * - Any change to fields with accounting implications MUST create a new ledger transaction and mark the old one as deleted
   * - Any change to fields without accounting implications can be updated in place
   * - All changes must be logged to ledger_audit_logs
   * - What we need to ensure during autosave is the reasonability of the change in the event of polling continuously.. but that's a frontend thing
   *
   * How do we approach this in code making sure this function routes to the right place when needed?
   * This might be the single most important part of this application and it's important to get right
   *
   * For each transaction
   * // Not sure if it helps to group by source_transaction_id
   * // Not sure if we should let this function infer bank legs on its own. Currently the function signature accepts full transaction obj so we'll keep it like this for now
   * Check if this is a transaction that already exists on the ledger
   * If ledger does not exist, check the source to see if it exists on the source
   * If source does not exist, return error
   * If source exists, and not on ledger, call createLedgerRecord or createLedgerRecordBatch depending on the number of transactions
   *
   * If ledger exists, check the fields that are being updated and update them
   * Perhaps we should create a function and call it updateLedgerRecord to handle this so this function is just an interface or orchestrator
   *
   * TO SOLVE: Implement a flexible function to handle both creating new ledger transactions and updating existing ones, with different behaviors based on what fields are being modified and whether a ledger transaction already exists for the source.
   *
   */

  const exec = async (
    txn: Knex.Transaction,
  ): Promise<
    {
      operation: 'created' | 'updated_metadata' | 'superseded';
      ledgerTransactionId: string;
      oldLedgerTransactionId?: string;
      warnings?: Record<string, string>;
    }[]
  > => {
    const results: {
      operation: 'created' | 'updated_metadata' | 'superseded';
      ledgerTransactionId: string;
      oldLedgerTransactionId?: string;
      warnings?: Record<string, string>;
    }[] = [];

    // Resolve company UUID once
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

    // Process each transaction
    for (const txnData of data) {
      // STEP 1: Validate required fields
      if (!txnData.transaction_source) {
        throw new AppError('transaction_source is required');
      }

      const isBankTransaction =
        txnData.transaction_source === 'bank_transaction';
      const isManualJournal = txnData.transaction_source === 'manual_journal';

      if (isBankTransaction && !txnData.source_transaction_id) {
        throw new AppError(
          'Bank transaction ID is required for creating ledger transactions from bank transactions',
        );
      }

      // STEP 2: Find existing ledger transaction
      // Use ledger_transactions as single source of truth, with optional verification
      let existingLedgerTransactionId: string | null = null;
      let existingLedgerTxn: LedgerTransaction | null = null;

      if (txnData.source_transaction_id) {
        // Build query to fetch Ledger ID and (optionally) the Bank Link ID in one go
        let query = txn('ledger_transactions as lt')
          .select('lt.id as actualLedgerId', 'lt.*')
          .where({
            'lt.source_transaction_id': txnData.source_transaction_id,
            'lt.status': 'posted',
          });

        if (isBankTransaction) {
          query = query
            .leftJoin(
              'bank_transactions as bt',
              'bt.id',
              'lt.source_transaction_id',
            )
            .select('bt.ledger_transaction_id as linkedLedgerId');
        }

        const result = await query.first();

        if (
          isBankTransaction &&
          result?.actualLedgerId !== result?.linkedLedgerId
        ) {
          throw new AppError('Bidirectional link mismatch detected');
        }

        // Assign the ID (if found)
        existingLedgerTransactionId = result?.actualLedgerId ?? null;
        existingLedgerTxn = { ...result, id: result?.actualLedgerId ?? null };

        // For manual journals, we could add similar verification with journal_batches
        // if needed in the future (currently journal_batches.ledger_transaction_id is
        // set in createLedgerRecord, so verification would be similar)
      }

      // STEP 3: Route to appropriate handler
      if (!existingLedgerTransactionId) {
        // ROUTE A: CREATE NEW LEDGER TRANSACTION
        logger.debug(
          { sourceTransactionId: txnData.source_transaction_id },
          'No existing ledger transaction found, creating new one',
        );

        const createResult = await createLedgerRecord({
          data: txnData as NewLedgerTransactionData,
          autoPost: false, // This is explicit user action
          companyId: companyUUID,
          userId,
          trx: txn,
        });

        if (!createResult.success) {
          const errorMessage =
            typeof createResult.error === 'object'
              ? JSON.stringify(createResult.error, null, 2)
              : String(createResult.error);

          throw new AppError(
            `Failed to create ledger transaction: ${errorMessage}`,
            createResult,
          );
        }

        results.push({
          operation: 'created',
          ledgerTransactionId: createResult.data!.ledgerTransactionId,
          warnings: createResult.data?.warnings,
        });
      } else {
        // There's an existing ledger transaction - need to determine if update or supersede
        logger.debug(
          { existingLedgerTransactionId },
          'Existing ledger transaction found, analyzing changes',
        );

        // Fetch existing transaction and entries
        const existingTxn = existingLedgerTxn;
        if (!existingTxn) {
          throw new AppError(
            `Ledger transaction not found or deleted: ${existingLedgerTransactionId}`,
          );
        }

        const existingEntries = await txn('ledger_entries')
          .where({ ledger_transaction_id: existingLedgerTransactionId })
          .orderBy('created_at', 'asc');

        // EARLY VALIDATIONS (before change detection)

        // VALIDATION 1: Transaction-level immutable fields must not be modified
        // These fields come from the source (bank_transaction/journal_batch) and are set once
        const immutableTransactionFields = [
          'transaction_date',
          'transaction_source',
          'categorization_source',
          'contact_id',
          'contact_type',
          'source_transaction_id',
          'source_transaction_date',
          'source_transaction_amount',
          'source_transaction_currency_id',
          'categorization_candidate_id',
        ] as const;

        const immutableFieldViolations = immutableTransactionFields.filter(
          (field) => {
            if (!(field in txnData)) return false;

            const proposedValue = txnData[field as keyof typeof txnData];
            const existingValue =
              existingTxn[field as keyof typeof existingTxn];

            // Handle date fields explicitly.
            if (
              field === 'transaction_date' ||
              field === 'source_transaction_date'
            ) {
              // Normalize both to YMD strings (handles Date objects, YMD strings, or null)
              const proposedYMD = normalizeDateForComparison(proposedValue);
              const existingYMD = normalizeDateForComparison(existingValue);
              return proposedYMD !== existingYMD;
            }

            // Primitive comparison for non-date fields
            return proposedValue !== existingValue;
          },
        );

        if (immutableFieldViolations.length > 0) {
          throw new AppError(
            `Cannot modify immutable transaction-level fields: ${immutableFieldViolations.join(', ')}. These fields are set at creation from the source transaction and cannot be changed.`,
            {
              violatedFields: immutableFieldViolations,
              existingLedgerTransactionId,
            },
          );
        }

        // VALIDATION 2: For bank transactions, all entries must have same source_currency_id as transaction
        // Bank transactions are denominated in a single currency (the bank account's currency)
        if (isBankTransaction && txnData.transactions) {
          const expectedCurrencyId = existingTxn.source_transaction_currency_id;
          const currencyViolations = txnData.transactions
            .map((entry, index) => ({ entry, index }))
            .filter(
              ({ entry }) =>
                entry.source_currency_id &&
                entry.source_currency_id !== expectedCurrencyId,
            );

          if (currencyViolations.length > 0) {
            throw new AppError(
              `All entries in a bank transaction must use the bank account's currency (${expectedCurrencyId})`,
              {
                violatedEntries: currencyViolations.map((v) => ({
                  entryIndex: v.index,
                  providedCurrencyId: v.entry.source_currency_id,
                  expectedCurrencyId,
                })),
              },
            );
          }
        }

        // Detect what changed
        const changes = detectChangedFields({
          existing: existingTxn,
          existingEntries,
          proposed: txnData,
          isBankTransaction,
        });

        // Check for bank leg violations first
        if (changes.bankLegViolation) {
          throw new AppError(changes.bankLegViolation.message, {
            entryIndex: changes.bankLegViolation.entryIndex,
            violatedFields: changes.bankLegViolation.violatedFields,
          });
        }

        if (!changes.hasChanges) {
          // No changes detected - just return the existing transaction
          logger.debug(
            { existingLedgerTransactionId },
            'No changes detected, returning existing transaction',
          );

          results.push({
            operation: 'updated_metadata', // Technically no update, but closest semantic
            ledgerTransactionId: existingLedgerTransactionId,
          });
        } else if (changes.isMetadataOnly) {
          // ROUTE B: UPDATE METADATA IN-PLACE
          logger.debug(
            {
              existingLedgerTransactionId,
              changedFields: Array.from(changes.transactionChanges),
            },
            'Metadata-only changes detected, updating in-place',
          );

          // Build updates object
          const updates: {
            transaction?: Record<string, unknown>;
            entries?: Array<{
              entryId: string;
              description?: string | null;
              metadata?: Record<string, unknown>;
              human_reviewed?: boolean;
              review_notes?: string | null;
            }>;
          } = {};

          // Transaction-level metadata updates
          if (changes.transactionChanges.size > 0) {
            updates.transaction = {};
            for (const field of changes.transactionChanges) {
              updates.transaction[field] =
                txnData[field as keyof typeof txnData];
            }
          }

          // Entry-level metadata updates
          if (changes.entryChanges.size > 0 && txnData.transactions) {
            const proposedEntriesById = new Map<string, LedgerEntryInput>();
            txnData.transactions.forEach((entry) => {
              if (entry.id) {
                proposedEntriesById.set(entry.id, entry);
              }
            });
            updates.entries = [];
            for (const [entryId, changedFields] of changes.entryChanges) {
              // Defensive check: ensure no accounting fields are in metadata-only path
              const accountingFieldsInChange = Array.from(changedFields).filter(
                (field) =>
                  field === 'coa_id' ||
                  field === 'source_amount' ||
                  field === 'source_currency_id' ||
                  field === 'custom_exchange_rate' ||
                  field === 'fs_date' ||
                  field === 'project_id' ||
                  field === 'contact_id' ||
                  field === 'contact_type',
              );
              if (accountingFieldsInChange.length > 0) {
                throw new AppError(
                  `Accounting field changes (${accountingFieldsInChange.join(', ')}) detected in metadata-only update path. This should trigger a supersede operation instead.`,
                  { entryId, accountingFieldsInChange },
                );
              }

              const existingEntry = existingEntries.find(
                (entry) => entry.id === entryId,
              );
              const proposedEntry = proposedEntriesById.get(entryId);

              if (!existingEntry || !proposedEntry) continue;

              const entryUpdate: {
                entryId: string;
                description?: string | null;
                reference?: string | null;
                metadata?: Record<string, unknown>;
                human_reviewed?: boolean;
                review_notes?: string | null;
              } = {
                entryId: existingEntry.id,
              };

              if (changedFields.has('description')) {
                entryUpdate.description = proposedEntry.description ?? null;
              }
              if (changedFields.has('reference')) {
                entryUpdate.reference = proposedEntry.reference ?? null;
              }
              if (changedFields.has('metadata')) {
                entryUpdate.metadata = proposedEntry.metadata;
              }
              if (changedFields.has('human_reviewed')) {
                entryUpdate.human_reviewed = proposedEntry.human_reviewed;
              }
              if (changedFields.has('review_notes')) {
                entryUpdate.review_notes = proposedEntry.review_notes ?? null;
              }
              updates.entries.push(entryUpdate);
            }
          }

          const updateResult = await updateLedgerMetadata({
            ledgerTransactionId: existingLedgerTransactionId,
            updates,
            userId,
            trx: txn,
          });

          if (!updateResult.success) {
            throw new AppError(
              `Failed to update ledger metadata: ${updateResult.error}`,
              updateResult.error,
            );
          }

          results.push({
            operation: 'updated_metadata',
            ledgerTransactionId: existingLedgerTransactionId,
          });
        } else {
          // ROUTE C: SUPERSEDE TRANSACTION (accounting changes)
          logger.debug(
            {
              existingLedgerTransactionId,
              accountingChanges: true,
            },
            'Accounting changes detected, superseding transaction',
          );

          // Build new transaction data - preserve immutable transaction-level fields
          // TODO: Type conversion workaround - DB may return strings for numbers, null for metadata
          // Consider normalizing at query layer or using Zod coercion instead of manual conversion here
          // Convert types to match schema expectations (DB may return strings for numbers, null for metadata)
          const newTxnData: NewLedgerTransactionData = {
            // Preserve immutable transaction-level fields from existing
            transaction_date: existingTxn.transaction_date,
            transaction_source: existingTxn.transaction_source,
            categorization_source: existingTxn.categorization_source,
            contact_id: existingTxn.contact_id,
            contact_type: existingTxn.contact_type,
            source_transaction_id: existingTxn.source_transaction_id,
            source_transaction_date: existingTxn.source_transaction_date,
            // Convert source_transaction_amount from string to number if needed
            source_transaction_amount:
              existingTxn.source_transaction_amount === null ||
              existingTxn.source_transaction_amount === undefined
                ? existingTxn.source_transaction_amount
                : typeof existingTxn.source_transaction_amount === 'string'
                  ? Number(existingTxn.source_transaction_amount)
                  : existingTxn.source_transaction_amount,
            source_transaction_currency_id:
              existingTxn.source_transaction_currency_id,
            categorization_candidate_id:
              existingTxn.categorization_candidate_id,

            // Allow metadata updates from proposed
            description: txnData.description ?? existingTxn.description,
            reference: txnData.reference ?? existingTxn.reference,
            note: txnData.note ?? existingTxn.note,
            // Convert null metadata to undefined (schema expects object or undefined, not null)
            metadata:
              txnData.metadata ??
              (existingTxn.metadata === null
                ? undefined
                : existingTxn.metadata),

            // Use proposed entries (with accounting changes)
            // Note: Bank leg immutability is enforced by:
            // 1. detectChangedFields() validation (above) - rejects bank leg changes
            // 2. createLedgerRecord() validation - verifies bank leg matches bank_transaction
            // So it's safe to pass proposed entries directly here
            // Filter out null entries and convert string numbers to numbers
            transactions: (txnData.transactions ?? [])
              .filter((entry): entry is LedgerEntryInput => entry !== null)
              .map((entry) => ({
                ...entry,
                // Convert source_amount from string to number if needed
                source_amount:
                  typeof entry.source_amount === 'string'
                    ? Number(entry.source_amount)
                    : entry.source_amount,
                // Convert custom_exchange_rate from string to number if needed
                custom_exchange_rate:
                  entry.custom_exchange_rate !== undefined &&
                  entry.custom_exchange_rate !== null
                    ? typeof entry.custom_exchange_rate === 'string'
                      ? Number(entry.custom_exchange_rate)
                      : entry.custom_exchange_rate
                    : undefined,
                // Convert null metadata to undefined
                metadata: entry.metadata === null ? undefined : entry.metadata,
              })) as LedgerEntryInput[],
          };

          const supersedeResult = await supersedeLedgerTransaction({
            oldLedgerTransactionId: existingLedgerTransactionId,
            newData: newTxnData,
            companyId: companyUUID,
            userId,
            trx: txn,
          });

          if (!supersedeResult.success) {
            throw new AppError(
              `Failed to supersede ledger transaction: ${supersedeResult.error}`,
              supersedeResult.error,
            );
          }

          results.push({
            operation: 'superseded',
            ledgerTransactionId: supersedeResult.data!.newLedgerTransactionId,
            oldLedgerTransactionId:
              supersedeResult.data!.oldLedgerTransactionId,
            warnings: supersedeResult.data?.warnings,
          });
        }
      }
    }

    return results;
  };

  // Execute in transaction (use provided or create new)
  try {
    const results = trx ? await exec(trx) : await knexClient.transaction(exec);
    return successResponse('Ledger transactions processed', results);
  } catch (err) {
    logger.error(
      {
        error: err,
        companyId,
        userId,
        transactionCount: data.length,
      },
      'Failed to process ledger transactions',
    );

    // If we're in an existing transaction, re-throw (let caller handle rollback)
    if (trx) {
      throw new AppError(
        `Failed to process ledger transactions: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      );
    }

    return errorResponse(
      'Failed to process ledger transactions',
      err instanceof Error ? err.message : 'Unknown error',
    );
  }
}
