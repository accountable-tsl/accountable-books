import { randomUUID } from 'crypto';
import type {
  JournalBatchSource,
  TxnFileInput,
} from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { toYMD } from '../../shared/index.js';
import { logger } from '../../shared/utils/logger.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  AppError,
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { createLedgerRecord } from '../ledgers/ledgers.model.js';
import {
  persistTxnFiles,
  syncTxnFilesForTarget,
} from '../objects/txn-files/txn-files.service.js';
import { ensureAndFetchFiscalCalendar } from '../reporting/fiscal-calendar/index.js';
import { scheduleJournalAutoReversal } from './auto-reversal.queue.js';
import {
  writeJournalCopyAudit,
  writeJournalCreateAudit,
  writeJournalPostAudit,
  writeJournalReverseAudit,
  writeJournalUpdateAudit,
  writeJournalVoidAudit,
} from './journals.audit.js';
import {
  resolveJournalCompanyContext,
  validateAndPrepareJournalInput,
} from './journals.prepare.js';
import { getJournal } from './journals.query.js';
import { generateJournalReference } from './journals.reference.js';
import {
  journalBatchDataCamel,
  updateDraftJournalDataCamel,
} from './journals.types.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type { NewLedgerTransactionData } from '../ledgers/ledgers.types.js';
import type {
  JournalBatchData,
  NewJournalBatch,
  NewJournalEntry,
  UpdateDraftJournalData,
} from './journals.types.js';

export async function copyJournal({
  sourceJournalBatchId,
  companyId,
  userId,
  includeFiles,
  trx,
}: {
  sourceJournalBatchId: string;
  companyId: string;
  userId: string;
  includeFiles?: boolean;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    sourceJournalBatchId: string;
    journalBatchId: string;
    journalId: string;
  }>
> {
  const startTime = Date.now();
  const traceId = randomUUID();

  const log = (
    phase: string,
    data?: Record<string, any>,
    level: 'info' | 'error' = 'info',
  ) => {
    const duration_ms = Date.now() - startTime;
    const fn =
      level === 'error' ? logger.error.bind(logger) : logger.info.bind(logger);
    fn(
      {
        traceId,
        phase,
        duration_ms,
        sourceJournalBatchId,
        companyId,
        userId,
        ...data,
      },
      `copyJournal:${phase}`,
    );
  };

  log('starting', { includeFiles: Boolean(includeFiles) });

  const exec = async (tx: Knex.Transaction) => {
    const context = await resolveJournalCompanyContext({
      companyId,
      trx: tx,
      traceId,
    });

    const sourceResult = await getJournal({
      journalId: sourceJournalBatchId,
      companyId,
      includeDeleted: true,
      includeFiles: Boolean(includeFiles),
      trx: tx,
    });

    if (!sourceResult.success || !sourceResult.data) {
      throw new AppError(
        'Journal batch not found for company',
        { traceId, sourceJournalBatchId, response: sourceResult },
        false,
        ErrorCode.NOT_FOUND,
      );
    }

    const source = sourceResult.data.journal;
    const sourceEntries = sourceResult.data.entries;
    const sourceFiles = sourceResult.data.files ?? [];

    const date = toYMD(new Date());

    const metadata =
      source.metadata && typeof source.metadata === 'object'
        ? (source.metadata as Record<string, unknown>)
        : undefined;

    const created = await postJournalRecord({
      data: {
        date,
        title: source.title,
        description: source.description ?? undefined,
        note: source.note ?? undefined,
        status: 'draft',
        reference: null,
        contactId: source.contactId ?? null,
        currencyId: source.currencyId,
        autoReversalDate: null,
        // Copying a journal should create a user-authored one-off draft, even
        // if the source journal was generated from a recurring template.
        journalSource: 'one_off',
        recurringTemplateId: null,
        originalJournalId: source.id,
        metadata,
        entries: sourceEntries.map((e) => ({
          description: e.description,
          side: e.side,
          amount: e.amount,
          coaId: e.coaId,
          projectId: e.projectId ?? null,
        })),
      },
      companyId,
      userId,
      trx: tx,
    });

    if (!created.success || !created.data) {
      throw new AppError(
        'Failed to copy journal',
        { traceId, response: created },
        false,
        ErrorCode.GENERIC,
      );
    }

    if (includeFiles && sourceFiles.length > 0) {
      await tx.raw(
        `INSERT INTO file_attachments (file_id, source, transaction_id, entry_id, attached_by_id)
         SELECT fa.file_id, fa.source, ?, fa.entry_id, ?
         FROM file_attachments fa
         INNER JOIN files f ON f.id = fa.file_id
         WHERE fa.source = 'journal'
           AND fa.transaction_id = ?
           AND fa.is_deleted = false
           AND f.company_id = ?
           AND f.is_deleted = false
         ON CONFLICT (file_id, source, transaction_id, COALESCE(entry_id, '00000000-0000-0000-0000-000000000000'))
         WHERE is_deleted = false
         DO NOTHING`,
        [
          created.data.journalBatchId,
          userId,
          sourceJournalBatchId,
          context.companyUUID,
        ],
      );
    }

    await writeJournalCopyAudit({
      entityId: created.data.journalBatchId,
      companyId: context.companyUUID,
      actor: { type: 'user', userId },
      payload: {
        sourceJournalId: source.id,
        includeFiles: Boolean(includeFiles),
        entryCount: sourceEntries.length,
        date,
      },
      trx: tx,
    });

    return {
      sourceJournalBatchId: source.id,
      journalBatchId: created.data.journalBatchId,
      journalId: created.data.journalId,
    };
  };

  try {
    const result = trx ? await exec(trx) : await knexClient.transaction(exec);
    return successResponse('Journal copied successfully', result);
  } catch (error: unknown) {
    log(
      'error',
      { error: error instanceof Error ? error.message : String(error) },
      'error',
    );
    if (trx) throw error;
    return errorResponse('Failed to copy journal', error);
  }
}

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
    const fn =
      level === 'error' ? logger.error.bind(logger) : logger.info.bind(logger);
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
    const now = new Date();

    const context = await resolveJournalCompanyContext({
      companyId,
      trx: txn,
      traceId,
    });
    const companyUUID = context.companyUUID;

    const prepared = await validateAndPrepareJournalInput({
      data,
      schema: journalBatchDataCamel,
      context,
      trx: txn,
      traceId,
    });

    const batch = prepared.batch;
    const entries = prepared.entries;
    const files = prepared.files;

    const journalCurrencyId = prepared.journalCurrencyId;
    const exchangeRate = prepared.exchangeRate;
    const isFx = prepared.isFx;

    const contactId = prepared.contactId;
    const isRecurring = prepared.isRecurring;
    const recurringTemplateId = prepared.recurringTemplateId;

    if (entries.length !== data.entries.length) {
      log('zero_amount_filtered', {
        originalCount: data.entries.length,
        filteredCount: data.entries.length - entries.length,
      });
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

    // Resolve reference + sequence
    let journalReference: string | null = prepared.journalReference;
    let sequenceMonth: string | null = null;
    let sequenceNumber: number | null = null;

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
      original_journal_id: batch.original_journal_id ?? null,

      // journal_source and recurring_template_id must remain consistent.
      journal_source: isRecurring ? 'generated_from_template' : 'one_off',
      recurring_template_id: isRecurring ? recurringTemplateId : null,

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
        transaction_date: batch.date,
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

      const valuesSql = entryMappings.map(() => '(?, ?)').join(', ');
      const valuesBindings = entryMappings.flatMap((m) => [
        m.journalEntryId,
        m.ledgerEntryId,
      ]);

      await txn.raw(
        `UPDATE journal_entries AS je
         SET ledger_entry_id = v.ledger_entry_id::uuid,
             updated_at = ?
         FROM (VALUES ${valuesSql}) AS v(journal_entry_id, ledger_entry_id)
         WHERE je.id = v.journal_entry_id::uuid`,
        [now, ...valuesBindings],
      );

      log('ledger_linked', {
        ledgerTransactionId,
        entriesCount: entryMappings.length,
      });
    }

    await writeJournalCreateAudit({
      entityId: journalBatchId,
      companyId: companyUUID,
      actor: { type: 'user', userId },
      payload: {
        status: batch.status,
        reference: journalReference,
        currencyId: journalCurrencyId,
        isFx,
        exchangeRate: isFx ? exchangeRate : null,
        entryCount: entries.length,
        totalDebits: prepared.totalDebits,
        totalCredits: prepared.totalCredits,
        contactId,
        isRecurring,
        ledgerTransactionId,
      },
      trx: txn,
    });

    log('audit_event_created', { action: 'journal.create' });

    // Auto-reversal scheduling handled after transaction commit
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

    if (data.status === 'posted' && data.autoReversalDate) {
      if (trx) {
        log('auto_reversal_deferred', {
          journalBatchId: result.journalBatchId,
          reason: 'external_transaction',
        });
      } else {
        scheduleJournalAutoReversal({
          journalBatchId: result.journalBatchId,
          companyId,
          reversalDate: data.autoReversalDate,
        }).catch((error) =>
          log(
            'auto_reversal_schedule_failed',
            {
              journalBatchId: result.journalBatchId,
              error: error instanceof Error ? error.message : String(error),
            },
            'error',
          ),
        );
      }
    }
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

export async function updateDraftJournal({
  journalBatchId,
  data,
  companyId,
  userId,
  trx,
}: {
  journalBatchId: string;
  data: UpdateDraftJournalData;
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    journalBatchId: string;
    journalId: string;
    journalReference: string | null;
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
    const fn =
      level === 'error' ? logger.error.bind(logger) : logger.info.bind(logger);
    fn(
      {
        traceId,
        phase,
        duration_ms,
        companyId,
        journalBatchId,
        ...data,
      },
      `[${traceId}] DraftJournalUpdate.${phase} (${duration_ms}ms)`,
    );
  };

  log('started', {
    entriesCount: data.entries?.length || 0,
    filesCount: data.files?.length || 0,
  });

  // If client includes `files`, treat it as "replace attachments".
  // If omitted, leave existing attachments untouched.
  const shouldReplaceFiles = Object.prototype.hasOwnProperty.call(
    data,
    'files',
  );

  const exec = async (
    txn: Knex.Transaction,
  ): Promise<{
    journalBatchId: string;
    journalId: string;
    journalReference: string | null;
  }> => {
    const now = new Date();
    const context = await resolveJournalCompanyContext({
      companyId,
      trx: txn,
      traceId,
    });
    const companyUUID = context.companyUUID;

    const existingBatch = await txn('journal_batches')
      .where('id', journalBatchId)
      .where('company_id', companyUUID)
      .where('is_deleted', false)
      .forUpdate()
      .first<{
        id: string;
        status: string;
        reference: string | null;
        ledger_transaction_id: string | null;
      }>('id', 'status', 'reference', 'ledger_transaction_id');

    if (!existingBatch) {
      throw new AppError(
        'Draft journal not found',
        { traceId, journalBatchId },
        false,
        ErrorCode.NOT_FOUND,
      );
    }

    if (existingBatch.status !== 'draft') {
      throw new AppError(
        'Only draft journals can be updated',
        { traceId, journalBatchId, status: existingBatch.status },
        false,
        ErrorCode.OPERATION_NOT_ALLOWED,
      );
    }

    if (existingBatch.ledger_transaction_id) {
      throw new AppError(
        'Draft journal has a ledger transaction and cannot be updated',
        {
          traceId,
          journalBatchId,
          ledgerTransactionId: existingBatch.ledger_transaction_id,
        },
        false,
        ErrorCode.OPERATION_NOT_ALLOWED,
      );
    }

    const prepared = await validateAndPrepareJournalInput({
      data,
      schema: updateDraftJournalDataCamel,
      context,
      trx: txn,
      traceId,
      journalBatchIdForRefUniqCheck: journalBatchId,
    });

    const batch = prepared.batch;
    const entries = prepared.entries;
    const files = prepared.files;

    if (entries.length !== data.entries.length) {
      log('zero_amount_filtered', {
        originalCount: data.entries.length,
        filteredCount: data.entries.length - entries.length,
      });
    }

    // Update journal batch (force draft invariants)
    await txn('journal_batches')
      .where('id', journalBatchId)
      .update({
        sequence_month: null,
        sequence_number: null,
        status: 'draft',
        ledger_transaction_id: null,

        reference: prepared.journalReference,
        company_id: companyUUID,
        currency_id: prepared.journalCurrencyId,
        exchange_rate: prepared.exchangeRate,

        date: batch.date,
        title: batch.title,
        description: batch.description,
        contact_id: prepared.contactId,

        note: batch.note,
        auto_reversal_date: batch.auto_reversal_date,
        original_journal_id: batch.original_journal_id ?? null,

        journal_source: prepared.isRecurring
          ? 'generated_from_template'
          : 'one_off',
        recurring_template_id: prepared.isRecurring
          ? prepared.recurringTemplateId
          : null,

        metadata: batch.metadata,

        updated_at: now,
        updated_by_id: userId,
      });

    // Replace entries (soft-delete old + insert new)
    const deletedEntriesCount = await txn('journal_entries')
      .where('journal_batch_id', journalBatchId)
      .where('is_deleted', false)
      .update({
        is_deleted: true,
        deleted_at: now,
        updated_at: now,
      });

    const entriesToInsert: NewJournalEntry[] = entries.map((entry) => ({
      journal_batch_id: journalBatchId,
      description: entry.description,
      side: entry.side,
      amount: Math.abs(entry.amount),
      coa_id: entry.coa_id,
      project_id: entry.project_id ?? null,
      created_at: now,
      updated_at: now,
    }));

    await txn('journal_entries').insert(entriesToInsert);
    log('entries_replaced', {
      entriesCount: entriesToInsert.length,
      deletedEntriesCount,
    });

    const filesToPersist: TxnFileInput[] = files.map((file) => ({
      ...file,
      source: 'journal',
      transaction_id: journalBatchId,
      entry_id: null,
    }));

    if (shouldReplaceFiles) {
      await syncTxnFilesForTarget({
        companyId,
        userId,
        source: 'journal',
        transactionId: journalBatchId,
        entryId: null,
        files: filesToPersist,
        mode: 'replace',
        trx: txn,
      });

      log('files_synced', {
        filesCount: filesToPersist.length,
        mode: 'replace',
      });
    } else if (filesToPersist.length > 0) {
      await persistTxnFiles({
        data: filesToPersist,
        companyId,
        userId,
        trx: txn,
      });

      log('files_persisted', { filesCount: filesToPersist.length });
    }

    await writeJournalUpdateAudit({
      entityId: journalBatchId,
      companyId: companyUUID,
      actor: { type: 'user', userId },
      payload: {
        previousStatus: 'draft',
        reference: prepared.journalReference,
        currencyId: prepared.journalCurrencyId,
        isFx: prepared.isFx,
        exchangeRate: prepared.isFx ? prepared.exchangeRate : null,
        entryCount: entries.length,
        totalDebits: prepared.totalDebits,
        totalCredits: prepared.totalCredits,
        contactId: prepared.contactId,
        isRecurring: prepared.isRecurring,
      },
      trx: txn,
    });

    log('audit_event_created', { action: 'journal.update' });

    return {
      journalBatchId,
      journalId: journalBatchId,
      journalReference: prepared.journalReference,
    };
  };

  try {
    if (trx) {
      const result = await exec(trx);
      return successResponse('Draft journal updated successfully', result);
    }
    const result = await knexClient.transaction(exec);
    return successResponse('Draft journal updated successfully', result);
  } catch (error) {
    log(
      'error',
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'error',
    );
    if (trx) throw mapPostJournalError(error);
    return errorResponse(
      'Failed to update draft journal',
      mapPostJournalError(error),
    );
  }
}

export async function voidDraftJournal({
  journalBatchId,
  companyId,
  userId,
  voidReason,
  trx,
}: {
  journalBatchId: string;
  companyId: string;
  userId: string;
  voidReason?: string | null;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<Record<string, never>>> {
  const startTime = Date.now();
  const traceId = randomUUID();

  const log = (
    phase: string,
    data?: Record<string, any>,
    level: 'info' | 'error' = 'info',
  ) => {
    const duration_ms = Date.now() - startTime;
    const fn =
      level === 'error' ? logger.error.bind(logger) : logger.info.bind(logger);
    fn(
      {
        traceId,
        phase,
        duration_ms,
        journalBatchId,
        companyId,
        userId,
        ...data,
      },
      `voidDraftJournal:${phase}`,
    );
  };

  log('starting');

  const exec = async (tx: Knex.Transaction): Promise<Record<string, never>> => {
    const companyUUID = await getCompanyUUID(companyId, tx);

    const journalBatch = await tx('journal_batches')
      .where('id', journalBatchId)
      .where('company_id', companyUUID)
      .where('is_deleted', false)
      .forUpdate()
      .first<{
        id: string;
        status: string;
        reference: string | null;
      }>('id', 'status', 'reference');

    if (!journalBatch) {
      throw new AppError(
        'Journal batch not found for company',
        { traceId, journalBatchId, companyId },
        false,
        ErrorCode.NOT_FOUND,
      );
    }

    if (journalBatch.status !== 'draft') {
      throw new AppError(
        'Only draft journals can be voided',
        { traceId, journalBatchId, status: journalBatch.status },
        false,
        ErrorCode.OPERATION_NOT_ALLOWED,
      );
    }

    const now = new Date();

    await tx('journal_batches').where('id', journalBatchId).update({
      status: 'voided',
      updated_by_id: userId,
      is_deleted: true,
      updated_at: now,
      deleted_at: now,
      voided_at: now,
    });

    await tx('journal_entries')
      .where('journal_batch_id', journalBatchId)
      .update({
        is_deleted: true,
        updated_at: now,
        deleted_at: now,
      });

    await writeJournalVoidAudit({
      entityId: journalBatchId,
      companyId: companyUUID,
      actor: { type: 'user', userId },
      payload: {
        previousStatus: 'draft',
        reference: journalBatch.reference ?? null,
        voidReason: voidReason ?? null,
      },
      notes: `Draft journal batch voided by user ${userId}${voidReason ? `: ${voidReason}` : ''}`,
      trx: tx,
    });

    return {};
  };

  try {
    if (trx) {
      const result = await exec(trx);
      return successResponse('Draft journal batch voided successfully', result);
    }
    const result = await knexClient.transaction(exec);
    return successResponse('Draft journal batch voided successfully', result);
  } catch (error) {
    log(
      'error',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'error',
    );
    if (trx) throw error;
    return errorResponse('Failed to void draft journal batch', {
      error: error instanceof Error ? error.message : 'Unknown error',
      traceId,
    });
  }
}

export async function postDraftJournal({
  journalBatchId,
  companyId,
  userId,
  trx,
}: {
  journalBatchId: string;
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    journalBatchId: string;
    journalId: string;
    journalReference: string;
    ledgerTransactionId: string;
  }>
> {
  const startTime = Date.now();
  const traceId = randomUUID();

  const log = (
    phase: string,
    data?: Record<string, any>,
    level: 'info' | 'error' = 'info',
  ) => {
    const duration_ms = Date.now() - startTime;
    const fn =
      level === 'error' ? logger.error.bind(logger) : logger.info.bind(logger);
    fn(
      {
        traceId,
        phase,
        duration_ms,
        journalBatchId,
        companyId,
        userId,
        ...data,
      },
      `postDraftJournal:${phase}`,
    );
  };

  log('starting');

  const exec = async (
    tx: Knex.Transaction,
  ): Promise<{
    journalBatchId: string;
    journalId: string;
    journalReference: string;
    ledgerTransactionId: string;
  }> => {
    const now = new Date();
    const context = await resolveJournalCompanyContext({
      companyId,
      trx: tx,
      traceId,
    });

    const journalBatch = await tx('journal_batches')
      .where('id', journalBatchId)
      .where('company_id', context.companyUUID)
      .where('is_deleted', false)
      .forUpdate()
      .first<{
        id: string;
        date: string;
        title: string;
        description: string | null;
        status: string;
        reference: string | null;
        currency_id: string;
        exchange_rate: string | number;
        contact_id: string | null;
        journal_source: JournalBatchSource;
        recurring_template_id: string | null;
        ledger_transaction_id: string | null;
        note: string | null;
        auto_reversal_date: string | null;
        original_journal_id: string | null;
        metadata: unknown | null;
      }>();

    if (!journalBatch) {
      throw new AppError(
        'Journal batch not found for company',
        { traceId, journalBatchId, companyId },
        false,
        ErrorCode.NOT_FOUND,
      );
    }

    if (journalBatch.status !== 'draft') {
      throw new AppError(
        'Only draft journals can be posted',
        { traceId, journalBatchId, status: journalBatch.status },
        false,
        ErrorCode.OPERATION_NOT_ALLOWED,
      );
    }

    if (journalBatch.ledger_transaction_id) {
      throw new AppError(
        'Draft journal has a ledger transaction and cannot be posted',
        {
          traceId,
          journalBatchId,
          ledgerTransactionId: journalBatch.ledger_transaction_id,
        },
        false,
        ErrorCode.OPERATION_NOT_ALLOWED,
      );
    }

    const journalEntries = await tx('journal_entries')
      .where('journal_batch_id', journalBatchId)
      .where('is_deleted', false)
      .orderBy('created_at', 'asc')
      .select<
        {
          id: string;
          description: string | null;
          side: 'debit' | 'credit';
          amount: string | number;
          coa_id: string;
          project_id: string | null;
          ledger_entry_id: string | null;
        }[]
      >('id', 'description', 'side', 'amount', 'coa_id', 'project_id', 'ledger_entry_id');

    if (journalEntries.length < 2) {
      throw new AppError(
        'At least two journal entries are required to post a draft journal',
        { traceId, journalBatchId, entryCount: journalEntries.length },
      );
    }

    if (journalEntries.some((e) => e.ledger_entry_id != null)) {
      throw new AppError(
        'Draft journal already has ledger links and cannot be posted',
        { traceId, journalBatchId },
        false,
        ErrorCode.OPERATION_NOT_ALLOWED,
      );
    }

    // Validate + normalize based on persisted draft fields
    const metadata =
      journalBatch.metadata &&
      typeof journalBatch.metadata === 'object' &&
      !Array.isArray(journalBatch.metadata)
        ? (journalBatch.metadata as Record<string, unknown>)
        : undefined;

    const inputForValidation: JournalBatchData = {
      status: 'posted',
      reference: journalBatch.reference,
      date: toYMD(journalBatch.date),
      title: journalBatch.title,
      description: journalBatch.description ?? undefined,
      contactId: journalBatch.contact_id ?? null,
      currencyId: journalBatch.currency_id,
      exchangeRate:
        journalBatch.exchange_rate != null
          ? Number(journalBatch.exchange_rate)
          : undefined,
      journalSource: journalBatch.journal_source,
      recurringTemplateId: journalBatch.recurring_template_id ?? null,
      note: journalBatch.note ?? undefined,
      autoReversalDate: journalBatch.auto_reversal_date
        ? toYMD(journalBatch.auto_reversal_date)
        : undefined,
      originalJournalId: journalBatch.original_journal_id ?? null,
      metadata,
      entries: journalEntries.map((e) => ({
        description: e.description ?? '',
        side: e.side,
        amount: Number(e.amount),
        coaId: e.coa_id,
        projectId: e.project_id ?? null,
      })),
    };

    const prepared = await validateAndPrepareJournalInput({
      data: inputForValidation,
      schema: journalBatchDataCamel,
      context,
      trx: tx,
      traceId,
      journalBatchIdForRefUniqCheck: journalBatchId,
    });

    // Fiscal period check (posting always)
    await ensureAndFetchFiscalCalendar({
      companyId: context.companyUUID,
      startYMD: toYMD(journalBatch.date),
      endYMD: toYMD(journalBatch.date),
      fetchTypes: ['monthly'],
      trx: tx,
    });

    // Allocate sequence + determine final reference
    const ref = await generateJournalReference({
      companyId: context.companyUUID,
      journalDate: toYMD(journalBatch.date),
      trx: tx,
    });

    const finalReference = prepared.journalReference?.trim()
      ? prepared.journalReference.trim()
      : ref.reference;

    const entryFsDate = toYMD(journalBatch.date);
    const idResult = await tx.raw<{
      rows: Array<{ id: string }>;
    }>('SELECT uuid_generate_v7() as id FROM generate_series(1, ?)', [
      journalEntries.length,
    ]);
    const ledgerEntryIds = idResult?.rows?.map((row) => row.id) ?? [];
    if (ledgerEntryIds.length !== journalEntries.length) {
      throw new AppError('Failed to allocate ledger entry IDs', {
        traceId,
        expected: journalEntries.length,
        received: ledgerEntryIds.length,
      });
    }

    const entryMappings = journalEntries.map((entry, index) => ({
      journalEntryId: entry.id,
      ledgerEntryId: ledgerEntryIds[index]!,
      fsDate: entryFsDate,
      entry: prepared.entries[index]!,
    }));

    const ledgerPayload: NewLedgerTransactionData = {
      transaction_date: journalBatch.date,
      transaction_source: 'manual_journal',
      categorization_source: 'manual',
      description: journalBatch.title,
      note: journalBatch.note ?? null,
      contact_id: journalBatch.contact_id ?? null,
      source_transaction_id: journalBatchId,
      source_transaction_currency_id: prepared.journalCurrencyId,
      transactions: entryMappings.map((m) => ({
        id: m.ledgerEntryId,
        fs_date: m.fsDate,
        coa_id: m.entry.coa_id,
        source_currency_id: prepared.journalCurrencyId,
        source_amount:
          m.entry.side === 'debit'
            ? Math.abs(m.entry.amount)
            : -Math.abs(m.entry.amount),
        description: m.entry.description ?? null,
        project_id: m.entry.project_id ?? null,
        custom_exchange_rate: prepared.isFx ? prepared.exchangeRate : undefined,
      })),
    } as const;

    const ledgerResult = await createLedgerRecord({
      data: ledgerPayload,
      companyId,
      userId,
      trx: tx,
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

    const ledgerTransactionId = ledgerResult.data.ledgerTransactionId as string;

    // Update batch + link entries
    await tx('journal_batches').where('id', journalBatchId).update({
      status: 'posted',
      reference: finalReference,
      sequence_month: ref.sequenceMonth,
      sequence_number: ref.sequenceNumber,
      ledger_transaction_id: ledgerTransactionId,
      updated_at: now,
      updated_by_id: userId,
    });

    const valuesSql = entryMappings.map(() => '(?, ?)').join(', ');
    const valuesBindings = entryMappings.flatMap((m) => [
      m.journalEntryId,
      m.ledgerEntryId,
    ]);

    await tx.raw(
      `UPDATE journal_entries AS je
       SET ledger_entry_id = v.ledger_entry_id::uuid,
           updated_at = ?
       FROM (VALUES ${valuesSql}) AS v(journal_entry_id, ledger_entry_id)
       WHERE je.id = v.journal_entry_id::uuid`,
      [now, ...valuesBindings],
    );

    await writeJournalPostAudit({
      entityId: journalBatchId,
      companyId: context.companyUUID,
      actor: { type: 'user', userId },
      payload: {
        previousStatus: 'draft',
        reference: finalReference,
        currencyId: prepared.journalCurrencyId,
        isFx: prepared.isFx,
        exchangeRate: prepared.isFx ? prepared.exchangeRate : null,
        entryCount: prepared.entries.length,
        totalDebits: prepared.totalDebits,
        totalCredits: prepared.totalCredits,
        contactId: prepared.contactId,
        isRecurring: prepared.isRecurring,
        ledgerTransactionId,
        sequenceMonth: ref.sequenceMonth,
        sequenceNumber: ref.sequenceNumber,
      },
      trx: tx,
    });

    return {
      journalBatchId,
      journalId: journalBatchId,
      journalReference: finalReference,
      ledgerTransactionId,
    };
  };

  try {
    let autoReversalDate: string | null = null;

    const result = trx
      ? await exec(trx)
      : await knexClient.transaction(async (tx) => {
          const posted = await exec(tx);
          const row = await tx('journal_batches')
            .where('id', journalBatchId)
            .first<{ auto_reversal_date: string | null }>('auto_reversal_date');
          autoReversalDate = row?.auto_reversal_date ?? null;
          return posted;
        });

    if (!trx && autoReversalDate) {
      scheduleJournalAutoReversal({
        journalBatchId,
        companyId,
        reversalDate: autoReversalDate,
      }).catch((error) =>
        log(
          'auto_reversal_schedule_failed',
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'error',
        ),
      );
    }

    return successResponse('Draft journal posted successfully', result);
  } catch (error) {
    log(
      'error',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'error',
    );
    if (trx) throw mapPostJournalError(error);
    return errorResponse(
      'Failed to post draft journal',
      mapPostJournalError(error),
    );
  }
}

export async function postDraftJournalsBatch({
  companyId,
  userId,
  journalIds,
  mode,
  trx,
}: {
  companyId: string;
  userId: string;
  journalIds: string[];
  mode: 'partial' | 'all_or_nothing';
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    results: Array<{
      journalId: string;
      success: boolean;
      journalReference?: string;
      ledgerTransactionId?: string;
      code?: string;
      message?: string;
      error?: unknown;
    }>;
    summary: { total: number; posted: number; failed: number };
  }>
> {
  const uniqueIds: string[] = [];
  const seen = new Set<string>();
  for (const id of journalIds) {
    if (!seen.has(id)) {
      seen.add(id);
      uniqueIds.push(id);
    }
  }

  if (uniqueIds.length === 0) {
    return errorResponse('At least one journalId is required', undefined, {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  if (mode === 'partial') {
    const results: Array<{
      journalId: string;
      success: boolean;
      journalReference?: string;
      ledgerTransactionId?: string;
      code?: string;
      message?: string;
      error?: unknown;
    }> = [];

    for (const journalId of uniqueIds) {
      try {
        const res = await postDraftJournal({
          journalBatchId: journalId,
          companyId,
          userId,
          trx,
        });

        if (res.success && res.data) {
          results.push({
            journalId,
            success: true,
            journalReference: res.data.journalReference,
            ledgerTransactionId: res.data.ledgerTransactionId,
          });
        } else {
          results.push({
            journalId,
            success: false,
            code: res.code,
            message: res.message,
            error: res.error,
          });
        }
      } catch (error: unknown) {
        results.push({
          journalId,
          success: false,
          code: ErrorCode.GENERIC,
          message: 'Failed to post draft journal',
          error,
        });
      }
    }

    const posted = results.filter((r) => r.success).length;
    const failed = results.length - posted;
    return successResponse('Batch processed', {
      results,
      summary: { total: results.length, posted, failed },
    });
  }

  let failedJournalId: string | null = null;

  try {
    const results: Array<{
      journalId: string;
      success: boolean;
      journalReference?: string;
      ledgerTransactionId?: string;
    }> = [];

    const exec = async (tx: Knex.Transaction) => {
      for (const journalId of uniqueIds) {
        failedJournalId = journalId;
        const res = await postDraftJournal({
          journalBatchId: journalId,
          companyId,
          userId,
          trx: tx,
        });
        if (!res.success || !res.data) {
          throw new AppError(
            'Failed to post draft journal',
            { journalId, response: res },
            false,
            ErrorCode.GENERIC,
          );
        }
        results.push({
          journalId,
          success: true,
          journalReference: res.data.journalReference,
          ledgerTransactionId: res.data.ledgerTransactionId,
        });
      }
    };

    if (trx) {
      await exec(trx);
    } else {
      await knexClient.transaction(exec);
    }

    // Auto-reversal scheduling handled after commit (only when we control the txn)
    if (!trx) {
      const rows = await knexClient('journal_batches')
        .whereIn('id', uniqueIds)
        .select<
          { id: string; auto_reversal_date: string | null }[]
        >('id', 'auto_reversal_date');

      for (const row of rows) {
        if (!row.auto_reversal_date) continue;
        scheduleJournalAutoReversal({
          journalBatchId: row.id,
          companyId,
          reversalDate: row.auto_reversal_date,
        }).catch(() => {});
      }
    }

    return successResponse('Batch posted successfully', {
      results,
      summary: { total: results.length, posted: results.length, failed: 0 },
    });
  } catch (error: unknown) {
    if (trx) throw error;
    return errorResponse(
      'Failed to post draft journals',
      error,
      failedJournalId ? { metadata: { failedJournalId } } : undefined,
    );
  }
}

export async function voidDraftJournalsBatch({
  companyId,
  userId,
  journalIds,
  voidReason,
  mode,
  trx,
}: {
  companyId: string;
  userId: string;
  journalIds: string[];
  voidReason?: string | null;
  mode: 'partial' | 'all_or_nothing';
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    results: Array<{
      journalId: string;
      success: boolean;
      code?: string;
      message?: string;
      error?: unknown;
    }>;
    summary: { total: number; voided: number; failed: number };
  }>
> {
  const uniqueIds: string[] = [];
  const seen = new Set<string>();
  for (const id of journalIds) {
    if (!seen.has(id)) {
      seen.add(id);
      uniqueIds.push(id);
    }
  }

  if (uniqueIds.length === 0) {
    return errorResponse('At least one journalId is required', undefined, {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  if (mode === 'partial') {
    const results: Array<{
      journalId: string;
      success: boolean;
      code?: string;
      message?: string;
      error?: unknown;
    }> = [];

    for (const journalId of uniqueIds) {
      try {
        const res = await voidDraftJournal({
          journalBatchId: journalId,
          companyId,
          userId,
          voidReason,
          trx,
        });

        results.push(
          res.success
            ? { journalId, success: true }
            : {
                journalId,
                success: false,
                code: res.code,
                message: res.message,
                error: res.error,
              },
        );
      } catch (error: unknown) {
        results.push({
          journalId,
          success: false,
          code: ErrorCode.GENERIC,
          message: 'Failed to void draft journal',
          error,
        });
      }
    }

    const voided = results.filter((r) => r.success).length;
    const failed = results.length - voided;
    return successResponse('Batch processed', {
      results,
      summary: { total: results.length, voided, failed },
    });
  }

  let failedJournalId: string | null = null;

  try {
    const results: Array<{ journalId: string; success: boolean }> = [];

    const exec = async (tx: Knex.Transaction) => {
      for (const journalId of uniqueIds) {
        failedJournalId = journalId;
        const res = await voidDraftJournal({
          journalBatchId: journalId,
          companyId,
          userId,
          voidReason,
          trx: tx,
        });
        if (!res.success) {
          throw new AppError(
            'Failed to void draft journal',
            { journalId, response: res },
            false,
            ErrorCode.GENERIC,
          );
        }
        results.push({ journalId, success: true });
      }
    };

    if (trx) {
      await exec(trx);
    } else {
      await knexClient.transaction(exec);
    }

    return successResponse('Batch voided successfully', {
      results,
      summary: { total: results.length, voided: results.length, failed: 0 },
    });
  } catch (error: unknown) {
    if (trx) throw error;
    return errorResponse(
      'Failed to void draft journals',
      error,
      failedJournalId ? { metadata: { failedJournalId } } : undefined,
    );
  }
}

export async function reverseJournalRecord({
  journalBatchId,
  companyId,
  userId,
  reversalReason,
  reversalDate,
  trx,
}: {
  journalBatchId: string;
  companyId: string;
  userId: string;
  reversalReason?: string;
  reversalDate?: Date;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ reversalJournalId?: string }>> {
  const startTime = Date.now();
  const traceId = randomUUID();

  const log = (
    phase: string,
    data?: Record<string, any>,
    level: 'info' | 'error' = 'info',
  ) => {
    const duration_ms = Date.now() - startTime;
    const fn =
      level === 'error' ? logger.error.bind(logger) : logger.info.bind(logger);
    fn(
      {
        traceId,
        phase,
        duration_ms,
        journalBatchId,
        companyId,
        userId,
        ...data,
      },
      `reverseJournalRecord:${phase}`,
    );
  };

  log('starting');

  const exec = async (
    tx: Knex.Transaction,
  ): Promise<{ reversalJournalId?: string }> => {
    const companyUUID = await getCompanyUUID(companyId, tx);

    const journalBatch = await tx('journal_batches')
      .where('id', journalBatchId)
      .where('company_id', companyUUID)
      .where('is_deleted', false)
      .forUpdate()
      .first();

    if (!journalBatch) {
      throw new Error('Journal batch not found for company');
    }

    if (journalBatch.status === 'voided') {
      throw new Error('Journal batch is already voided');
    }

    if (journalBatch.reversed_at || journalBatch.reversal_journal_id) {
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
        voided_at: new Date(),
      });

      await tx('journal_entries')
        .where('journal_batch_id', journalBatchId)
        .update({
          is_deleted: true,
          updated_at: new Date(),
          deleted_at: new Date(),
        });

      log('draft_journal_voided');

      await writeJournalVoidAudit({
        entityId: journalBatchId,
        companyId: journalBatch.company_id,
        actor: { type: 'user', userId },
        payload: {
          previousStatus: 'draft',
          reference: journalBatch.reference ?? null,
          voidReason: null,
        },
        notes: `Draft journal batch voided by user ${userId}`,
        trx: tx,
      });

      log('audit_event_created');

      return {};
    }

    log('handling_posted_journal');

    if (!journalBatch.ledger_transaction_id) {
      throw new Error('Posted journal must have a ledger transaction');
    }

    const originalEntries = await tx('journal_entries')
      .where('journal_batch_id', journalBatchId)
      .where('is_deleted', false)
      .select('coa_id', 'amount', 'side', 'description', 'project_id');

    if (originalEntries.length === 0) {
      throw new Error('No journal entries found for reversal');
    }

    const reversingEntries = originalEntries.map((entry) => ({
      coaId: entry.coa_id,
      projectId: entry.project_id ?? null,
      amount: Number(entry.amount),
      side: entry.side === 'debit' ? ('credit' as const) : ('debit' as const),
      description: `Reversal: ${entry.description || journalBatch.title}`,
    }));

    const effectiveReversalDate = toYMD(
      reversalDate ? reversalDate : journalBatch.date,
    );

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
        exchangeRate: journalBatch.exchange_rate
          ? Number(journalBatch.exchange_rate)
          : undefined,
        originalJournalId: journalBatchId,
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
        reversal_journal_id: reversalResult.data.journalBatchId,
        updated_by_id: userId,
        updated_at: new Date(),
      });

    log('original_journal_marked_reversed');

    await writeJournalReverseAudit({
      entityId: journalBatchId,
      companyId: journalBatch.company_id,
      actor: { type: 'user', userId },
      payload: {
        previousStatus: 'posted',
        reference: journalBatch.reference ?? null,
        ledgerTransactionId: journalBatch.ledger_transaction_id,
        reversalJournalId: reversalResult.data.journalBatchId,
        reversalReference: reversalResult.data.journalReference ?? null,
        reversalDate: effectiveReversalDate,
        reversalReason: reversalReason ?? null,
      },
      notes: `Posted journal batch reversed by user ${userId}${reversalReason ? `: ${reversalReason}` : ''}`,
      trx: tx,
    });

    log('audit_event_created');

    return { reversalJournalId: reversalResult.data.journalBatchId };
  };

  try {
    if (trx) {
      const result = await exec(trx);
      return successResponse('Journal batch reversed successfully', result);
    }
    const result = await knexClient.transaction(exec);
    return successResponse('Journal batch reversed successfully', result);
  } catch (error) {
    log(
      'error',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'error',
    );
    if (trx) throw error;
    return errorResponse('Failed to reverse journal batch', {
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
