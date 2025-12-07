import { randomUUID } from 'crypto';
import type { Knex } from 'knex';

import type { ApiResponse } from '../../core/types/api.types.js';
import { knexClient } from '../../db/knexClient.js';
import { toYMD } from '../../shared/index.js';
import { logger } from '../../shared/utils/logger.js';
import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { determineExchangeRate } from '../exchangeRates/exchangeRates.utils.js';
import { createLedgerRecord } from '../ledgers/ledgers.model.js';
import type { NewLedgerTransactionData } from '../ledgers/ledgers.types.js';
import { type JournalBatchData, journalBatchData } from './journals.types.js';
import { validateDebitCreditBalance } from './journals.utils.js';

export async function postJournalRecord({
  data,
  companyId,
  userId,
  trx,
}: {
  data: JournalBatchData;
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;

  // Validate input
  // Retrieve all unique coas and validate that they exist and are active for this company
  // Any errors, return error
  // Confirm that total debits and credits are equal, net to zero, otherwise return error
  // Prep transaction
  // Build relevant objects to insert
  // Generate sequence number, perhap
  // Create journal batch record
  // Create journal entries (All entries take the date of the journal batch)
  // Create ledger transaction record
  // Create ledger entries (All entries take the date of the journal batch)
  // Update journal batch record with ledger transaction id
  // Return success
  // General: ANYTHING FAILS? ROLLBACK; PREPARE OR INFACT IMPLEMENT CASES WHERE WE PERMIT FX JOURNALS IN THE FUTURE. ONE BATCH, ONE CURRENCY MAX (ANY)
}): Promise<
  ApiResponse<{
    journalBatchId: string;
    journalCode: string;
    ledgerTransactionId: string | null;
  }>
> {
  const traceId = randomUUID();
  const startTime = Date.now();

  const log = (phase: string, data?: Record<string, any>) => {
    const duration_ms = Date.now() - startTime;
    logger.info(
      {
        traceId,
        phase,
        duration_ms,
        companyId,
        ...data,
      },
      `[${traceId}] JournalPost.${phase} (${duration_ms}ms)`,
    );
  };

  // Phase 1: Input Validation
  log('started', {
    transactionCount: data.transactions?.length || 0,
    status: data.status,
    hasCode: !!data.code,
  });

  const validatedInput = journalBatchData.safeParse(data);
  if (!validatedInput.success) {
    return errorResponse('Invalid input', {
      traceId,
      issues: validatedInput.error.issues,
    });
  }

  const {
    transactions: rawTransactions,
    currency_id,
    currency_code,
    exchange_rate,
    ...journalBatch
  } = validatedInput.data;

  // filter out any transactions with amount <= 0
  const transactions = rawTransactions.filter((t) => t.amount > 0);

  if (transactions.length < 2) {
    return errorResponse('At least 2 entries are required', { traceId });
  }

  // Validate debit/credit balance
  const balanceValidation = validateDebitCreditBalance(transactions);
  if (!balanceValidation.isValid) {
    log('validation_failed', {
      error: balanceValidation.error,
      totalDebits: balanceValidation.totalDebits,
      totalCredits: balanceValidation.totalCredits,
    });
    return errorResponse(balanceValidation.error!, { traceId });
  }

  log('validation_complete');

  const executeTransaction = async (
    tx: Knex.Transaction,
  ): Promise<
    ApiResponse<{
      journalBatchId: string;
      journalCode: string;
      ledgerTransactionId: string | null;
    }>
  > => {
    const company =
      (await tx('companies')
        .where((b) => b.where('short_code', companyId).orWhere('id', companyId))
        .where('is_deleted', false)
        .first('id', 'reporting_currency_id')) ?? null;

    if (!company?.id || !company?.reporting_currency_id) {
      throw new Error(`Company not found: ${companyId}`);
    }
    const companyUUID = company.id as string;
    const reportingCurrencyId = company.reporting_currency_id as string;

    // Resolve currency (default to reporting currency)
    let journalCurrencyId = company.reporting_currency_id;
    if (currency_id || currency_code) {
      const currencyQuery = tx('currencies').where('is_deleted', false);

      if (currency_id) {
        currencyQuery.where('id', currency_id);
      } else {
        currencyQuery.where('code', currency_code);
      }

      const currency = await currencyQuery.first('id');
      if (!currency) {
        throw new Error(`Currency not found: ${currency_id || currency_code}`);
      }

      journalCurrencyId = currency.id;
    }

    let systemExchangeRate = 1;
    let customExchangeRate = exchange_rate || 1;

    if (journalCurrencyId !== reportingCurrencyId) {
      const fxRate = await determineExchangeRate({
        date: journalBatch.date,
        fromCurrencyId: journalCurrencyId,
        toCurrencyId: reportingCurrencyId,
      });

      if (!fxRate || fxRate <= 0) {
        throw new Error('Failed to determine exchange rate');
      }

      systemExchangeRate = Number(fxRate);
      customExchangeRate = exchange_rate || systemExchangeRate;
    }

    // Validate exchange rate
    if (systemExchangeRate <= 0 || customExchangeRate <= 0) {
      return errorResponse('Exchange rate must be positive', { traceId });
    }

    // Validate all COAs exist and are active
    const uniqueCoaIds = [...new Set(transactions.map((t) => t.coa_id))];
    const coas = await tx('coa')
      .where('company_id', companyUUID)
      .whereIn('id', uniqueCoaIds)
      .where('is_deleted', false)
      .where('is_active', true)
      .select('id');

    if (coas.length !== uniqueCoaIds.length) {
      const foundIds = new Set(coas.map((c) => c.id));
      const missing = uniqueCoaIds.filter((id) => !foundIds.has(id));
      throw new Error(`Invalid or inactive COA IDs: ${missing.join(', ')}`);
    }

    // Create journal batch
    const [journalBatchRow] = await tx('journal_batches')
      .insert({
        date: journalBatch.date,
        title: journalBatch.title,
        description: journalBatch.description ?? null,
        status: journalBatch.status,
        note: journalBatch.note ?? null,
        contact_id: journalBatch.contact_id ?? null,
        ...(journalBatch.code ? { code: journalBatch.code } : {}),
        currency_id: journalCurrencyId,
        exchange_rate: customExchangeRate,
        ledger_transaction_id: null,
        is_recurring: journalBatch.is_recurring ?? false,
        recurring_template_id: journalBatch.recurring_template_id ?? null,
        company_id: companyUUID,
        created_by_id: userId,
      })
      .returning(['id', 'code']);

    log('journal_batch_created', {
      journalBatchId: journalBatchRow.id,
      code: journalBatchRow.code,
    });

    // Create journal entries
    const journalEntries = await tx('journal_entries').insert(
      transactions.map((t) => ({
        description: t.description || journalBatch.title,
        side: t.side,
        amount: Math.abs(t.amount),
        coa_id: t.coa_id,
        journal_batch_id: journalBatchRow.id,
      })),
    );

    // Maybe we should validate the contact id belongs to the company
    log('entries_created', { entriesCount: journalEntries.length });

    // Create ledger if posted
    const ledgerTransactionId: string | null = null;

    if (journalBatch.status === 'posted') {
      const ledgerPayload: NewLedgerTransactionData = {
        date: journalBatch.date,
        transaction_source: 'manual_journal',
        categorization_source: 'manual',
        description: journalBatch.title,
        note: journalBatch.note ?? null,
        contact_id: journalBatch.contact_id ?? null,
        source_transaction_currency_id: journalCurrencyId,
        transactions: transactions.map((t) => ({
          fs_date: toYMD(journalBatch.date),
          coa_id: t.coa_id,
          source_currency_id: journalCurrencyId,
          source_amount:
            t.side === 'debit' ? Math.abs(t.amount) : -Math.abs(t.amount),
          ...(exchange_rate
            ? { custom_exchange_rate: customExchangeRate }
            : {}),
          categorization_status: 'accepted',
          description: t.description ?? null,
          project_id: t.project_id ?? null,
          project_name: t.project_name ?? null,
          // fx_transaction_id: null, not sure how to handle this
        })),
      } as const;

      const ledgerResult = await createLedgerRecord({
        data: ledgerPayload,
        companyId,
        userId,
        trx: tx,
      });

      // if (!ledgerResult.success || !ledgerResult.data?.ledgerTransactionId) {
      //   throw new Error('Failed to create ledger transaction');
      // }

      // ledgerTransactionId = ledgerResult.data.ledgerTransactionId;

      await tx('journal_batches')
        .where('id', journalBatchRow.id)
        .update({ ledger_transaction_id: ledgerTransactionId });
    }

    return successResponse('Journal posted successfully', {
      journalBatchId: journalBatchRow.id,
      journalCode: journalBatchRow.code || '',
      ledgerTransactionId,
    });
  };

  try {
    // Use existing transaction or create new one (but not both)
    if (trx) {
      return await executeTransaction(trx);
    } else {
      return await knexClient.transaction(executeTransaction);
    }
  } catch (error) {
    return errorResponse('Failed to post journal', { error });
  }
}

export async function reverseJournalRecord({
  journalBatchId,
  userId,
  reversalReason,
  reversalDate,
  trx,
}: {
  journalBatchId: string;
  userId: string;
  reversalReason?: string;
  reversalDate?: Date;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ reversalJournalId?: string }>> {
  const startTime = Date.now();
  const traceId = randomUUID();

  const log = (phase: string, data?: Record<string, any>) => {
    const duration_ms = Date.now() - startTime;
    logger.info(
      {
        traceId,
        phase,
        duration_ms,
        journalBatchId,
        userId,
        ...data,
      },
      `reverseJournalRecord:${phase}`,
    );
  };

  log('starting');

  const executeTransaction = async (
    tx: Knex.Transaction,
  ): Promise<ApiResponse<{ reversalJournalId?: string }>> => {
    // Validate journal batch exists and is not already voided/reversed
    const journalBatch = await tx('journal_batches')
      .where('id', journalBatchId)
      .where('is_deleted', false)
      .first();

    if (!journalBatch) {
      throw new Error('Journal batch not found or already deleted');
    }

    if (journalBatch.status === 'voided') {
      throw new Error('Journal batch is already voided');
    }

    if (journalBatch.reversed_at) {
      throw new Error('Journal batch has already been reversed');
    }

    log('journal_batch_validated', {
      currentStatus: journalBatch.status,
      companyId: journalBatch.company_id,
    });

    const isDraft = journalBatch.status === 'draft';

    if (isDraft) {
      // DRAFT JOURNAL: Simple soft-delete (never hit the ledger)
      log('handling_draft_journal');

      // Update journal batch status to voided and mark as deleted
      await tx('journal_batches').where('id', journalBatchId).update({
        status: 'voided',
        updated_by_id: userId,
        is_deleted: true,
        updated_at: new Date(),
        deleted_at: new Date(),
      });

      // Mark all journal entries as deleted
      await tx('journal_entries')
        .where('journal_batch_id', journalBatchId)
        .update({
          is_deleted: true,
          updated_at: new Date(),
          deleted_at: new Date(),
        });

      log('draft_journal_voided');

      // Create audit event
      await tx('audit_events').insert({
        entity_type: 'journal',
        entity_id: journalBatchId,
        action: 'void',
        payload: {
          previous_status: journalBatch.status,
          voided_by: userId,
          voided_at: new Date().toISOString(),
        },
        company_id: journalBatch.company_id,
        user_id: userId,
        notes: `Draft journal batch voided by user ${userId}`,
      });

      log('audit_event_created');

      return successResponse('Draft journal batch voided successfully', {});
    } else {
      // POSTED JOURNAL: Create reversing entry (immutable audit trail)
      log('handling_posted_journal');

      if (!journalBatch.ledger_transaction_id) {
        throw new Error('Posted journal must have a ledger transaction');
      }

      // Fetch original journal entries
      const originalEntries = await tx('journal_entries')
        .where('journal_batch_id', journalBatchId)
        .where('is_deleted', false)
        .select('coa_id', 'amount', 'side', 'description');

      if (originalEntries.length === 0) {
        throw new Error('No journal entries found for reversal');
      }

      // Create reversing transactions (flip debit/credit)
      const reversingTransactions = originalEntries.map((entry) => ({
        coaId: entry.coa_id,
        amount: entry.amount,
        side: entry.side === 'debit' ? ('credit' as const) : ('debit' as const),
        description: `Reversal: ${entry.description || journalBatch.title}`,
      }));

      // Determine reversal date (default to original date or use provided)
      const effectiveReversalDate = reversalDate || journalBatch.date;

      // Create reversing journal
      const reversalResult = await postJournalRecord({
        data: {
          date: effectiveReversalDate,
          title: `Reversal of ${journalBatch.title}`,
          description: reversalReason
            ? `Reversal reason: ${reversalReason}`
            : `Reversing journal ${journalBatch.code || journalBatchId}`,
          status: 'posted',
          note: journalBatch.note,
          contactId: journalBatch.contact_id,
          currencyId: journalBatch.currency_id,
          exchangeRate: journalBatch.exchange_rate,
          reversedJournalId: journalBatchId,
          reversalReason: reversalReason || null,
          transactions: reversingTransactions,
        },
        companyId: journalBatch.company_id,
        userId,
        trx: tx,
      });

      if (!reversalResult.success || !reversalResult.data) {
        throw new Error('Failed to create reversing journal entry');
      }

      log('reversing_journal_created', {
        reversalJournalId: reversalResult.data.journalBatchId,
      });

      // Update original journal with reversal info
      await tx('journal_batches')
        .where('id', journalBatchId)
        .update({
          reversed_by_id: userId,
          reversed_at: new Date(),
          reversal_reason: reversalReason || null,
          updated_by_id: userId,
          updated_at: new Date(),
        });

      log('original_journal_marked_reversed');

      // It'll most likely be handled in the GL so we should let it be
      // // Enqueue GL balance recalculation for affected COAs
      // const affectedCoas = await tx('ledger_entries')
      //   .where('ledger_transaction_id', journalBatch.ledger_transaction_id)
      //   .where('is_deleted', false)
      //   .select('coa_id', 'fs_date')
      //   .distinct();

      // for (const entry of affectedCoas) {
      //   await enqueueGLBalance({
      //     companyId: journalBatch.company_id,
      //     coaId: entry.coa_id,
      //     recalcFrom: entry.fs_date,
      //     triggeredBy: 'manual',
      //   });
      // }

      // log('gl_balance_recalc_enqueued', {
      //   affectedCoasCount: affectedCoas.length,
      // });

      // Create audit event
      await tx('audit_events').insert({
        entity_type: 'journal',
        entity_id: journalBatchId,
        action: 'reverse',
        payload: {
          previous_status: journalBatch.status,
          reversed_by: userId,
          reversed_at: new Date().toISOString(),
          reversal_journal_id: reversalResult.data.journalBatchId,
          reversal_reason: reversalReason,
          ledger_transaction_id: journalBatch.ledger_transaction_id,
        },
        company_id: journalBatch.company_id,
        user_id: userId,
        notes: `Posted journal batch reversed by user ${userId}${reversalReason ? `: ${reversalReason}` : ''}`,
      });

      log('audit_event_created');

      return successResponse('Posted journal batch reversed successfully', {
        reversalJournalId: reversalResult.data.journalBatchId,
      });
    }
  };

  try {
    if (trx) {
      return await executeTransaction(trx);
    } else {
      return await knexClient.transaction(executeTransaction);
    }
  } catch (error) {
    log('error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return errorResponse('Failed to void journal batch', {
      error: error instanceof Error ? error.message : 'Unknown error',
      traceId,
    });
  }
}
