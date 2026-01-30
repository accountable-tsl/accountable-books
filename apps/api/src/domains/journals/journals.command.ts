import { randomUUID } from 'crypto';
import type { TxnFileInput } from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';
import z from 'zod';

import { knexClient } from '../../db/knexClient.js';
import { toYMD } from '../../shared/index.js';
import { logger } from '../../shared/utils/logger.js';
import {
  AppError,
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { determineExchangeRate } from '../exchangeRates/exchangeRates.utils.js';
import { createLedgerRecord } from '../ledgers/ledgers.model.js';
import { persistTxnFiles } from '../objects/txn-files/txn-files.service.js';
import { ensureAndFetchFiscalCalendar } from '../reporting/fiscal-calendar/index.js';
import { generateJournalReference } from './journals.reference.js';
import { journalBatchDataCamel } from './journals.types.js';
import { validateDebitCreditBalance } from './journals.utils.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type { NewLedgerTransactionData } from '../ledgers/ledgers.types.js';
import type {
  JournalBatchData,
  NewJournalBatch,
  NewJournalEntry,
} from './journals.types.js';

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
  // Validate contact (if provided) exists and is active for this company
  // Retrieve all unique coas and validate that they exist and are active for this company
  // Retrieve all unique projects and validate that they exist and are active for this company
  // Any errors, return error
  // Confirm that total debits and credits are equal, net to zero, otherwise return error
  // Prep transaction
  // Build relevant objects to insert
  // Generate sequence number
  // Create journal batch record
  // Create journal entries (All entries take the date of the journal batch)
  // Create ledger transaction record
  // Create ledger entries (All entries take the date of the journal batch)
  // Update journal batch record with ledger transaction id
  // Return success
  // Handle files properly... check transaction files
  // General: ANYTHING FAILS? ROLLBACK; PREPARE OR INFACT IMPLEMENT CASES WHERE WE PERMIT FX JOURNALS IN THE FUTURE. ONE BATCH, ONE CURRENCY MAX (ANY)
}): Promise<
  ApiResponse<{
    journalBatchId: string;
    journalId: string;
    journalReference: string | null;
    ledgerTransactionId: string | null;
  }>
> {
  const traceId = randomUUID();
  const startTime = Date.now();

  const log = (
    phase: string,
    data?: Record<string, any>,
    level: 'info' | 'error' = 'info',
  ) => {
    const duration_ms = Date.now() - startTime;
    const fn = level === 'error' ? logger.error : logger.info;
    fn(
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
    entriesCount: data.entries?.length || 0,
    filesCount: data.files?.length || 0,
    status: data.status,
    hasReference: !!data.reference,
  });

  const exec = async (
    txn: Knex.Transaction,
  ): Promise<{
    journalBatchId: string;
    journalId: string;
    journalReference: string | null;
    ledgerTransactionId: string | null;
  }> => {
    const validatedInput = journalBatchDataCamel.safeParse(data);
    if (!validatedInput.success) {
      log('input_validation_failed', {
        traceId,
        error: z.prettifyError(validatedInput.error),
      });
      throw new AppError(
        `Invalid input: ${validatedInput.error.message}`,
        z.prettifyError(validatedInput.error),
      );
    }

    const { entries: je, files = [], ...batch } = validatedInput.data;
    const now = new Date();

    const entries = je.filter((e) => e.amount !== 0);
    if (entries.length !== je.length) {
      log('zero_amount_filtered', {
        originalCount: je.length,
        filteredCount: je.length - entries.length,
      });
    }
    if (entries.some((e) => e.amount < 0)) {
      throw new AppError('Journal entry amounts must be positive', {
        traceId,
      });
    }

    if (entries.length < 2) {
      throw new AppError(
        'At least two journal entries with non-zero amount are required',
        { traceId },
      );
    }

    // Validate debit/credit balance
    // Simple function that sums debits and credits and checks equality
    const balanceValidation = validateDebitCreditBalance(entries);
    if (!balanceValidation.isValid) {
      log('validation_failed', {
        error: balanceValidation.error,
        totalDebits: balanceValidation.totalDebits,
        totalCredits: balanceValidation.totalCredits,
      });
      throw new AppError(
        `Journal entries are not balanced: ${balanceValidation.error}`,
        { traceId },
      );
    }

    // Get company UUID and reporting currency
    const company =
      (await txn('companies')
        .where((b) => b.where('short_code', companyId).orWhere('id', companyId))
        .where('is_deleted', false)
        .first<{ id: string; reporting_currency_id: string }>(
          'id',
          'reporting_currency_id',
        )) ?? null;

    if (!company?.id || !company?.reporting_currency_id) {
      throw new Error(`Company not found: ${companyId}`);
    }

    const companyUUID = company.id as string;
    const reportingCurrencyId = company.reporting_currency_id as string;
    const journalCurrencyId = batch.currency_id || reportingCurrencyId;
    const isFx = journalCurrencyId !== reportingCurrencyId;

    const currency = await txn('currencies')
      .where('id', journalCurrencyId)
      .where('is_deleted', false)
      .first<{ id: string }>('id');

    if (!currency) {
      throw new AppError(`Invalid currency ID: ${journalCurrencyId}`, {
        traceId,
      });
    }

    let exchangeRate = 1;
    if (isFx) {
      if (batch.exchange_rate != null) {
        exchangeRate = Number(batch.exchange_rate);
        log('fx_rate_resolved', { source: 'input', exchangeRate });
      } else {
        const rate = await determineExchangeRate({
          date: batch.date,
          fromCurrencyId: journalCurrencyId,
          toCurrencyId: reportingCurrencyId,
        });

        if (!rate) {
          throw new AppError('Failed to determine exchange rate', {
            traceId,
            journalCurrencyId,
            reportingCurrencyId,
            date: batch.date,
          });
        }

        exchangeRate = rate;
        log('fx_rate_resolved', { source: 'lookup', exchangeRate });
      }
    }

    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      throw new AppError('Invalid exchange rate', { traceId, exchangeRate });
    }

    // Ensure fiscal period is open for the journal date if posting
    if (batch.status === 'posted') {
      log('fiscal_period_checking', { journalDate: batch.date });

      // This will:
      // 1. Auto-create the fiscal period if it doesn't exist
      // 2. Throw an error if the period is closed/locked
      await ensureAndFetchFiscalCalendar({
        companyId: companyUUID,
        startYMD: toYMD(batch.date),
        endYMD: toYMD(batch.date),
        fetchTypes: ['monthly'],
        trx: txn,
      });
    }

    const contactId = batch.contact_id ?? null;
    if (contactId) {
      // Validate contact exists and is active for this company
      const contact = await txn('contacts')
        .where('id', contactId)
        .where('company_id', companyUUID)
        .where('is_deleted', false)
        .where('is_active', true)
        .first<{ id: string }>('id');

      if (!contact) {
        throw new Error(`Invalid or inactive contact ID: ${contactId}`);
      }
    }

    const isRecurring = batch.is_recurring ?? false;
    if (isRecurring && !batch.recurring_template_id) {
      throw new AppError(
        'Recurring journals must include recurring_template_id',
        { traceId },
      );
    }
    if (!isRecurring && batch.recurring_template_id) {
      throw new AppError(
        'recurring_template_id provided but is_recurring is false',
        { traceId },
      );
    }

    const uniqueCoaIds = new Set<string>();
    const uniqueProjectIds = new Set<string>();

    for (const entry of entries) {
      if (!entry.coa_id) {
        throw new Error('One or more journal entries are missing a COA ID');
      }
      uniqueCoaIds.add(entry.coa_id);

      if (entry.project_id) {
        uniqueProjectIds.add(entry.project_id);
      }
    }

    const coaIdsArray = Array.from(uniqueCoaIds);
    const projectIdsArray = Array.from(uniqueProjectIds);

    // Validate all COAs exist in this company and are active
    const coas = await txn('coa')
      .where('company_id', companyUUID)
      .whereIn('id', coaIdsArray)
      .where('is_deleted', false)
      .where('is_active', true)
      .select('id');

    if (coas.length !== coaIdsArray.length) {
      const foundIds = new Set(coas.map((c) => c.id));
      const missing = coaIdsArray.filter((id) => !foundIds.has(id));
      throw new Error(`Invalid or inactive COA IDs: ${missing.join(', ')}`);
    }

    // Validate all projects exist in this company and are active
    if (projectIdsArray.length > 0) {
      const projects = await txn('projects')
        .where('company_id', companyUUID)
        .whereIn('id', projectIdsArray)
        .where('is_deleted', false)
        .where('is_active', true)
        .select('id');

      if (projects.length !== projectIdsArray.length) {
        const foundIds = new Set(projects.map((p) => p.id));
        const missing = projectIdsArray.filter((id) => !foundIds.has(id));
        throw new Error(
          `Invalid or inactive Project IDs: ${missing.join(', ')}`,
        );
      }
    }

    // Resolve reference + sequence
    let journalReference: string | null = batch.reference?.trim() ?? null;
    if (journalReference === '') journalReference = null;
    let sequenceMonth: string | null = null;
    let sequenceNumber: number | null = null;

    if (journalReference) {
      const existingRef = await txn('journal_batches')
        .where('company_id', companyUUID)
        .where('reference', journalReference)
        .where('is_deleted', false)
        .first<{ id: string }>('id');

      if (existingRef) {
        throw new AppError('Journal reference already exists', {
          traceId,
          journalReference,
          existingJournalBatchId: existingRef.id,
        });
      }
    }

    if (batch.status === 'posted') {
      const ref = await generateJournalReference({
        companyId: companyUUID,
        journalDate: batch.date,
        trx: txn,
      });

      sequenceMonth = ref.sequenceMonth;
      sequenceNumber = ref.sequenceNumber;
      if (!journalReference) {
        journalReference = ref.reference;
      }
    }

    // Create journal batch
    const journalBatch: NewJournalBatch = {
      sequence_month: sequenceMonth,
      sequence_number: sequenceNumber,
      reference: journalReference,
      company_id: companyUUID,
      currency_id: journalCurrencyId,
      exchange_rate: exchangeRate,

      date: batch.date,
      title: batch.title,
      description: batch.description,

      contact_id: contactId,
      status: batch.status,

      note: batch.note,
      auto_reversal_date: batch.auto_reversal_date,

      // Both is_recurring and recurring_template_id should be set together
      is_recurring: isRecurring,
      recurring_template_id: isRecurring ? batch.recurring_template_id : null,

      metadata: batch.metadata,
      created_at: now,
      updated_at: now,

      created_by_id: userId,
      updated_by_id: userId,
    };

    const inserted = await txn('journal_batches')
      .insert(journalBatch)
      .returning<{ id: string }[]>('id');

    const journalBatchId = inserted?.[0]?.id;
    if (!journalBatchId) {
      throw new Error('Failed to create journal batch');
    }

    log('journal_batch_created', {
      journalBatchId: journalBatchId,
      reference: journalReference,
    });

    if (files.length > 0) {
      const filesToPersist: TxnFileInput[] = files.map((file) => ({
        ...file,
        source: 'journal',
        transaction_id: journalBatchId,
        entry_id: null,
      }));

      await persistTxnFiles({
        data: filesToPersist,
        companyId,
        userId,
        trx: txn,
      });

      log('files_persisted', { filesCount: filesToPersist.length });
    }

    const entryFsDate = toYMD(batch.date);
    const totalIdsNeeded = entries.length * 2;
    const idResult = await txn.raw<{
      rows: Array<{ id: string }>;
    }>('SELECT uuid_generate_v7() as id FROM generate_series(1, ?)', [
      totalIdsNeeded,
    ]);
    const ids = idResult?.rows?.map((row) => row.id) ?? [];
    if (ids.length !== totalIdsNeeded) {
      throw new AppError('Failed to allocate entry IDs', {
        traceId,
        expected: totalIdsNeeded,
        received: ids.length,
      });
    }

    const journalEntryIds = ids.slice(0, entries.length);
    const ledgerEntryIds = ids.slice(entries.length);
    const entryMappings = entries.map((entry, index) => ({
      journalEntryId: journalEntryIds[index]!,
      ledgerEntryId: ledgerEntryIds[index]!,
      fsDate: entryFsDate,
      entry,
    }));

    const entriesToInsert: Array<NewJournalEntry & { id: string }> =
      entryMappings.map(({ journalEntryId, entry }) => ({
        id: journalEntryId,
        journal_batch_id: journalBatchId,
        description: entry.description,
        side: entry.side,
        amount: Math.abs(entry.amount),
        coa_id: entry.coa_id,
        project_id: entry.project_id ?? null,
        created_at: now,
        updated_at: now,
      }));

    // Create journal entries
    await txn('journal_entries').insert(entriesToInsert);

    log('entries_created', { entriesCount: entriesToInsert.length });

    // If it's a posted journal, create the corresponding ledger transaction and entries
    let ledgerTransactionId: string | null = null;

    if (batch.status === 'posted') {
      const ledgerPayload: NewLedgerTransactionData = {
        date: batch.date,
        transaction_source: 'manual_journal',
        categorization_source: 'manual',
        description: batch.title,
        note: batch.note ?? null,
        contact_id: batch.contact_id ?? null,
        source_transaction_id: journalBatchId, // Journal batch ID for linking back
        source_transaction_currency_id: journalCurrencyId,
        transactions: entryMappings.map((m) => ({
          id: m.ledgerEntryId,
          fs_date: m.fsDate,
          coa_id: m.entry.coa_id,
          source_currency_id: journalCurrencyId,
          source_amount:
            m.entry.side === 'debit'
              ? Math.abs(m.entry.amount)
              : -Math.abs(m.entry.amount),
          description: m.entry.description ?? null,
          project_id: m.entry.project_id ?? null,
          custom_exchange_rate: isFx ? exchangeRate : undefined,
        })),
      } as const;

      const ledgerResult = await createLedgerRecord({
        data: ledgerPayload,
        companyId,
        userId,
        trx: txn,
      });

      if (
        !ledgerResult.success ||
        !ledgerResult.data ||
        !('ledgerTransactionId' in ledgerResult.data)
      ) {
        throw new AppError('Failed to create ledger transaction', {
          traceId,
          error: ledgerResult.error,
        });
      }

      ledgerTransactionId = ledgerResult.data.ledgerTransactionId as string;

      await txn('journal_batches').where('id', journalBatchId).update({
        ledger_transaction_id: ledgerTransactionId,
        updated_by_id: userId,
        updated_at: now,
      });

      const valuesSql = entryMappings.map(() => '(?, ?, ?)').join(', ');
      const valuesBindings = entryMappings.flatMap((m) => [
        m.journalEntryId,
        m.ledgerEntryId,
        m.fsDate,
      ]);

      await txn.raw(
        `UPDATE journal_entries AS je
         SET ledger_entry_id = v.ledger_entry_id::uuid,
             ledger_entry_fs_date = v.ledger_entry_fs_date::date,
             updated_at = ?
         FROM (VALUES ${valuesSql}) AS v(journal_entry_id, ledger_entry_id, ledger_entry_fs_date)
         WHERE je.id = v.journal_entry_id::uuid`,
        [now, ...valuesBindings],
      );

      log('ledger_linked', {
        ledgerTransactionId,
        entriesCount: entryMappings.length,
      });
    }

    // If there is auto-reversal date, we should create a job for it
    log('completed', {
      journalBatchId,
      ledgerTransactionId,
      journalReference,
      journalCurrencyId,
      exchangeRate,
      isFx,
    });

    return {
      journalBatchId,
      journalId: journalBatchId,
      journalReference,
      ledgerTransactionId,
    };
  };

  try {
    // Use existing transaction or create new one (but not both)
    const result = trx ? await exec(trx) : await knexClient.transaction(exec);
    const message =
      data.status === 'posted'
        ? 'Journal posted successfully'
        : 'Journal saved as draft';
    return successResponse(message, result);
  } catch (error) {
    log(
      'error',
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'error',
    );
    if (trx) {
      throw mapPostJournalError(error);
    }
    return errorResponse('Failed to post journal', mapPostJournalError(error));
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
      log('handling_draft_journal');

      await tx('journal_batches').where('id', journalBatchId).update({
        status: 'voided',
        updated_by_id: userId,
        is_deleted: true,
        updated_at: new Date(),
        deleted_at: new Date(),
      });

      await tx('journal_entries')
        .where('journal_batch_id', journalBatchId)
        .update({
          is_deleted: true,
          updated_at: new Date(),
          deleted_at: new Date(),
        });

      log('draft_journal_voided');

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
    }

    log('handling_posted_journal');

    if (!journalBatch.ledger_transaction_id) {
      throw new Error('Posted journal must have a ledger transaction');
    }

    const originalEntries = await tx('journal_entries')
      .where('journal_batch_id', journalBatchId)
      .where('is_deleted', false)
      .select('coa_id', 'amount', 'side', 'description');

    if (originalEntries.length === 0) {
      throw new Error('No journal entries found for reversal');
    }

    const reversingEntries = originalEntries.map((entry) => ({
      coaId: entry.coa_id,
      amount: Number(entry.amount),
      side: entry.side === 'debit' ? ('credit' as const) : ('debit' as const),
      description: `Reversal: ${entry.description || journalBatch.title}`,
    }));

    const effectiveReversalDate = reversalDate
      ? toYMD(reversalDate)
      : journalBatch.date;

    const reversalResult = await postJournalRecord({
      data: {
        date: effectiveReversalDate,
        title: `Reversal of ${journalBatch.title}`,
        description: reversalReason
          ? `Reversal reason: ${reversalReason}`
          : `Reversing journal ${journalBatch.reference || journalBatchId}`,
        status: 'posted',
        note: journalBatch.note,
        contactId: journalBatch.contact_id,
        currencyId: journalBatch.currency_id,
        exchangeRate: journalBatch.exchange_rate,
        entries: reversingEntries,
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
  };

  try {
    if (trx) {
      return await executeTransaction(trx);
    }
    return await knexClient.transaction(executeTransaction);
  } catch (error) {
    log('error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    if (trx) throw error;
    return errorResponse('Failed to void journal batch', {
      error: error instanceof Error ? error.message : 'Unknown error',
      traceId,
    });
  }
}

function mapPostJournalError(error: unknown): Error {
  if (error instanceof AppError) return error;

  const err = error as { code?: string; constraint?: string; detail?: string };
  if (err?.code === '23505') {
    const constraint = err.constraint ?? '';

    if (constraint === 'journal_batch_company_reference_unique') {
      return new AppError(
        'Journal reference already exists',
        { constraint, detail: err.detail },
        false,
        ErrorCode.CONFLICT,
      );
    }

    if (constraint === 'journal_batch_company_month_seq_unique') {
      return new AppError(
        'Journal sequence already exists. Please retry.',
        { constraint, detail: err.detail },
        false,
        ErrorCode.CONFLICT,
      );
    }

    if (constraint === 'journal_batch_recurring_idempotency_idx') {
      return new AppError(
        'Recurring journal already exists for this template and date',
        { constraint, detail: err.detail },
        false,
        ErrorCode.CONFLICT,
      );
    }

    return new AppError(
      'Duplicate journal reference',
      { constraint, detail: err.detail },
      false,
      ErrorCode.CONFLICT,
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}
