import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import z from 'zod';

import { knexClient } from '../../db/knexClient.js';
import { toYMD } from '../../shared/index.js';
import { logger } from '../../shared/utils/logger.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  AppError,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  journalsCursor,
  listJournalsCursorQuery,
  listJournalsPageQuery,
} from './journals.types.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type {
  GetJournalResponse,
  JournalDetailEntry,
  JournalListCursorResponse,
  JournalListPageResponse,
  JournalListRow,
  JournalsCursor,
  ListJournalsCursorQuery,
  ListJournalsFilters,
  ListJournalsPageQuery,
  RelatedJournalSummary,
} from './journals.types.js';

const JOURNAL_BATCHES = 'journal_batches';
const JOURNAL_ENTRIES = 'journal_entries';
const CONTACTS = 'contacts';
const CURRENCIES = 'currencies';

// ============================================================================
// Get Journals Query
// ============================================================================
type SortBy = ListJournalsFilters['sortBy'];

const JournalListSelect = {
  id: 'jb.id',
  companyId: 'jb.company_id',

  reference: 'jb.reference',
  sequenceMonth: 'jb.sequence_month',
  sequenceNumber: 'jb.sequence_number',

  date: 'jb.date',
  title: 'jb.title',
  description: 'jb.description',

  status: 'jb.status',
  note: 'jb.note',

  contactId: 'jb.contact_id',
  contactName: 'c.display_name',
  currencyId: 'jb.currency_id',
  currencyCode: 'cur.code',
  currencyName: 'cur.name',
  currencySymbol: 'cur.symbol',
  exchangeRate: 'jb.exchange_rate',

  ledgerTransactionId: 'jb.ledger_transaction_id',

  isRecurring: 'jb.is_recurring',
  recurringTemplateId: 'jb.recurring_template_id',

  autoReversalDate: 'jb.auto_reversal_date',

  reversalJournalId: 'jb.reversal_journal_id',
  originalJournalId: 'jb.original_journal_id',

  reversedAt: 'jb.reversed_at',
  reversalReason: 'jb.reversal_reason',
  reversedById: 'jb.reversed_by_id',

  voidedAt: 'jb.voided_at',

  metadata: 'jb.metadata',

  createdAt: 'jb.created_at',
  createdById: 'jb.created_by_id',

  updatedAt: 'jb.updated_at',
  updatedById: 'jb.updated_by_id',

  isDeleted: 'jb.is_deleted',
  deletedAt: 'jb.deleted_at',
};

const SORT_COL: Record<SortBy, string> = {
  created_at: 'jb.created_at',
  date: 'jb.date',
  reference: 'jb.reference',
} as const;

function selectAliasedFields(
  db: Knex | Knex.Transaction,
  fields: Record<string, string>,
) {
  return Object.entries(fields).map(([alias, column]) =>
    db.raw(`${column} as "${alias}"`),
  );
}

/**
 * Build base query for journals list with company scope, filters, search, and ordering
 */
function buildJournalsBaseQuery(
  filters: ListJournalsFilters,
  companyUUID: string,
  trx?: Knex.Transaction,
): Knex.QueryBuilder {
  const db = trx || knexClient;

  const {
    status,
    dateFrom,
    dateTo,
    searchQuery,
    isRecurring,
    contactId,
    currencyId,
    includeDeleted,
  } = filters;

  const selectFields = selectAliasedFields(db, JournalListSelect);

  const computedFields = [
    db.raw(
      `COALESCE((
        SELECT SUM(amount)
        FROM journal_entries je
        WHERE je.journal_batch_id = jb.id
          AND je.side = 'debit'
          AND (
            (jb.status <> 'voided' AND je.is_deleted = false)
            OR (jb.status = 'voided' AND je.deleted_at = jb.deleted_at)
          )
      ), 0) as "totalDebit"`,
    ),
    db.raw(
      `COALESCE((
        SELECT SUM(amount)
        FROM journal_entries je
        WHERE je.journal_batch_id = jb.id
          AND je.side = 'credit'
          AND (
            (jb.status <> 'voided' AND je.is_deleted = false)
            OR (jb.status = 'voided' AND je.deleted_at = jb.deleted_at)
          )
      ), 0) as "totalCredit"`,
    ),
  ];

  // Base query: scope by company and soft delete
  const qb = db
    .from({ jb: JOURNAL_BATCHES })
    .leftJoin({ c: CONTACTS }, 'c.id', 'jb.contact_id')
    .innerJoin({ cur: CURRENCIES }, 'cur.id', 'jb.currency_id')
    .select([...selectFields, ...computedFields])
    .where('jb.company_id', companyUUID);

  if (!includeDeleted) {
    qb.where('jb.is_deleted', false);
  }

  // Apply filters
  if (status) {
    qb.where('jb.status', status);
  }

  if (dateFrom) {
    qb.where('jb.date', '>=', dateFrom);
  }

  if (dateTo) {
    qb.where('jb.date', '<=', dateTo);
  }

  if (isRecurring !== undefined) {
    qb.where('jb.is_recurring', isRecurring);
  }

  if (contactId) {
    qb.where('jb.contact_id', contactId);
  }

  if (currencyId) {
    qb.where('jb.currency_id', currencyId);
  }

  const q = searchQuery?.trim();
  if (q) {
    qb.where((w) => {
      w.whereRaw('jb.search_text % ?', [q]).orWhereILike(
        'jb.search_text',
        `%${q}%`,
      );
    });
  }

  // Apply ordering
  const col = SORT_COL[filters.sortBy];
  qb.orderBy([
    { column: col, order: filters.sortDir },
    { column: 'jb.id', order: filters.sortDir },
  ]);

  return qb;
}

/**
 * List journals with pagination
 * Returns header data only (no entries array)
 * Includes computed total debit/credit per journal
 */
export async function getJournalsByPage({
  userId,
  queryData,
  companyId,
  trx,
}: {
  queryData: ListJournalsPageQuery;
  userId: string;
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<JournalListPageResponse>> {
  const traceId = randomUUID();
  const startTime = Date.now();

  const parsed = listJournalsPageQuery.safeParse(queryData);
  if (!parsed.success) {
    return errorResponse('Invalid query parameters', {
      traceId,
      issues: parsed.error.issues,
    });
  }

  const { page, pageSize, ...filters } = parsed.data;

  const exec = async (txn: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, txn);
    if (!companyUUID) {
      throw new AppError(`Company not found: ${companyId}`, { traceId });
    }

    const baseQuery = buildJournalsBaseQuery(filters, companyUUID, txn);

    // total count
    const countRow = await baseQuery
      .clone()
      .clearSelect()
      .clearOrder()
      .clearGroup()
      .count<{ count: string }>('* as count')
      .first();

    const total = Number(countRow?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;

    const rows = (await baseQuery
      .clone()
      .limit(pageSize)
      .offset(offset)) as unknown as JournalListRow[];

    return {
      journals: rows,
      pagination: { page, pageSize, total, totalPages },
      companyUUID,
    };
  };

  try {
    const run = async (t: Knex.Transaction) => exec(t);
    const { journals, pagination, companyUUID } = trx
      ? await exec(trx)
      : await knexClient.transaction(run);

    const duration = Date.now() - startTime;
    logger.info(
      { traceId, companyId, companyUUID, userId, duration, ...pagination },
      'listJournals completed',
    );

    return successResponse('Journals retrieved successfully', {
      journals,
      pagination,
    });
  } catch (error) {
    if (trx) throw error;

    const duration = Date.now() - startTime;
    logger.error(
      {
        traceId,
        companyId,
        userId,
        duration,
        err: error instanceof Error ? error.message : String(error),
      },
      'listJournals failed',
    );

    return errorResponse('Failed to list journals', {
      traceId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Encode cursor payload to base64url string (opaque to clients)
 */
function encodeCursor(payload: JournalsCursor): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decode and validate cursor from base64url string
 * Throws AppError if cursor is invalid or malformed
 */
function decodeCursor(cursor: string, traceId: string): JournalsCursor {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = journalsCursor.safeParse(JSON.parse(json));
    if (!parsed.success) {
      throw new AppError('Invalid cursor', {
        traceId,
        issues: parsed.error.issues,
      });
    }
    return parsed.data;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('Invalid cursor format', { traceId });
  }
}

/**
 * Apply keyset pagination cursor to query builder
 * Uses composite (sortColumn, id) comparison for stable pagination
 *
 * @example
 * // For DESC order: get rows WHERE (date, id) < (lastDate, lastId)
 * // For ASC order: get rows WHERE (date, id) > (lastDate, lastId)
 */
function applyKeysetCursor(
  qb: Knex.QueryBuilder,
  db: Knex | Knex.Transaction,
  filters: Pick<ListJournalsFilters, 'sortBy' | 'sortDir'>,
  cursor: JournalsCursor,
) {
  // Prevent cursor reuse across different sort settings
  // This ensures pagination remains consistent
  if (cursor.sortBy !== filters.sortBy || cursor.sortDir !== filters.sortDir) {
    throw new AppError('Cursor sort does not match request sort', {
      cursorSortBy: cursor.sortBy,
      cursorSortDir: cursor.sortDir,
      requestSortBy: filters.sortBy,
      requestSortDir: filters.sortDir,
    });
  }

  const sortCol = SORT_COL[filters.sortBy];
  // DESC: get earlier rows (< cursor), ASC: get later rows (> cursor)
  const op = filters.sortDir === 'asc' ? '>' : '<';

  // Composite key comparison: (sortColumn, id) for stable ordering
  qb.andWhere(
    db.raw(`(${sortCol}, jb.id) ${op} (?, ?)`, [cursor.value, cursor.id]),
  );
}

/**
 * Extract sort value from journal row based on sortBy field
 * Returns string representation of the value for cursor encoding
 */
function getSortValueFromRow(
  row: JournalListRow,
  sortBy: ListJournalsFilters['sortBy'],
  traceId: string,
): string {
  switch (sortBy) {
    case 'created_at':
      return String(row.createdAt);
    case 'date':
      return String(row.date);
    case 'reference':
      if (!row.reference || row.reference.length === 0) {
        throw new AppError('Cannot build cursor: reference is null/empty', {
          traceId,
        });
      }
      return String(row.reference);
  }
}

/**
 * List journals with cursor-based pagination
 * Returns header data only (no entries array)
 * Includes computed total debit/credit per journal
 * Cursor format: base64 encoded JSON with {sortCol, id}
 */
export async function getJournalsByCursor({
  userId,
  queryData,
  companyId,
  trx,
}: {
  queryData: ListJournalsCursorQuery;
  userId: string;
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<JournalListCursorResponse>> {
  const traceId = randomUUID();
  const startTime = Date.now();

  const parsed = listJournalsCursorQuery.safeParse(queryData);
  if (!parsed.success) {
    return errorResponse('Invalid query parameters', {
      traceId,
      issues: parsed.error.issues,
    });
  }

  const { limit, cursor: cursorStr, ...filters } = parsed.data;

  const exec = async (txn: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, txn);
    if (!companyUUID) {
      throw new AppError(`Company not found: ${companyId}`, { traceId });
    }

    const qb = buildJournalsBaseQuery(filters, companyUUID, txn);

    // If sorting by reference, require reference to be non-null for deterministic keyset paging
    if (filters.sortBy === 'reference') {
      qb.whereNotNull('jb.reference');
    }

    // Apply cursor condition
    if (cursorStr) {
      const cursor = decodeCursor(cursorStr, traceId);
      applyKeysetCursor(qb, txn, filters, cursor);
    }

    // limit+1
    const rows = (await qb
      .clone()
      .limit(limit + 1)) as unknown as JournalListRow[];

    const hasMore = rows.length > limit;
    const journals = hasMore ? rows.slice(0, limit) : rows;

    // Build next cursor from the last returned row
    let nextCursor: string | null = null;
    if (hasMore && journals.length) {
      const last = journals[journals.length - 1];
      const value = getSortValueFromRow(last, filters.sortBy, traceId);

      nextCursor = encodeCursor({
        v: 1,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
        value,
        id: last.id,
      });
    }

    return { journals, nextCursor, hasMore, companyUUID };
  };

  try {
    const run = async (t: Knex.Transaction) => exec(t);
    const { journals, nextCursor, hasMore, companyUUID } = trx
      ? await exec(trx)
      : await knexClient.transaction(run);

    const duration = Date.now() - startTime;
    logger.info(
      {
        traceId,
        userId,
        companyId,
        companyUUID,
        duration,
        limit,
        count: journals.length,
        hasMore,
      },
      'getJournalsByCursor completed',
    );

    return successResponse('Journals retrieved successfully', {
      journals,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    if (trx) throw error;

    const duration = Date.now() - startTime;
    logger.error(
      {
        traceId,
        userId,
        companyId,
        duration,
        err: error instanceof Error ? error.message : String(error),
      },
      'getJournalsByCursor failed',
    );

    return errorResponse('Failed to list journals', {
      traceId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================================================
// Get Journal - Single Journal with Entries and Audit Trail
// ============================================================================

/**
 * Get a single journal with its entries and related journals
 */
export async function getJournal({
  journalId,
  companyId,
  includeLedgerTotals = false,
  includeFiles = false,
  includeDeleted = false,
  trx,
}: {
  journalId: string;
  companyId: string;
  includeLedgerTotals?: boolean;
  includeFiles?: boolean;
  includeDeleted?: boolean;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<GetJournalResponse>> {
  const traceId = randomUUID();
  const startTime = Date.now();

  try {
    const db = trx || knexClient;

    const companyUUID = await getCompanyUUID(companyId, trx);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`, { traceId });
    }

    const journalHeaderSelectFields = selectAliasedFields(
      db,
      JournalListSelect,
    );
    const computedFields = [
      db.raw(
        `COALESCE((SELECT SUM(amount) FROM journal_entries je WHERE je.journal_batch_id = jb.id AND je.side = 'debit' AND ((jb.status <> 'voided' AND je.is_deleted = false) OR (jb.status = 'voided' AND je.deleted_at = jb.deleted_at))), 0) as "totalDebit"`,
      ),
      db.raw(
        `COALESCE((SELECT SUM(amount) FROM journal_entries je WHERE je.journal_batch_id = jb.id AND je.side = 'credit' AND ((jb.status <> 'voided' AND je.is_deleted = false) OR (jb.status = 'voided' AND je.deleted_at = jb.deleted_at))), 0) as "totalCredit"`,
      ),
    ];

    const journalQb = db
      .from({ jb: JOURNAL_BATCHES })
      .leftJoin({ c: CONTACTS }, 'c.id', 'jb.contact_id')
      .innerJoin({ cur: CURRENCIES }, 'cur.id', 'jb.currency_id')
      .where('jb.id', journalId)
      .where('jb.company_id', companyUUID)
      .select([...journalHeaderSelectFields, ...computedFields])
      .first();

    if (!includeDeleted) {
      journalQb.where('jb.is_deleted', false);
    }

    const journal = (await journalQb) as unknown as
      | GetJournalResponse['journal']
      | undefined;

    if (!journal) {
      return errorResponse(`Journal not found: ${journalId}`, { traceId });
    }

    let files: GetJournalResponse['files'] | undefined;
    if (includeFiles) {
      const rows = await db
        .from({ fa: 'file_attachments' })
        .innerJoin({ f: 'files' }, 'f.id', 'fa.file_id')
        .where('fa.source', 'journal')
        .where('fa.transaction_id', journalId)
        .where('fa.is_deleted', false)
        .where('f.company_id', companyUUID)
        .where('f.is_deleted', false)
        .select<
          {
            id: string;
            name: string;
            key: string;
            url: string;
            type: string;
            bucket_name: string;
            size_bytes: string | number | bigint;
            checksum: string | null;
            provider: string | null;
            region: string | null;
            endpoint: string | null;
            transaction_id: string;
            entry_id: string | null;
          }[]
        >(
          db.raw(`fa.id as "id"`),
          db.raw(`f.name as "name"`),
          db.raw(`f.key as "key"`),
          db.raw(`f.url as "url"`),
          db.raw(`f.mime_type as "type"`),
          db.raw(`f.bucket_name as "bucket_name"`),
          db.raw(`f.size_bytes as "size_bytes"`),
          db.raw(`f.checksum as "checksum"`),
          db.raw(`f.provider as "provider"`),
          db.raw(`f.region as "region"`),
          db.raw(`f.endpoint as "endpoint"`),
          db.raw(`fa.transaction_id as "transaction_id"`),
          db.raw(`fa.entry_id as "entry_id"`),
        )
        .orderBy([
          { column: 'fa.attached_at', order: 'asc' },
          { column: 'fa.id', order: 'asc' },
        ]);

      files = rows.map((r) => ({
        id: r.id,
        name: r.name,
        key: r.key,
        url: r.url,
        type: r.type,
        bucket_name: r.bucket_name,
        size_bytes: String(r.size_bytes),
        checksum: r.checksum ?? null,
        provider: r.provider ?? null,
        region: r.region ?? null,
        endpoint: r.endpoint ?? null,
        transaction_id: r.transaction_id,
        entry_id: r.entry_id ?? null,
      }));
    }

    const entriesRaw = (await db
      .from({ je: JOURNAL_ENTRIES })
      .innerJoin({ jb: JOURNAL_BATCHES }, 'jb.id', 'je.journal_batch_id')
      .innerJoin({ coa: 'coa' }, 'coa.id', 'je.coa_id')
      .leftJoin({ p: 'projects' }, 'p.id', 'je.project_id')
      .where('je.journal_batch_id', journalId)
      .where('jb.company_id', companyUUID)
      .andWhere((w) => {
        w.where((active) =>
          active.whereNot('jb.status', 'voided').where('je.is_deleted', false),
        ).orWhere((voided) =>
          voided
            .where('jb.status', 'voided')
            .whereRaw('je.deleted_at = jb.deleted_at'),
        );
      })
      .where('coa.is_deleted', false)
      .where('coa.company_id', companyUUID)
      .select([
        db.raw(`je.id as "id"`),
        db.raw(`COALESCE(je.description, '') as "description"`),
        db.raw(`je.side as "side"`),
        db.raw(`je.amount as "amount"`),
        db.raw(`je.coa_id as "coaId"`),
        db.raw(`coa.code as "coaCode"`),
        db.raw(`coa.name as "coaName"`),
        db.raw(`je.project_id as "projectId"`),
        db.raw(`p.name as "projectName"`),
        db.raw(`je.ledger_entry_id as "ledgerEntryId"`),
        db.raw(`je.ledger_entry_fs_date as "ledgerEntryFsDate"`),
        db.raw(`je.created_at as "createdAt"`),
        db.raw(`je.updated_at as "updatedAt"`),
      ])
      .orderBy([
        { column: 'je.created_at', order: 'asc' },
        { column: 'je.id', order: 'asc' },
      ])) as unknown as Array<
      Omit<JournalDetailEntry, 'amount'> & { amount: string | number }
    >;

    const entries: JournalDetailEntry[] = entriesRaw.map((e) => ({
      ...e,
      amount: Number(e.amount),
    }));

    const relatedJournals: GetJournalResponse['relatedJournals'] = {
      reversalJournal: null,
      originalJournal: null,
    };

    if (journal.reversalJournalId) {
      const reversal = (await db
        .from({ rjb: JOURNAL_BATCHES })
        .where('rjb.id', journal.reversalJournalId)
        .where('rjb.company_id', companyUUID)
        .where('rjb.is_deleted', false)
        .select([
          db.raw(`rjb.id as "id"`),
          db.raw(`rjb.reference as "reference"`),
          db.raw(`rjb.date as "date"`),
          db.raw(`rjb.title as "title"`),
        ])
        .first()) as unknown as RelatedJournalSummary | undefined;

      relatedJournals.reversalJournal = reversal ?? null;
    }

    if (journal.originalJournalId) {
      const original = (await db
        .from({ ojb: JOURNAL_BATCHES })
        .where('ojb.id', journal.originalJournalId)
        .where('ojb.company_id', companyUUID)
        .where('ojb.is_deleted', false)
        .select([
          db.raw(`ojb.id as "id"`),
          db.raw(`ojb.reference as "reference"`),
          db.raw(`ojb.date as "date"`),
          db.raw(`ojb.title as "title"`),
        ])
        .first()) as unknown as RelatedJournalSummary | undefined;

      relatedJournals.originalJournal = original ?? null;
    }

    let ledgerTotals: GetJournalResponse['ledgerTotals'] = null;
    if (
      includeLedgerTotals &&
      journal.status === 'posted' &&
      journal.ledgerTransactionId
    ) {
      const totals = await db
        .from({ le: 'ledger_entries' })
        .innerJoin(
          { lt: 'ledger_transactions' },
          'lt.id',
          'le.ledger_transaction_id',
        )
        .where('le.ledger_transaction_id', journal.ledgerTransactionId)
        .where('le.is_deleted', false)
        .where('lt.is_deleted', false)
        .where('lt.company_id', companyUUID)
        .select([
          db.raw(
            `COALESCE(SUM(CASE WHEN le.transaction_side = 'debit' THEN le.absolute_amount ELSE 0 END), 0) as "totalDebit"`,
          ),
          db.raw(
            `COALESCE(SUM(CASE WHEN le.transaction_side = 'credit' THEN le.absolute_amount ELSE 0 END), 0) as "totalCredit"`,
          ),
        ])
        .first<{ totalDebit: string | number; totalCredit: string | number }>();

      ledgerTotals = {
        totalDebit: Number(totals?.totalDebit ?? 0),
        totalCredit: Number(totals?.totalCredit ?? 0),
      };
    }

    const duration = Date.now() - startTime;
    logger.info(
      { traceId, companyId, companyUUID, journalId, duration },
      'getJournal completed',
    );

    return successResponse('Journal retrieved successfully', {
      journal,
      entries,
      files,
      ledgerTotals,
      relatedJournals,
    });
  } catch (error) {
    if (trx) throw error;

    const duration = Date.now() - startTime;
    logger.error(
      {
        traceId,
        companyId,
        journalId,
        duration,
        err: error instanceof Error ? error.message : String(error),
      },
      'getJournal failed',
    );

    return errorResponse('Failed to retrieve journal', {
      traceId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
