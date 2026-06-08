import type {
  GetRecurringTemplateResponse,
  PreviewRecurringTemplateResponse,
  RecurringTemplateDetail,
  RecurringTemplateDetailEntry,
  RunRecurringTemplateNowResponse,
  UpdateRecurringTemplateStatusResponse,
} from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';
import { formatInTimeZone } from 'date-fns-tz';
import z from 'zod';

import { knexClient } from '../../db/knexClient.js';
import {
  acquireAdvisoryXactLocks,
  lockKeyCompany,
} from '../../shared/services/advisoryLocks.service.js';
import { addDaysToYMD, isValidYMD } from '../../shared/utils/date.utils.js';
import {
  getCompanyUUID,
  isUniqueConstraintError,
} from '../../shared/utils/random.utils.js';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { getPeriodStatusForDate } from '../reporting/fiscal-calendar/fiscal-calendar.service.js';
import { getSystemUser } from '../users/users.model.js';
import { postJournalRecord } from './journals.command.js';
import { validateDebitCreditBalance } from './journals.utils.js';
import {
  renderPlaceholders,
  validatePlaceholdersInFields,
} from './recurring-templates.placeholders.js';
import {
  advanceRunDate,
  computeNextAlignedRunDate,
  todayYMDInTz,
  ymdFromDateInTz,
  ymdToUtcDate,
} from './recurring-templates.schedule.js';
import {
  listRecurringTemplatesQuery,
  recurringTemplateInput,
  recurringTemplatePreviewInput,
  recurringTemplateStatusInput,
  recurringTemplateUpdateInput,
} from './recurring-templates.types.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type { JournalBatchData } from './journals.types.js';
import type { RecurrenceFrequency } from './recurring-templates.schedule.js';
import type {
  RecurringTemplateInput,
  RecurringTemplatePreviewInput,
  RecurringTemplateStatusInput,
  RecurringTemplateUpdateInput,
} from './recurring-templates.types.js';

const TEMPLATES_TABLE = 'recurring_journal_templates';
const ENTRIES_TABLE = 'recurring_journal_template_entries';

type Queryable = Knex | Knex.Transaction;

type CompanyContext = {
  companyUUID: string;
  defaultTimezone: string;
  reportingCurrencyId: string;
};

async function getCompanyContext(
  companyId: string,
  trx: Queryable,
): Promise<CompanyContext | null> {
  const companyUUID = await getCompanyUUID(companyId, trx as Knex.Transaction);

  const row = await (trx as Knex.Transaction)('companies')
    .where('id', companyUUID)
    .select('default_timezone', 'reporting_currency_id')
    .first();

  if (!row) return null;

  return {
    companyUUID,
    defaultTimezone: row.default_timezone,
    reportingCurrencyId: row.reporting_currency_id,
  };
}

function mapTemplateRow(row: any): RecurringTemplateDetail {
  const tz = row.template_timezone;

  const startDateYMD = row.start_date
    ? formatInTimeZone(row.start_date, tz, 'yyyy-MM-dd')
    : null;
  const endDateYMD = row.end_date
    ? formatInTimeZone(row.end_date, tz, 'yyyy-MM-dd')
    : null;
  const nextRunDateYMD = row.next_run_date
    ? formatInTimeZone(row.next_run_date, tz, 'yyyy-MM-dd')
    : null;

  return {
    id: row.id,
    description: row.description,
    title: row.title ?? null,
    note: row.note ?? null,
    status: row.status,
    companyId: row.company_id,
    autoPost: row.auto_post,
    templateTimezone: row.template_timezone,
    frequency: row.frequency,
    startDateYMD,
    endDateYMD,
    nextRunDateYMD,
    placeholderVars: row.placeholder_vars ?? null,
    currencyId: row.currency_id ?? null,
    currencyCode: row.currency_code ?? null,
    currencyName: row.currency_name ?? null,
    currencySymbol: row.currency_symbol ?? null,
    contactId: row.contact_id ?? null,
    contactName: row.contact_name ?? null,
    autoReversalDays: row.auto_reversal_days ?? null,
    lastRunAt: row.last_run_at ?? null,
    lastFailedAt: row.last_failed_at ?? null,
    lastError: row.last_error ?? null,
    failureCount: row.failure_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEntryRow(row: any): RecurringTemplateDetailEntry {
  return {
    id: row.id,
    description: row.description,
    side: row.transaction_side,
    amount: Number(row.amount),
    coaId: row.coa_id,
    coaCode: row.coa_code ?? null,
    coaName: row.coa_name ?? null,
    templateId: row.template_id,
  };
}

function templateEntriesDetailQuery(trx: Knex.Transaction, templateId: string) {
  return trx(`${ENTRIES_TABLE} as rjte`)
    .leftJoin('coa as c', 'c.id', 'rjte.coa_id')
    .where('rjte.template_id', templateId)
    .select('rjte.*', 'c.code as coa_code', 'c.name as coa_name')
    .orderBy('rjte.id', 'asc');
}

function buildTemplateEntriesInsert({
  templateId,
  entries,
}: {
  templateId: string;
  entries: RecurringTemplateInput['entries'];
}) {
  return entries.map((entry) => ({
    description: entry.description,
    amount: entry.amount,
    transaction_side: entry.side,
    coa_id: entry.coa_id,
    template_id: templateId,
  }));
}

async function validateContactId({
  trx,
  companyUUID,
  contactId,
}: {
  trx: Knex.Transaction;
  companyUUID: string;
  contactId: string | null | undefined;
}) {
  if (!contactId) return;
  const contact = await trx('contacts')
    .where('id', contactId)
    .where('company_id', companyUUID)
    .where('is_deleted', false)
    .where((qb) => {
      qb.where('status', 'active').orWhereNull('status');
    })
    .first('id');

  if (!contact) {
    throw new Error(`Invalid or inactive contact ID: ${contactId}`);
  }
}

async function validateCurrencyId({
  trx,
  currencyId,
}: {
  trx: Knex.Transaction;
  currencyId: string | null | undefined;
}) {
  if (!currencyId) return;
  const currency = await trx('currencies')
    .where('id', currencyId)
    .where('is_deleted', false)
    .first('id');

  if (!currency) {
    throw new Error(`Invalid currency ID: ${currencyId}`);
  }
}

async function validateCoaIds({
  trx,
  companyUUID,
  entries,
}: {
  trx: Knex.Transaction;
  companyUUID: string;
  entries: RecurringTemplateInput['entries'];
}) {
  const coaIds = [...new Set(entries.map((entry) => entry.coa_id))];
  if (coaIds.length === 0) {
    throw new Error('At least one COA is required');
  }

  const rows = await trx('coa')
    .where('company_id', companyUUID)
    .whereIn('id', coaIds)
    .where('is_deleted', false)
    .where('is_active', true)
    .select('id');

  if (rows.length !== coaIds.length) {
    const found = new Set(rows.map((row) => row.id));
    const missing = coaIds.filter((id) => !found.has(id));
    throw new Error(`Invalid or inactive COA IDs: ${missing.join(', ')}`);
  }
}

function validateBalancedEntries(entries: RecurringTemplateInput['entries']) {
  if (entries.some((entry) => entry.amount <= 0)) {
    throw new Error('Journal entry amounts must be positive');
  }

  const balance = validateDebitCreditBalance(
    entries.map((entry) => ({
      description: entry.description,
      side: entry.side,
      amount: entry.amount,
      coa_id: entry.coa_id,
    })),
  );

  if (!balance.isValid) {
    throw new Error(balance.error ?? 'Entries do not balance');
  }
}

function validatePlaceholders({
  title,
  note,
  entries,
}: {
  title?: string | null;
  note?: string | null;
  entries?: Array<{ description: string }> | null;
}) {
  const fields: Array<string | null | undefined> = [title, note];
  if (entries) {
    for (const entry of entries) {
      fields.push(entry.description);
    }
  }

  const validation = validatePlaceholdersInFields(fields);
  if (!validation.valid) {
    const unique = [...new Set(validation.invalidTokens)];
    throw new Error(`Invalid placeholder tokens: ${unique.join(', ')}`);
  }
}

function computeNextRunDate({
  startDateYMD,
  endDateYMD,
  frequency,
  timezone,
}: {
  startDateYMD: string;
  endDateYMD: string | null;
  frequency: RecurrenceFrequency;
  timezone: string;
}): { nextRunDateYMD: string | null; status?: 'closed' } {
  const todayYMD = todayYMDInTz(timezone);
  const runDateYMD = computeNextAlignedRunDate({
    startYMD: startDateYMD,
    frequency,
    todayYMD,
  });

  if (endDateYMD && runDateYMD > endDateYMD) {
    return { nextRunDateYMD: null, status: 'closed' };
  }

  return { nextRunDateYMD: runDateYMD };
}

function getStartEndYMD(row: {
  start_date: Date;
  end_date: Date | null;
  template_timezone: string;
}) {
  const tz = row.template_timezone;
  const startDateYMD = formatInTimeZone(row.start_date, tz, 'yyyy-MM-dd');
  const endDateYMD = row.end_date
    ? formatInTimeZone(row.end_date, tz, 'yyyy-MM-dd')
    : null;

  return { startDateYMD, endDateYMD };
}

async function generateOccurrenceFromTemplate({
  trx,
  template,
  entries,
  runDateYMD,
  companyId,
  userId,
  trigger,
  triggeredByUserId,
}: {
  trx: Knex.Transaction;
  template: any;
  entries: any[];
  runDateYMD: string;
  companyId: string;
  userId: string;
  trigger: 'schedule' | 'manual';
  triggeredByUserId?: string | null;
}) {
  const tz = template.template_timezone;
  const renderedTitle = renderPlaceholders(
    template.title || template.description,
    runDateYMD,
    tz,
  );
  const renderedNote = renderPlaceholders(template.note, runDateYMD, tz);

  const renderedEntries = entries.map((entry) => ({
    ...entry,
    description:
      renderPlaceholders(entry.description, runDateYMD, tz) ??
      entry.description,
  }));

  const periodStatus = await getPeriodStatusForDate({
    companyId,
    date: runDateYMD,
    trx,
  });

  const shouldPost =
    template.auto_post === true && periodStatus.status === 'open';

  const metadata: Record<string, unknown> = {
    recurring: {
      templateId: template.id,
      trigger,
      ...(triggeredByUserId ? { triggeredByUserId } : {}),
    },
  };

  if (!shouldPost && template.auto_post) {
    metadata.post_blocked_period = true;
  }

  const autoReversalDate = template.auto_reversal_days
    ? addDaysToYMD(runDateYMD, template.auto_reversal_days)
    : null;

  const data: JournalBatchData = {
    date: runDateYMD,
    title: renderedTitle ?? template.description,
    description: template.description,
    contactId: template.contact_id ?? null,
    currencyId: template.currency_id,
    status: shouldPost ? 'posted' : 'draft',
    autoReversalDate: autoReversalDate,
    note: renderedNote ?? null,
    journalSource: 'generated_from_template',
    recurringTemplateId: template.id,
    metadata,
    entries: renderedEntries.map((entry) => ({
      description: entry.description,
      side: entry.transaction_side,
      amount: Number(entry.amount),
      coaId: entry.coa_id,
      projectId: null,
    })),
  };

  const result = await postJournalRecord({
    data,
    companyId,
    userId,
    trx,
  });

  if (!result.success) {
    throw new Error(result.message ?? 'Failed to generate journal');
  }

  return result;
}

export async function listRecurringTemplates({
  companyId,
  queryData,
}: {
  companyId: string;
  queryData: Record<string, unknown>;
}): Promise<
  ApiResponse<{
    templates: RecurringTemplateDetail[];
    pagination: {
      currentPage: number;
      pageSize: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }>
> {
  const parsed = listRecurringTemplatesQuery.safeParse(queryData ?? {});
  if (!parsed.success) {
    return errorResponse(
      'Invalid request parameters',
      z.treeifyError(parsed.error),
    );
  }

  const { status, page, pageSize } = parsed.data;

  try {
    const result = await knexClient.transaction(async (trx) => {
      const context = await getCompanyContext(companyId, trx);
      if (!context)
        return errorResponse('Company not found', null, {
          code: ErrorCode.NOT_FOUND,
        });

      let baseQuery = trx(TEMPLATES_TABLE)
        .where('company_id', context.companyUUID)
        .where('is_deleted', false);

      if (status) {
        baseQuery = baseQuery.where('status', status);
      }

      const countResult = await baseQuery.clone().count('* as count').first();
      const total = Number(countResult?.count ?? 0);

      const offset = Math.max(0, (page - 1) * pageSize);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      if (page > totalPages) {
        return errorResponse(
          `Page ${page} exceeds maximum pages (${totalPages})`,
        );
      }

      const rows = await baseQuery
        .select('*')
        .orderBy('created_at', 'desc')
        .limit(pageSize)
        .offset(offset);

      const templates = rows.map(mapTemplateRow);

      return successResponse('Recurring templates retrieved successfully', {
        templates,
        pagination: {
          currentPage: page,
          pageSize,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      });
    });

    return result as ApiResponse<{
      templates: RecurringTemplateDetail[];
      pagination: {
        currentPage: number;
        pageSize: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>;
  } catch (error) {
    return errorResponse('Failed to list recurring templates', error);
  }
}

export async function getRecurringTemplate({
  companyId,
  templateId,
}: {
  companyId: string;
  templateId: string;
}): Promise<ApiResponse<GetRecurringTemplateResponse>> {
  try {
    const result = await knexClient.transaction(async (trx) => {
      const context = await getCompanyContext(companyId, trx);
      if (!context)
        return errorResponse('Company not found', null, {
          code: ErrorCode.NOT_FOUND,
        });

      const template = await trx(`${TEMPLATES_TABLE} as rjt`)
        .innerJoin('companies as co', 'co.id', 'rjt.company_id')
        .leftJoin('contacts as c', 'c.id', 'rjt.contact_id')
        .innerJoin(
          'currencies as cur',
          trx.raw(
            'cur.id = COALESCE(rjt.currency_id, co.reporting_currency_id)',
          ),
        )
        .select(
          'rjt.*',
          'cur.code as currency_code',
          'cur.name as currency_name',
          'cur.symbol as currency_symbol',
          'c.display_name as contact_name',
        )
        .where('rjt.id', templateId)
        .where('rjt.company_id', context.companyUUID)
        .where('rjt.is_deleted', false)
        .first();

      if (!template) {
        return errorResponse('Template not found', null, {
          code: ErrorCode.NOT_FOUND,
        });
      }

      const entries = await templateEntriesDetailQuery(trx, templateId);

      return successResponse('Recurring template retrieved successfully', {
        template: mapTemplateRow(template),
        entries: entries.map(mapEntryRow),
      });
    });

    return result as ApiResponse<GetRecurringTemplateResponse>;
  } catch (error) {
    return errorResponse('Failed to get recurring template', error);
  }
}

export async function createRecurringTemplate({
  companyId,
  userId,
  input,
}: {
  companyId: string;
  userId: string;
  input: RecurringTemplateInput;
}): Promise<ApiResponse<GetRecurringTemplateResponse>> {
  try {
    const parsed = recurringTemplateInput.safeParse(input);
    if (!parsed.success) {
      return errorResponse('Invalid input', z.treeifyError(parsed.error));
    }

    const data = parsed.data;

    validatePlaceholders({
      title: data.title,
      note: data.note,
      entries: data.entries,
    });

    const result = await knexClient.transaction(async (trx) => {
      const context = await getCompanyContext(companyId, trx);
      if (!context)
        return errorResponse('Company not found', null, {
          code: ErrorCode.NOT_FOUND,
        });
      await acquireAdvisoryXactLocks(trx, [
        lockKeyCompany(context.companyUUID),
      ]);

      const currencyId = data.currency_id ?? context.reportingCurrencyId;
      await validateContactId({
        trx,
        companyUUID: context.companyUUID,
        contactId: data.contact_id,
      });
      await validateCurrencyId({ trx, currencyId });
      await validateCoaIds({
        trx,
        companyUUID: context.companyUUID,
        entries: data.entries,
      });
      validateBalancedEntries(data.entries);

      const templateTimezone = context.defaultTimezone;
      const startDate = ymdToUtcDate(data.start_date_ymd, templateTimezone);
      const endDate = data.end_date_ymd
        ? ymdToUtcDate(data.end_date_ymd, templateTimezone)
        : null;

      const [template] = await trx(TEMPLATES_TABLE)
        .insert({
          description: data.description,
          title: data.title ?? null,
          note: data.note ?? null,
          status: 'draft',
          company_id: context.companyUUID,
          auto_post: data.auto_post ?? false,
          currency_id: currencyId,
          contact_id: data.contact_id ?? null,
          template_timezone: templateTimezone,
          frequency: data.frequency,
          start_date: startDate,
          end_date: endDate,
          next_run_date: null,
          placeholder_vars: null,
          auto_reversal_days: data.auto_reversal_days ?? null,
          created_by_id: userId,
        })
        .returning('*');

      const entriesInsert = buildTemplateEntriesInsert({
        templateId: template.id,
        entries: data.entries,
      });

      await trx(ENTRIES_TABLE).insert(entriesInsert);

      const entries = await templateEntriesDetailQuery(trx, template.id);

      return successResponse('Recurring template created successfully', {
        template: mapTemplateRow(template),
        entries: entries.map(mapEntryRow),
      });
    });

    return result as ApiResponse<GetRecurringTemplateResponse>;
  } catch (error) {
    return errorResponse('Failed to create recurring template', error);
  }
}

export async function updateRecurringTemplate({
  companyId,
  userId,
  templateId,
  input,
}: {
  companyId: string;
  userId: string;
  templateId: string;
  input: RecurringTemplateUpdateInput;
}): Promise<ApiResponse<GetRecurringTemplateResponse>> {
  try {
    const parsed = recurringTemplateUpdateInput.safeParse(input);
    if (!parsed.success) {
      return errorResponse('Invalid input', z.treeifyError(parsed.error));
    }

    const data = parsed.data;

    validatePlaceholders({
      title: data.title,
      note: data.note,
      entries: data.entries,
    });

    const result = await knexClient.transaction(async (trx) => {
      const context = await getCompanyContext(companyId, trx);
      if (!context)
        return errorResponse('Company not found', null, {
          code: ErrorCode.NOT_FOUND,
        });
      await acquireAdvisoryXactLocks(trx, [
        lockKeyCompany(context.companyUUID),
      ]);

      const existing = await trx(TEMPLATES_TABLE)
        .where('id', templateId)
        .where('company_id', context.companyUUID)
        .where('is_deleted', false)
        .forUpdate()
        .first();

      if (!existing) {
        return errorResponse('Template not found', null, {
          code: ErrorCode.NOT_FOUND,
        });
      }

      const currencyId = data.currency_id ?? context.reportingCurrencyId;
      await validateContactId({
        trx,
        companyUUID: context.companyUUID,
        contactId: data.contact_id,
      });
      await validateCurrencyId({ trx, currencyId });
      await validateCoaIds({
        trx,
        companyUUID: context.companyUUID,
        entries: data.entries,
      });
      validateBalancedEntries(data.entries);

      const templateTimezone = existing.template_timezone;
      const startDate = ymdToUtcDate(data.start_date_ymd, templateTimezone);
      const endDate = data.end_date_ymd
        ? ymdToUtcDate(data.end_date_ymd, templateTimezone)
        : null;

      let nextRunDate: Date | null = existing.next_run_date;
      let nextStatus: string | undefined;

      if (existing.status === 'active') {
        const next = computeNextRunDate({
          startDateYMD: data.start_date_ymd,
          endDateYMD: data.end_date_ymd ?? null,
          frequency: data.frequency,
          timezone: templateTimezone,
        });

        nextStatus = next.status;
        nextRunDate = next.nextRunDateYMD
          ? ymdToUtcDate(next.nextRunDateYMD, templateTimezone)
          : null;
      }

      if (existing.status === 'draft') {
        nextRunDate = null;
      }

      const [updated] = await trx(TEMPLATES_TABLE)
        .where('id', templateId)
        .update({
          description: data.description,
          title: data.title ?? null,
          note: data.note ?? null,
          auto_post: data.auto_post ?? false,
          currency_id: currencyId,
          contact_id: data.contact_id ?? null,
          frequency: data.frequency,
          start_date: startDate,
          end_date: endDate,
          next_run_date: nextRunDate,
          auto_reversal_days: data.auto_reversal_days ?? null,
          status: nextStatus ?? existing.status,
        })
        .returning('*');

      await trx(ENTRIES_TABLE).where('template_id', templateId).del();
      await trx(ENTRIES_TABLE).insert(
        buildTemplateEntriesInsert({
          templateId,
          entries: data.entries,
        }),
      );

      const entries = await templateEntriesDetailQuery(trx, templateId);

      return successResponse('Recurring template updated successfully', {
        template: mapTemplateRow(updated),
        entries: entries.map(mapEntryRow),
      });
    });

    return result as ApiResponse<GetRecurringTemplateResponse>;
  } catch (error) {
    return errorResponse('Failed to update recurring template', error);
  }
}

export async function updateRecurringTemplateStatus({
  companyId,
  templateId,
  input,
}: {
  companyId: string;
  templateId: string;
  input: RecurringTemplateStatusInput;
}): Promise<ApiResponse<UpdateRecurringTemplateStatusResponse>> {
  const parsed = recurringTemplateStatusInput.safeParse(input);
  if (!parsed.success) {
    return errorResponse('Invalid input', z.treeifyError(parsed.error));
  }

  try {
    const result = await knexClient.transaction(async (trx) => {
      const context = await getCompanyContext(companyId, trx);
      if (!context)
        return errorResponse('Company not found', null, {
          code: ErrorCode.NOT_FOUND,
        });
      await acquireAdvisoryXactLocks(trx, [
        lockKeyCompany(context.companyUUID),
      ]);

      const template = await trx(TEMPLATES_TABLE)
        .where('id', templateId)
        .where('company_id', context.companyUUID)
        .where('is_deleted', false)
        .forUpdate()
        .first();

      if (!template) {
        return errorResponse('Template not found', null, {
          code: ErrorCode.NOT_FOUND,
        });
      }

      const nextStatus = parsed.data.status;

      const updateData: Record<string, any> = {
        status: nextStatus,
      };

      if (nextStatus === 'active') {
        const entries = await trx(ENTRIES_TABLE)
          .where('template_id', template.id)
          .select('coa_id');
        await validateCoaIds({
          trx,
          companyUUID: context.companyUUID,
          entries,
        });

        if (template.status === 'paused' && template.next_run_date) {
          // Resume: keep existing next_run_date to retry the same due date.
          updateData.next_run_date = template.next_run_date;
        } else {
          const { startDateYMD, endDateYMD } = getStartEndYMD(template);
          const nextRun = computeNextRunDate({
            startDateYMD,
            endDateYMD,
            frequency: template.frequency,
            timezone: template.template_timezone,
          });

          if (nextRun.status === 'closed') {
            updateData.status = 'closed';
            updateData.next_run_date = null;
          } else if (nextRun.nextRunDateYMD) {
            updateData.next_run_date = ymdToUtcDate(
              nextRun.nextRunDateYMD,
              template.template_timezone,
            );
          }
        }
      }

      if (nextStatus === 'paused') {
        // keep next_run_date unchanged
      }

      if (nextStatus === 'draft') {
        updateData.next_run_date = null;
      }

      if (nextStatus === 'closed') {
        updateData.next_run_date = null;
      }

      const [updated] = await trx(TEMPLATES_TABLE)
        .where('id', templateId)
        .update(updateData)
        .returning('*');

      return successResponse('Recurring template status updated', {
        template: mapTemplateRow(updated),
      });
    });

    return result as ApiResponse<UpdateRecurringTemplateStatusResponse>;
  } catch (error) {
    return errorResponse('Failed to update template status', error);
  }
}

export async function previewRecurringTemplate({
  companyId,
  input,
}: {
  companyId: string;
  input: RecurringTemplatePreviewInput;
}): Promise<ApiResponse<PreviewRecurringTemplateResponse>> {
  const parsed = recurringTemplatePreviewInput.safeParse(input);
  if (!parsed.success) {
    return errorResponse('Invalid input', z.treeifyError(parsed.error));
  }

  const data = parsed.data;

  try {
    const result = await knexClient.transaction(async (trx) => {
      const context = await getCompanyContext(companyId, trx);
      if (!context)
        return errorResponse('Company not found', null, {
          code: ErrorCode.NOT_FOUND,
        });

      validatePlaceholders({
        title: data.title,
        note: data.note,
        entries: data.entries,
      });

      if (data.entries && data.entries.length > 0) {
        await validateCoaIds({
          trx,
          companyUUID: context.companyUUID,
          entries: data.entries,
        });
        validateBalancedEntries(data.entries);
      }

      const runDateYMD = data.preview_for_ymd
        ? data.preview_for_ymd
        : computeNextAlignedRunDate({
            startYMD: data.start_date_ymd,
            frequency: data.frequency,
            todayYMD: todayYMDInTz(context.defaultTimezone),
          });

      if (!isValidYMD(runDateYMD)) {
        return errorResponse('Invalid preview run date', null, {
          code: ErrorCode.INVALID_INPUT,
        });
      }

      const renderedTitle = renderPlaceholders(
        data.title ?? null,
        runDateYMD,
        context.defaultTimezone,
      );
      const renderedNote = renderPlaceholders(
        data.note ?? null,
        runDateYMD,
        context.defaultTimezone,
      );

      const renderedEntries = (data.entries ?? []).map((entry) => ({
        description:
          renderPlaceholders(
            entry.description,
            runDateYMD,
            context.defaultTimezone,
          ) ?? entry.description,
        side: entry.side,
        amount: entry.amount,
        coaId: entry.coa_id,
      }));

      return successResponse('Recurring template preview generated', {
        runDateYMD,
        rendered: {
          title: renderedTitle,
          note: renderedNote,
          entries: renderedEntries,
        },
      });
    });

    return result as ApiResponse<PreviewRecurringTemplateResponse>;
  } catch (error) {
    return errorResponse('Failed to preview recurring template', error);
  }
}

export async function runRecurringTemplateNow({
  companyId,
  templateId,
  userId,
}: {
  companyId: string;
  templateId: string;
  userId: string;
}): Promise<ApiResponse<RunRecurringTemplateNowResponse>> {
  try {
    const result = await knexClient.transaction(async (trx) => {
      const context = await getCompanyContext(companyId, trx);
      if (!context)
        return errorResponse('Company not found', null, {
          code: ErrorCode.NOT_FOUND,
        });
      await acquireAdvisoryXactLocks(trx, [
        lockKeyCompany(context.companyUUID),
      ]);

      const template = await trx(TEMPLATES_TABLE)
        .where('id', templateId)
        .where('company_id', context.companyUUID)
        .where('is_deleted', false)
        .first();

      if (!template) {
        return errorResponse('Template not found', null, {
          code: ErrorCode.NOT_FOUND,
        });
      }

      if (template.status !== 'active') {
        return errorResponse('Template must be active to run', null, {
          code: ErrorCode.OPERATION_NOT_ALLOWED,
        });
      }

      const entries = await trx(ENTRIES_TABLE)
        .where('template_id', template.id)
        .select('*')
        .orderBy('id', 'asc');

      let runDateYMD = template.next_run_date
        ? ymdFromDateInTz(template.next_run_date, template.template_timezone)
        : null;

      if (!runDateYMD) {
        const { startDateYMD } = getStartEndYMD(template);
        runDateYMD = computeNextAlignedRunDate({
          startYMD: startDateYMD,
          frequency: template.frequency,
          todayYMD: todayYMDInTz(template.template_timezone),
        });
      }

      if (!runDateYMD) {
        return errorResponse('No eligible run date found', null, {
          code: ErrorCode.OPERATION_NOT_ALLOWED,
        });
      }

      const endDateYMD = template.end_date
        ? ymdFromDateInTz(template.end_date, template.template_timezone)
        : null;

      if (endDateYMD && runDateYMD > endDateYMD) {
        return errorResponse('Template end date has already passed', null, {
          code: ErrorCode.OPERATION_NOT_ALLOWED,
        });
      }

      const journalResult = await generateOccurrenceFromTemplate({
        trx,
        template,
        entries,
        runDateYMD,
        companyId: context.companyUUID,
        userId,
        trigger: 'manual',
        triggeredByUserId: userId,
      });

      const nextRunYMD = advanceRunDate({
        fromYMD: runDateYMD,
        frequency: template.frequency as RecurrenceFrequency,
      });

      const updateData: Record<string, any> = {
        last_run_at: new Date(),
        last_error: null,
        last_failed_at: null,
      };

      if (endDateYMD && nextRunYMD > endDateYMD) {
        updateData.status = 'closed';
        updateData.next_run_date = null;
      } else {
        updateData.next_run_date = ymdToUtcDate(
          nextRunYMD,
          template.template_timezone,
        );
      }

      const [updated] = await trx(TEMPLATES_TABLE)
        .where('id', template.id)
        .update(updateData)
        .returning('*');

      return successResponse('Recurring template run completed', {
        template: mapTemplateRow(updated),
        journalId: journalResult.data?.journalId,
      });
    });

    return result as ApiResponse<RunRecurringTemplateNowResponse>;
  } catch (error) {
    return errorResponse('Failed to run recurring template', error);
  }
}

export async function processDueRecurringTemplates({
  maxRuns = 200,
}: {
  maxRuns?: number;
}): Promise<void> {
  const systemUser = await getSystemUser({ deterministic: true });

  let processed = 0;

  while (processed < maxRuns) {
    const result = await knexClient.transaction(async (trx) => {
      const candidate = await trx(TEMPLATES_TABLE)
        .where('status', 'active')
        .where('is_deleted', false)
        .whereNotNull('next_run_date')
        .andWhere('next_run_date', '<=', trx.fn.now())
        .orderBy('next_run_date', 'asc')
        .limit(1)
        .first<{ id: string; company_id: string }>('id', 'company_id');

      if (!candidate) {
        return { done: true } as const;
      }

      await acquireAdvisoryXactLocks(trx, [
        lockKeyCompany(candidate.company_id),
      ]);

      const template = await trx(TEMPLATES_TABLE)
        .where('id', candidate.id)
        .where('status', 'active')
        .where('is_deleted', false)
        .whereNotNull('next_run_date')
        .andWhere('next_run_date', '<=', trx.fn.now())
        .forUpdate()
        .skipLocked()
        .first();

      if (!template) {
        return { done: false } as const;
      }

      const entries = await trx(ENTRIES_TABLE)
        .where('template_id', template.id)
        .select('*')
        .orderBy('id', 'asc');

      const runDateYMD = ymdFromDateInTz(
        template.next_run_date,
        template.template_timezone,
      );

      const endDateYMD = template.end_date
        ? ymdFromDateInTz(template.end_date, template.template_timezone)
        : null;

      if (endDateYMD && runDateYMD > endDateYMD) {
        await trx(TEMPLATES_TABLE)
          .where('id', template.id)
          .update({ status: 'closed', next_run_date: null });
        return { done: false } as const;
      }

      try {
        await generateOccurrenceFromTemplate({
          trx,
          template,
          entries,
          runDateYMD,
          companyId: template.company_id,
          userId: systemUser.id,
          trigger: 'schedule',
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          // Already generated - advance schedule
        } else {
          const message =
            error instanceof Error ? error.message : String(error);
          await trx(TEMPLATES_TABLE)
            .where('id', template.id)
            .update({
              status: 'paused',
              last_failed_at: new Date(),
              last_error: message,
              failure_count: trx.raw('failure_count + 1'),
            });
          return { done: false } as const;
        }
      }

      const nextRunYMD = advanceRunDate({
        fromYMD: runDateYMD,
        frequency: template.frequency as RecurrenceFrequency,
      });

      const updateData: Record<string, any> = {
        last_run_at: new Date(),
        last_error: null,
        last_failed_at: null,
      };

      if (endDateYMD && nextRunYMD > endDateYMD) {
        updateData.status = 'closed';
        updateData.next_run_date = null;
      } else {
        updateData.next_run_date = ymdToUtcDate(
          nextRunYMD,
          template.template_timezone,
        );
      }

      await trx(TEMPLATES_TABLE).where('id', template.id).update(updateData);

      return { done: false } as const;
    });

    if (result.done) break;
    processed += 1;
  }
}
