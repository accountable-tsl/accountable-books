import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import z from 'zod';

import { knexClient } from '../../db/knexClient.js';
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
  JournalListJournalRow,
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
const RECURRING_TEMPLATES = 'recurring_journal_templates';
const RECURRING_TEMPLATE_ENTRIES = 'recurring_journal_template_entries';
const CONTACTS = 'contacts';
const CURRENCIES = 'currencies';
const COMPANIES = 'companies';

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

type JournalListRowDb = {
  id: string;
  companyId: string;
  reference: string | null;
  sequenceMonth: string | null;
  sequenceNumber: number | null;
  date: string;
  title: string;
  description: string | null;
  note: string | null;
  contactId: string | null;
  contactName: string | null;
  currencyId: string;
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
  exchangeRate: string;
  ledgerTransactionId: string | null;
  autoReversalDate: string | null;
  reversalJournalId: string | null;
  originalJournalId: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  reversedById: string | null;
  voidedAt: string | null;
  metadata: unknown | null;
  createdAt: string;
  createdById: string;
  updatedAt: string;
  updatedById: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  totalDebit: string;
  totalCredit: string;
  entriesCount: number;
  kind: JournalListRow['kind'];
  journalSource: 'one_off' | 'generated_from_template' | null;
  isFx: boolean | null;
  status: 'draft' | 'posted' | 'voided' | null;
  journalStatus: 'draft' | 'posted' | 'voided' | null;
  templateId: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  nextRunDate: string | null;
  autoPost: boolean | null;
  templateStatus: 'draft' | 'active' | 'paused' | 'closed' | null;
  generatedFromTemplateId: string | null;
  generatedAt: string | null;
  generatedScheduledForDate: string | null;
};

const SORT_COL: Record<SortBy, string> = {
  // JS Date/toISOString is millisecond precision; align keyset pagination to ms
  // to avoid duplicates when DB timestamps include microseconds.
  created_at: `date_trunc('milliseconds', jl."createdAt")`,
  date: 'jl."date"',
  reference: 'jl."reference"',
} as const;

function selectAliasedFields(
  db: Knex | Knex.Transaction,
  fields: Record<string, string>,
) {
  return Object.entries(fields).map(([alias, column]) =>
    db.raw(`${column} as "${alias}"`),
  );
}

function clampDayOfMonthUTC(
  year: number,
  month1Based: number,
  day: number,
): number {
  const end = new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
  return Math.max(1, Math.min(day, end));
}

function toYMDUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysUTC(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function resolveCurrentFiscalYearBounds({
  today,
  yearEndMonth,
  yearEndDay,
}: {
  today: Date;
  yearEndMonth: number;
  yearEndDay: number;
}) {
  const year = today.getUTCFullYear();

  const currentYearEndDay = clampDayOfMonthUTC(year, yearEndMonth, yearEndDay);
  const currentYearEnd = new Date(
    Date.UTC(year, yearEndMonth - 1, currentYearEndDay),
  );

  const fiscalYear =
    toYMDUTC(today) > toYMDUTC(currentYearEnd) ? year + 1 : year;

  const fyEndDay = clampDayOfMonthUTC(fiscalYear, yearEndMonth, yearEndDay);
  const prevFyEndDay = clampDayOfMonthUTC(
    fiscalYear - 1,
    yearEndMonth,
    yearEndDay,
  );

  const fyEnd = new Date(Date.UTC(fiscalYear, yearEndMonth - 1, fyEndDay));
  const prevFyEnd = new Date(
    Date.UTC(fiscalYear - 1, yearEndMonth - 1, prevFyEndDay),
  );
  const fyStart = addDaysUTC(prevFyEnd, 1);

  return { dateFrom: toYMDUTC(fyStart), dateTo: toYMDUTC(fyEnd) };
}

async function resolveDefaultDateRangeForCompany({
  companyUUID,
  trx,
}: {
  companyUUID: string;
  trx: Knex.Transaction;
}): Promise<{ dateFrom: string; dateTo: string }> {
  const company = await trx(COMPANIES)
    .where('id', companyUUID)
    .select('year_end_month', 'year_end_day')
    .first<{ year_end_month: number | null; year_end_day: number | null }>();

  const today = new Date();

  if (
    !company?.year_end_month ||
    !company?.year_end_day ||
    company.year_end_month < 1 ||
    company.year_end_month > 12 ||
    company.year_end_day < 1 ||
    company.year_end_day > 31
  ) {
    const dateTo = toYMDUTC(today);
    const dateFrom = toYMDUTC(addDaysUTC(today, -364));
    return { dateFrom, dateTo };
  }

  return resolveCurrentFiscalYearBounds({
    today,
    yearEndMonth: company.year_end_month,
    yearEndDay: company.year_end_day,
  });
}

function mapJournalListRow(row: JournalListRowDb): JournalListRow {
  if (row.kind === 'recurring_template') {
    return {
      id: row.id,
      companyId: row.companyId,
      kind: 'recurring_template',
      templateId: row.templateId ?? row.id,
      templateStatus: row.templateStatus ?? 'draft',
      frequency: row.frequency ?? 'monthly',
      nextRunDate: row.nextRunDate,
      autoPost: row.autoPost === true,
      reference: null,
      sequenceMonth: null,
      sequenceNumber: null,
      date: row.date,
      title: row.title,
      description: row.description,
      note: row.note,
      contactId: row.contactId,
      contactName: row.contactName,
      currencyId: row.currencyId,
      currencyCode: row.currencyCode,
      currencyName: row.currencyName,
      currencySymbol: row.currencySymbol,
      exchangeRate: row.exchangeRate,
      ledgerTransactionId: null,
      autoReversalDate: null,
      reversalJournalId: null,
      originalJournalId: null,
      reversedAt: null,
      reversalReason: null,
      reversedById: null,
      voidedAt: null,
      metadata: row.metadata,
      createdAt: row.createdAt,
      createdById: row.createdById,
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
      isDeleted: row.isDeleted,
      deletedAt: row.deletedAt,
      totalDebit: row.totalDebit,
      totalCredit: row.totalCredit,
      entriesCount: row.entriesCount,
    };
  }

  return {
    id: row.id,
    companyId: row.companyId,
    kind: 'journal',
    journalSource: row.journalSource ?? 'one_off',
    isFx: row.isFx === true,
    status: row.status ?? 'draft',
    reference: row.reference,
    sequenceMonth: row.sequenceMonth,
    sequenceNumber: row.sequenceNumber,
    date: row.date,
    title: row.title,
    description: row.description,
    note: row.note,
    contactId: row.contactId,
    contactName: row.contactName,
    currencyId: row.currencyId,
    currencyCode: row.currencyCode,
    currencyName: row.currencyName,
    currencySymbol: row.currencySymbol,
    exchangeRate: row.exchangeRate,
    ledgerTransactionId: row.ledgerTransactionId,
    autoReversalDate: row.autoReversalDate,
    reversalJournalId: row.reversalJournalId,
    originalJournalId: row.originalJournalId,
    reversedAt: row.reversedAt,
    reversalReason: row.reversalReason,
    reversedById: row.reversedById,
    voidedAt: row.voidedAt,
    metadata: row.metadata,
    createdAt: row.createdAt,
    createdById: row.createdById,
    updatedAt: row.updatedAt,
    updatedById: row.updatedById,
    isDeleted: row.isDeleted,
    deletedAt: row.deletedAt,
    totalDebit: row.totalDebit,
    totalCredit: row.totalCredit,
    entriesCount: row.entriesCount,
    generatedFromTemplateId: row.generatedFromTemplateId,
    generatedAt: row.generatedAt,
    generatedScheduledForDate: row.generatedScheduledForDate,
  };
}

function mapJournalDetailRow(row: JournalListRowDb): JournalListJournalRow {
  const mapped = mapJournalListRow(row);
  if (mapped.kind !== 'journal') {
    throw new AppError('Expected journal row for detail response');
  }
  return mapped;
}

/**
 * Build base query for journals list with company scope, filters, search, and ordering.
 * Source includes:
 * - regular journals from journal_batches
 * - recurring template rows from recurring_journal_templates
 */
function buildJournalsBaseQuery(
  filters: ListJournalsFilters,
  companyUUID: string,
  options?: {
    includeClassificationFilters?: boolean;
    includeAggregates?: boolean;
  },
  trx?: Knex.Transaction,
): Knex.QueryBuilder {
  const db = trx || knexClient;
  const includeClassificationFilters =
    options?.includeClassificationFilters ?? true;
  const includeAggregates = options?.includeAggregates ?? true;

  const {
    journalStatuses,
    templateStatuses,
    journalSources,
    kinds,
    dateFrom,
    dateTo,
    searchQuery,
    contactId,
    currencyId,
    includeDeleted,
  } = filters;

  const journalAggregateSelect = includeAggregates
    ? [
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
        db.raw(
          `COALESCE((
            SELECT COUNT(*)
            FROM journal_entries je
            WHERE je.journal_batch_id = jb.id
              AND (
                (jb.status <> 'voided' AND je.is_deleted = false)
                OR (jb.status = 'voided' AND je.deleted_at = jb.deleted_at)
              )
          ), 0)::int as "entriesCount"`,
        ),
      ]
    : [
        db.raw(`0::numeric as "totalDebit"`),
        db.raw(`0::numeric as "totalCredit"`),
        db.raw(`0::int as "entriesCount"`),
      ];

  const templateAggregateSelect = includeAggregates
    ? [
        db.raw(
          `COALESCE((SELECT SUM(rjte.amount) FROM ${RECURRING_TEMPLATE_ENTRIES} rjte WHERE rjte.template_id = rjt.id AND rjte.transaction_side = 'debit'), 0) as "totalDebit"`,
        ),
        db.raw(
          `COALESCE((SELECT SUM(rjte.amount) FROM ${RECURRING_TEMPLATE_ENTRIES} rjte WHERE rjte.template_id = rjt.id AND rjte.transaction_side = 'credit'), 0) as "totalCredit"`,
        ),
        db.raw(
          `COALESCE((SELECT COUNT(*) FROM ${RECURRING_TEMPLATE_ENTRIES} rjte WHERE rjte.template_id = rjt.id), 0)::int as "entriesCount"`,
        ),
      ]
    : [
        db.raw(`0::numeric as "totalDebit"`),
        db.raw(`0::numeric as "totalCredit"`),
        db.raw(`0::int as "entriesCount"`),
      ];

  const journalSelect = db
    .from({ jb: JOURNAL_BATCHES })
    .innerJoin({ co: COMPANIES }, 'co.id', 'jb.company_id')
    .leftJoin({ c: CONTACTS }, 'c.id', 'jb.contact_id')
    .innerJoin({ cur: CURRENCIES }, 'cur.id', 'jb.currency_id')
    .leftJoin(
      { rjt: RECURRING_TEMPLATES },
      'rjt.id',
      'jb.recurring_template_id',
    )
    .where('jb.company_id', companyUUID)
    .select([
      ...selectAliasedFields(db, JournalListSelect),
      ...journalAggregateSelect,
      db.raw(`'journal'::text as "kind"`),
      db.raw(`jb.journal_source::text as "journalSource"`),
      db.raw(`(jb.currency_id <> co.reporting_currency_id) as "isFx"`),
      db.raw(`jb.status as "journalStatus"`),
      db.raw(`NULL::recurring_journal_status as "templateStatus"`),
      db.raw(`NULL::recurrence_frequency as "frequency"`),
      db.raw(`NULL::date as "nextRunDate"`),
      db.raw(`NULL::boolean as "autoPost"`),
      db.raw(`NULL::uuid as "templateId"`),
      db.raw(`jb.recurring_template_id as "generatedFromTemplateId"`),
      db.raw(
        `CASE WHEN jb.recurring_template_id IS NULL THEN NULL ELSE jb.created_at END as "generatedAt"`,
      ),
      db.raw(
        `CASE WHEN jb.recurring_template_id IS NULL THEN NULL ELSE to_char(jb.date, 'YYYY-MM-DD') END as "generatedScheduledForDate"`,
      ),
      db.raw(`jb.search_text as "searchText"`),
    ]);

  const recurringTemplateSelect = db
    .from({ rjt: RECURRING_TEMPLATES })
    .innerJoin({ co: COMPANIES }, 'co.id', 'rjt.company_id')
    .leftJoin({ c: CONTACTS }, 'c.id', 'rjt.contact_id')
    .innerJoin(
      { cur: CURRENCIES },
      db.raw('cur.id = COALESCE(rjt.currency_id, co.reporting_currency_id)'),
    )
    .where('rjt.company_id', companyUUID)
    .select([
      db.raw(`rjt.id as "id"`),
      db.raw(`rjt.company_id as "companyId"`),
      db.raw(`NULL::text as "reference"`),
      db.raw(`NULL::date as "sequenceMonth"`),
      db.raw(`NULL::integer as "sequenceNumber"`),
      db.raw(
        // For templates we use next_run_date when available, otherwise created_at.
        // Using start_date as a fallback causes closed templates to "jump" far back
        // in time (and appear to vanish due to pagination/sorting).
        `COALESCE(rjt.next_run_date::date, rjt.created_at::date, rjt.start_date::date) as "date"`,
      ),
      db.raw(`COALESCE(rjt.title, rjt.description) as "title"`),
      db.raw(`rjt.description as "description"`),
      db.raw(`NULL::journal_status as "status"`),
      db.raw(`rjt.note as "note"`),
      db.raw(`rjt.contact_id as "contactId"`),
      db.raw(`c.display_name as "contactName"`),
      db.raw(
        `COALESCE(rjt.currency_id, co.reporting_currency_id) as "currencyId"`,
      ),
      db.raw(`cur.code as "currencyCode"`),
      db.raw(`cur.name as "currencyName"`),
      db.raw(`cur.symbol as "currencySymbol"`),
      db.raw(`1::numeric as "exchangeRate"`),
      db.raw(`NULL::uuid as "ledgerTransactionId"`),
      db.raw(`NULL::date as "autoReversalDate"`),
      db.raw(`NULL::uuid as "reversalJournalId"`),
      db.raw(`NULL::uuid as "originalJournalId"`),
      db.raw(`NULL::timestamptz as "reversedAt"`),
      db.raw(`NULL::text as "reversalReason"`),
      db.raw(`NULL::uuid as "reversedById"`),
      db.raw(`NULL::timestamptz as "voidedAt"`),
      db.raw(`NULL::jsonb as "metadata"`),
      db.raw(`rjt.created_at as "createdAt"`),
      db.raw(`rjt.created_by_id as "createdById"`),
      db.raw(`rjt.updated_at as "updatedAt"`),
      db.raw(`NULL::uuid as "updatedById"`),
      db.raw(`rjt.is_deleted as "isDeleted"`),
      db.raw(`rjt.deleted_at as "deletedAt"`),
      ...templateAggregateSelect,
      db.raw(`'recurring_template'::text as "kind"`),
      db.raw(`NULL::text as "journalSource"`),
      db.raw(`NULL::boolean as "isFx"`),
      db.raw(`NULL::journal_status as "journalStatus"`),
      db.raw(`rjt.status as "templateStatus"`),
      db.raw(`rjt.frequency as "frequency"`),
      db.raw(`rjt.next_run_date::date as "nextRunDate"`),
      db.raw(`rjt.auto_post as "autoPost"`),
      db.raw(`rjt.id as "templateId"`),
      db.raw(`NULL::uuid as "generatedFromTemplateId"`),
      db.raw(`NULL::timestamptz as "generatedAt"`),
      db.raw(`NULL::text as "generatedScheduledForDate"`),
      db.raw(
        `concat_ws(' ', rjt.title, rjt.description, rjt.note) as "searchText"`,
      ),
    ]);

  const unifiedRows = journalSelect
    .clone()
    .unionAll([recurringTemplateSelect], true);
  const qb = db.queryBuilder().from(unifiedRows.as('jl')) as Knex.QueryBuilder<
    any,
    any
  >;

  if (!includeDeleted) {
    qb.where('jl.isDeleted', false);
  }

  if (includeClassificationFilters && kinds?.length) {
    qb.whereIn('jl.kind', kinds);
  }

  if (includeClassificationFilters && journalStatuses?.length) {
    qb.where('jl.kind', 'journal').whereIn('jl.journalStatus', journalStatuses);
  }

  if (includeClassificationFilters && templateStatuses?.length) {
    qb.where('jl.kind', 'recurring_template').whereIn(
      'jl.templateStatus',
      templateStatuses,
    );
  }

  if (includeClassificationFilters && journalSources?.length) {
    qb.where('jl.kind', 'journal').whereIn('jl.journalSource', journalSources);
  }

  // Date range filters apply to journals, not templates. Templates have their own
  // concept of "next run" and can look like they disappear when closed if we
  // filter/sort them by a start_date outside the journal date range.
  if (dateFrom) {
    qb.where((w) => {
      w.where('jl.kind', 'recurring_template').orWhere(
        'jl.date',
        '>=',
        dateFrom,
      );
    });
  }

  if (dateTo) {
    qb.where((w) => {
      w.where('jl.kind', 'recurring_template').orWhere('jl.date', '<=', dateTo);
    });
  }

  if (contactId) {
    qb.where('jl.contactId', contactId);
  }

  if (currencyId) {
    qb.where('jl.currencyId', currencyId);
  }

  const q = searchQuery?.trim();
  if (q) {
    qb.where((w) => {
      w.whereRaw('jl."searchText" % ?', [q]).orWhereILike(
        'jl.searchText',
        `%${q}%`,
      );
    });
  }

  const col = SORT_COL[filters.sortBy];
  if (filters.sortBy === 'reference') {
    qb.orderByRaw(
      `(jl.reference IS NULL) asc, jl.reference ${filters.sortDir} NULLS LAST, jl.id ${filters.sortDir}`,
    );
  } else {
    qb.orderByRaw(`${col} ${filters.sortDir}, jl.id ${filters.sortDir}`);
  }

  return qb.select([
    db.raw(`jl.id as "id"`),
    db.raw(`jl."companyId" as "companyId"`),
    db.raw(`jl.reference as "reference"`),
    db.raw(`jl."sequenceMonth" as "sequenceMonth"`),
    db.raw(`jl."sequenceNumber" as "sequenceNumber"`),
    db.raw(`jl.date as "date"`),
    db.raw(`jl.title as "title"`),
    db.raw(`jl.description as "description"`),
    db.raw(`jl.status as "status"`),
    db.raw(`jl.note as "note"`),
    db.raw(`jl."contactId" as "contactId"`),
    db.raw(`jl."contactName" as "contactName"`),
    db.raw(`jl."currencyId" as "currencyId"`),
    db.raw(`jl."currencyCode" as "currencyCode"`),
    db.raw(`jl."currencyName" as "currencyName"`),
    db.raw(`jl."currencySymbol" as "currencySymbol"`),
    db.raw(`jl."exchangeRate" as "exchangeRate"`),
    db.raw(`jl."ledgerTransactionId" as "ledgerTransactionId"`),
    db.raw(`jl."autoReversalDate" as "autoReversalDate"`),
    db.raw(`jl."reversalJournalId" as "reversalJournalId"`),
    db.raw(`jl."originalJournalId" as "originalJournalId"`),
    db.raw(`jl."reversedAt" as "reversedAt"`),
    db.raw(`jl."reversalReason" as "reversalReason"`),
    db.raw(`jl."reversedById" as "reversedById"`),
    db.raw(`jl."voidedAt" as "voidedAt"`),
    db.raw(`jl.metadata as "metadata"`),
    db.raw(`jl."createdAt" as "createdAt"`),
    db.raw(`jl."createdById" as "createdById"`),
    db.raw(`jl."updatedAt" as "updatedAt"`),
    db.raw(`jl."updatedById" as "updatedById"`),
    db.raw(`jl."isDeleted" as "isDeleted"`),
    db.raw(`jl."deletedAt" as "deletedAt"`),
    db.raw(`jl."totalDebit" as "totalDebit"`),
    db.raw(`jl."totalCredit" as "totalCredit"`),
    db.raw(`jl."entriesCount" as "entriesCount"`),
    db.raw(`jl."kind" as "kind"`),
    db.raw(`jl."journalSource" as "journalSource"`),
    db.raw(`jl."isFx" as "isFx"`),
    db.raw(`jl."templateStatus" as "templateStatus"`),
    db.raw(`jl."frequency" as "frequency"`),
    db.raw(`jl."nextRunDate" as "nextRunDate"`),
    db.raw(`jl."autoPost" as "autoPost"`),
    db.raw(`jl."templateId" as "templateId"`),
    db.raw(`jl."generatedFromTemplateId" as "generatedFromTemplateId"`),
    db.raw(`jl."generatedAt" as "generatedAt"`),
    db.raw(`jl."generatedScheduledForDate" as "generatedScheduledForDate"`),
  ]);
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

    const defaultRange =
      !filters.dateFrom && !filters.dateTo
        ? await resolveDefaultDateRangeForCompany({ companyUUID, trx: txn })
        : null;

    const resolvedFilters: ListJournalsFilters = {
      ...filters,
      dateFrom: filters.dateFrom ?? defaultRange?.dateFrom,
      dateTo: filters.dateTo ?? defaultRange?.dateTo,
    };

    const baseQuery = buildJournalsBaseQuery(
      resolvedFilters,
      companyUUID,
      undefined,
      txn,
    );
    const countQuery = buildJournalsBaseQuery(
      resolvedFilters,
      companyUUID,
      { includeAggregates: false },
      txn,
    );

    // total count
    const countRow = await countQuery
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
      .offset(offset)) as unknown as JournalListRowDb[];

    const journals = rows.map(mapJournalListRow);

    return {
      journals,
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

  if (filters.sortBy === 'reference') {
    const cursorIsNull = cursor.isNull === true;

    if (cursorIsNull) {
      qb.andWhereRaw('jl.reference IS NULL');
      qb.andWhere('jl.id', op, cursor.id);
      return;
    }

    qb.andWhere((w) => {
      w.whereRaw('jl.reference IS NULL').orWhere((w2) => {
        w2.whereRaw('jl.reference IS NOT NULL');
        w2.andWhere((w3) => {
          if (filters.sortDir === 'asc') {
            w3.where('jl.reference', '>', cursor.value).orWhere((w4) => {
              w4.where('jl.reference', '=', cursor.value).andWhere(
                'jl.id',
                '>',
                cursor.id,
              );
            });
            return;
          }
          w3.where('jl.reference', '<', cursor.value).orWhere((w4) => {
            w4.where('jl.reference', '=', cursor.value).andWhere(
              'jl.id',
              '<',
              cursor.id,
            );
          });
        });
      });
    });
    return;
  }

  if (filters.sortBy === 'created_at') {
    qb.andWhere(
      db.raw(
        `(${sortCol}, jl.id) ${op} (date_trunc('milliseconds', ?::timestamptz), ?)`,
        [cursor.value, cursor.id],
      ),
    );
    return;
  }

  // Composite key comparison: (sortColumn, id) for stable ordering
  qb.andWhere(
    db.raw(`(${sortCol}, jl.id) ${op} (?, ?)`, [cursor.value, cursor.id]),
  );
}

/**
 * Extract sort value from journal row based on sortBy field
 * Returns string representation of the value for cursor encoding
 */
function getSortValueFromRow(
  row: JournalListRow,
  sortBy: ListJournalsFilters['sortBy'],
): string {
  switch (sortBy) {
    case 'created_at':
      return new Date(row.createdAt).toISOString();
    case 'date':
      return String(row.date);
    case 'reference':
      if (!row.reference || row.reference.length === 0) {
        return '';
      }
      return String(row.reference);
  }
}

/**
 * List journals with cursor-based pagination
 * Returns header data only (no entries array)
 * Includes computed total debit/credit per journal
 * Cursor format: base64 encoded JSON with {sortCol, id, isNull}
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

    const defaultRange =
      !filters.dateFrom && !filters.dateTo
        ? await resolveDefaultDateRangeForCompany({ companyUUID, trx: txn })
        : null;

    const resolvedFilters: ListJournalsFilters = {
      ...filters,
      dateFrom: filters.dateFrom ?? defaultRange?.dateFrom,
      dateTo: filters.dateTo ?? defaultRange?.dateTo,
    };

    const qb = buildJournalsBaseQuery(
      resolvedFilters,
      companyUUID,
      { includeClassificationFilters: true },
      txn,
    );

    // Apply cursor condition
    if (cursorStr) {
      const cursor = decodeCursor(cursorStr, traceId);
      applyKeysetCursor(qb, txn, resolvedFilters, cursor);
    }

    // limit+1
    const rows = (await qb
      .clone()
      .limit(limit + 1)) as unknown as JournalListRowDb[];

    const hasMore = rows.length > limit;
    const listRows = (hasMore ? rows.slice(0, limit) : rows).map(
      mapJournalListRow,
    );

    // Build next cursor from the last returned row
    let nextCursor: string | null = null;
    if (hasMore && listRows.length) {
      const last = listRows[listRows.length - 1];
      const value = getSortValueFromRow(last, resolvedFilters.sortBy);

      nextCursor = encodeCursor({
        v: 1,
        sortBy: resolvedFilters.sortBy,
        sortDir: resolvedFilters.sortDir,
        value,
        id: last.id,
        isNull:
          resolvedFilters.sortBy === 'reference'
            ? last.reference == null
            : false,
      });
    }

    const facetsQb = buildJournalsBaseQuery(
      resolvedFilters,
      companyUUID,
      { includeClassificationFilters: false, includeAggregates: false },
      txn,
    )
      .clone()
      .clearSelect()
      .clearOrder()
      .clearGroup()
      .select([
        txn.raw(`COUNT(*)::int as "allCount"`),
        txn.raw(
          `COUNT(*) FILTER (WHERE jl.kind = 'journal' AND jl."journalStatus" = 'draft')::int as "draftCount"`,
        ),
        txn.raw(
          `COUNT(*) FILTER (WHERE jl.kind = 'journal' AND jl."journalStatus" = 'posted')::int as "postedCount"`,
        ),
        txn.raw(
          `COUNT(*) FILTER (WHERE jl.kind = 'journal' AND jl."journalStatus" = 'voided')::int as "voidedCount"`,
        ),
        txn.raw(
          `COUNT(*) FILTER (WHERE jl.kind = 'journal')::int as "journalRowsCount"`,
        ),
        txn.raw(
          `COUNT(*) FILTER (WHERE jl.kind = 'recurring_template')::int as "recurringTemplatesCount"`,
        ),
        txn.raw(
          `COUNT(*) FILTER (WHERE jl.kind = 'journal' AND jl."journalSource" = 'one_off')::int as "oneOffCount"`,
        ),
        txn.raw(
          `COUNT(*) FILTER (WHERE jl.kind = 'journal' AND jl."journalSource" = 'generated_from_template')::int as "generatedFromTemplateCount"`,
        ),
        txn.raw(
          `COUNT(*) FILTER (WHERE jl.kind = 'recurring_template' AND jl."templateStatus" = 'draft')::int as "templateDraftCount"`,
        ),
        txn.raw(
          `COUNT(*) FILTER (WHERE jl.kind = 'recurring_template' AND jl."templateStatus" = 'active')::int as "templateActiveCount"`,
        ),
        txn.raw(
          `COUNT(*) FILTER (WHERE jl.kind = 'recurring_template' AND jl."templateStatus" = 'paused')::int as "templatePausedCount"`,
        ),
        txn.raw(
          `COUNT(*) FILTER (WHERE jl.kind = 'recurring_template' AND jl."templateStatus" = 'closed')::int as "templateClosedCount"`,
        ),
      ])
      .first<{
        allCount: number;
        draftCount: number;
        postedCount: number;
        voidedCount: number;
        journalRowsCount: number;
        recurringTemplatesCount: number;
        oneOffCount: number;
        generatedFromTemplateCount: number;
        templateDraftCount: number;
        templateActiveCount: number;
        templatePausedCount: number;
        templateClosedCount: number;
      }>();

    const facetRow = await facetsQb;

    return {
      rows: listRows,
      nextCursor,
      hasMore,
      companyUUID,
      facets: {
        allCount: Number(facetRow?.allCount ?? 0),
        journalStatusCounts: {
          draft: Number(facetRow?.draftCount ?? 0),
          posted: Number(facetRow?.postedCount ?? 0),
          voided: Number(facetRow?.voidedCount ?? 0),
        },
        kindCounts: {
          journals: Number(facetRow?.journalRowsCount ?? 0),
          recurringTemplates: Number(facetRow?.recurringTemplatesCount ?? 0),
        },
        journalSourceCounts: {
          oneOff: Number(facetRow?.oneOffCount ?? 0),
          generatedFromTemplate: Number(
            facetRow?.generatedFromTemplateCount ?? 0,
          ),
        },
        recurringTemplateStatusCounts: {
          draft: Number(facetRow?.templateDraftCount ?? 0),
          active: Number(facetRow?.templateActiveCount ?? 0),
          paused: Number(facetRow?.templatePausedCount ?? 0),
          closed: Number(facetRow?.templateClosedCount ?? 0),
        },
      },
      appliedFilters: {
        dateFrom: resolvedFilters.dateFrom ?? null,
        dateTo: resolvedFilters.dateTo ?? null,
        kinds: resolvedFilters.kinds ?? null,
        journalStatuses: resolvedFilters.journalStatuses ?? null,
        templateStatuses: resolvedFilters.templateStatuses ?? null,
        journalSources: resolvedFilters.journalSources ?? null,
      },
    };
  };

  try {
    const run = async (t: Knex.Transaction) => exec(t);
    const { rows, nextCursor, hasMore, companyUUID, facets, appliedFilters } =
      trx ? await exec(trx) : await knexClient.transaction(run);

    const duration = Date.now() - startTime;
    logger.info(
      {
        traceId,
        userId,
        companyId,
        companyUUID,
        duration,
        limit,
        count: rows.length,
        hasMore,
      },
      'getJournalsByCursor completed',
    );

    return successResponse('Journals retrieved successfully', {
      rows,
      nextCursor,
      hasMore,
      facets,
      appliedFilters,
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
  includeFiles = true,
  includeDeleted = true,
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
      db.raw(
        `COALESCE((SELECT COUNT(*) FROM journal_entries je WHERE je.journal_batch_id = jb.id AND ((jb.status <> 'voided' AND je.is_deleted = false) OR (jb.status = 'voided' AND je.deleted_at = jb.deleted_at))), 0)::int as "entriesCount"`,
      ),
      db.raw(`'journal'::text as "kind"`),
      db.raw(`jb.journal_source::text as "journalSource"`),
      db.raw(`(jb.currency_id <> co.reporting_currency_id) as "isFx"`),
      db.raw(`jb.status as "status"`),
      db.raw(`jb.status as "journalStatus"`),
      db.raw(`jb.recurring_template_id as "generatedFromTemplateId"`),
      db.raw(`NULL::uuid as "templateId"`),
      db.raw(`NULL::recurrence_frequency as "frequency"`),
      db.raw(`NULL::text as "nextRunDate"`),
      db.raw(`NULL::boolean as "autoPost"`),
      db.raw(`rjt.status as "templateStatus"`),
      db.raw(
        `CASE WHEN jb.recurring_template_id IS NULL THEN NULL ELSE jb.created_at END as "generatedAt"`,
      ),
      db.raw(
        `CASE WHEN jb.recurring_template_id IS NULL THEN NULL ELSE to_char(jb.date, 'YYYY-MM-DD') END as "generatedScheduledForDate"`,
      ),
    ];

    const journalQb = db
      .from({ jb: JOURNAL_BATCHES })
      .leftJoin({ c: CONTACTS }, 'c.id', 'jb.contact_id')
      .innerJoin({ cur: CURRENCIES }, 'cur.id', 'jb.currency_id')
      .innerJoin({ co: COMPANIES }, 'co.id', 'jb.company_id')
      .leftJoin(
        { rjt: RECURRING_TEMPLATES },
        'rjt.id',
        'jb.recurring_template_id',
      )
      .where('jb.id', journalId)
      .where('jb.company_id', companyUUID)
      .select([...journalHeaderSelectFields, ...computedFields])
      .first();

    if (!includeDeleted) {
      journalQb.where('jb.is_deleted', false);
    }

    const journalRow = (await journalQb) as unknown as
      | JournalListRowDb
      | undefined;

    if (!journalRow) {
      return errorResponse(`Journal not found: ${journalId}`, { traceId });
    }
    const journal = mapJournalDetailRow(journalRow);

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
