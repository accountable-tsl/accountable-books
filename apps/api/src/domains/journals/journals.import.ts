import type { Knex } from 'knex';

import { ENV } from '../../config/env.js';
import { knexClient } from '../../db/knexClient.js';
import { isValidYMD } from '../../shared/utils/date.utils.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  AppError,
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { determineExchangeRate } from '../exchangeRates/exchangeRates.utils.js';
import { getPeriodStatusForDate } from '../reporting/fiscal-calendar/index.js';
import { postJournalRecord } from './journals.command.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type {
  JournalBatchData,
  JournalImportAction,
  JournalImportBody,
  JournalImportCsvLine,
  JournalImportPreflightBody,
} from './journals.types.js';

type ImportMessage = {
  level: 'error' | 'warning';
  code: string;
  message: string;
  lineNumber?: number;
};

type ResolutionStatus = 'resolved' | 'unresolved' | 'ambiguous';

type PreflightLine = {
  lineNumber: number;
  date?: string;
  title?: string;
  userReference?: string;
  description?: string;
  note?: string;
  currencyCode?: string;
  exchangeRate?: number;
  autoReversalDate?: string;

  lineDescription?: string;

  debit?: number;
  credit?: number;

  side?: 'debit' | 'credit';
  amount?: number;

  account: {
    key: string;
    code?: string;
    name?: string;
    status: ResolutionStatus;
    matches?: number;
    coaId?: string;
  };

  project: {
    key: string;
    code?: string;
    name?: string;
    status: ResolutionStatus;
    matches?: number;
    projectId?: string;
  };

  messages: ImportMessage[];
};

type PreflightJournal = {
  importKey: string;
  date?: string;
  title?: string;
  userReference?: string | null;
  description?: string | null;
  note?: string | null;
  currencyCode?: string | null;
  exchangeRate?: number | null;
  autoReversalDate?: string | null;
  contactId?: string | null;

  totals: { totalDebits: number; totalCredits: number; difference: number };
  lineCount: number;

  periodStatus?: 'open' | 'closed' | 'locked';
  periodInfo?: {
    fiscalYear: number;
    periodNumber: number;
    startDate: string;
    endDate: string;
  };

  canSaveDraft: boolean;
  canPost: boolean;

  messages: ImportMessage[];
  lines: PreflightLine[];
};

type PreflightSummary = {
  totalLines: number;
  totalJournals: number;
  canSaveDraft: number;
  canPost: number;
  errors: number;
  warnings: number;
};

const IMPORT_MAX_LINES = 5000;
const IMPORT_MAX_JOURNALS = Number(ENV.JOURNAL_IMPORT_MAX_JOURNALS) || 500;
const IMPORT_MAX_LINES_PER_JOURNAL =
  Number(ENV.JOURNAL_IMPORT_MAX_LINES_PER_JOURNAL) || 500;

function isFxImportEnabled(): boolean {
  return ENV.JOURNAL_IMPORT_ENABLE_FX !== 'false';
}

function lower(s: string): string {
  return s.trim().toLowerCase();
}

function keyFromCodeOrName(
  prefix: string,
  code?: string,
  name?: string,
): string {
  if (code && code.trim().length) return `${prefix}:code:${lower(code)}`;
  if (name && name.trim().length) return `${prefix}:name:${lower(name)}`;
  return `${prefix}:none`;
}

function whereLowerIn(qb: Knex.QueryBuilder, column: string, values: string[]) {
  const unique = [...new Set(values.map((v) => v.trim().toLowerCase()))].filter(
    Boolean,
  );
  if (unique.length === 0) return qb;

  const placeholders = unique.map(() => '?').join(', ');
  return qb.whereRaw(`lower(${column}) in (${placeholders})`, unique);
}

function getImportKey(row: {
  journal_reference?: string;
  date?: string;
  title?: string;
}): string {
  const ref = row.journal_reference?.trim();
  if (ref && ref.length) return `ref:${ref}`;
  const date = row.date?.trim();
  const title = row.title?.trim();
  if (date && title) return `dt:${date}|${title}`;
  return `invalid:row`;
}

function decimalsOk(n: number): boolean {
  const parts = n.toString().split('.');
  return parts.length === 1 || parts[1]!.length <= 2;
}

async function getCompanyImportContext(
  companyId: string,
  trx?: Knex.Transaction,
): Promise<{
  companyUUID: string;
  reportingCurrencyId: string;
  reportingCurrencyCode: string;
}> {
  const db = trx ?? knexClient;
  const companyUUID = await getCompanyUUID(companyId, trx);

  const company = await db('companies')
    .where('id', companyUUID)
    .where('is_deleted', false)
    .first<{
      id: string;
      reporting_currency_id: string;
    }>('id', 'reporting_currency_id');

  if (!company?.id || !company.reporting_currency_id) {
    throw new AppError(
      `Company not found: ${companyId}`,
      { companyId },
      false,
      ErrorCode.NOT_FOUND,
    );
  }

  const currency = await db('currencies')
    .where('id', company.reporting_currency_id)
    .where('is_deleted', false)
    .first<{ id: string; code: string }>('id', 'code');

  if (!currency?.id || !currency.code) {
    throw new AppError(
      'Company reporting currency not found',
      { companyUUID, reportingCurrencyId: company.reporting_currency_id },
      false,
      ErrorCode.GENERIC,
    );
  }

  return {
    companyUUID,
    reportingCurrencyId: currency.id,
    reportingCurrencyCode: currency.code,
  };
}

export async function preflightJournalImport(p: {
  companyId: string;
  userId: string;
  body: JournalImportPreflightBody;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{ journals: PreflightJournal[]; summary: PreflightSummary }>
> {
  const { companyId, body, trx } = p;
  const db = trx ?? knexClient;

  try {
    if (body.lines.length > IMPORT_MAX_LINES) {
      return errorResponse('Import exceeds maximum allowed lines', {
        maxLines: IMPORT_MAX_LINES,
        received: body.lines.length,
      });
    }

    const context = await getCompanyImportContext(companyId, trx);

    const accountOverrides = new Map<string, string>();
    for (const o of body.overrides?.accounts ?? []) {
      accountOverrides.set(o.key, o.coaId);
    }

    const projectOverrides = new Map<string, string>();
    for (const o of body.overrides?.projects ?? []) {
      projectOverrides.set(o.key, o.projectId);
    }

    const journalOverrides = new Map<string, { contactId: string | null }>();
    for (const o of body.overrides?.journals ?? []) {
      journalOverrides.set(o.importKey, { contactId: o.contactId ?? null });
    }

    // Validate override IDs belong to the company (and are active where relevant)
    if (accountOverrides.size) {
      const ids = [...new Set([...accountOverrides.values()])];
      const rows = await db('coa')
        .where('company_id', context.companyUUID)
        .whereIn('id', ids)
        .where('is_deleted', false)
        .where('is_active', true)
        .select<{ id: string }[]>('id');
      const ok = new Set(rows.map((r) => r.id));
      const invalid = ids.filter((id) => !ok.has(id));
      if (invalid.length) {
        return errorResponse('Invalid account override(s)', {
          invalidCoaIds: invalid,
        });
      }
    }

    if (projectOverrides.size) {
      const ids = [...new Set([...projectOverrides.values()])];
      const rows = await db('projects')
        .where('company_id', context.companyUUID)
        .whereIn('id', ids)
        .where('is_deleted', false)
        .select<{ id: string }[]>('id');
      const ok = new Set(rows.map((r) => r.id));
      const invalid = ids.filter((id) => !ok.has(id));
      if (invalid.length) {
        return errorResponse('Invalid project override(s)', {
          invalidProjectIds: invalid,
        });
      }
    }

    // Preload COA + projects for code/name resolution
    const coaCodeKeys = new Set<string>();
    const coaNameKeys = new Set<string>();
    const projectCodeKeys = new Set<string>();
    const projectNameKeys = new Set<string>();
    const currencyCodes = new Set<string>();
    const references = new Set<string>();

    for (const line of body.lines) {
      if (line.account_code) coaCodeKeys.add(lower(line.account_code));
      if (line.account_name) coaNameKeys.add(lower(line.account_name));
      if (line.project_code) projectCodeKeys.add(lower(line.project_code));
      if (line.project_name) projectNameKeys.add(lower(line.project_name));
      if (line.currency_code)
        currencyCodes.add(line.currency_code.trim().toUpperCase());
      if (line.journal_reference) references.add(line.journal_reference.trim());
    }

    const coaRowsByCode = new Map<
      string,
      Array<{ id: string; name: string; code: string | null }>
    >();
    const coaRowsByName = new Map<
      string,
      Array<{ id: string; name: string; code: string | null }>
    >();

    if (coaCodeKeys.size) {
      const rows = await whereLowerIn(db('coa'), 'code', [...coaCodeKeys])
        .where('company_id', context.companyUUID)
        .where('is_deleted', false)
        .where('is_active', true)
        .select<{ id: string; name: string; code: string | null }[]>(
          'id',
          'name',
          'code',
        );
      for (const r of rows) {
        if (!r.code) continue;
        const k = lower(r.code);
        const arr = coaRowsByCode.get(k) ?? [];
        arr.push(r);
        coaRowsByCode.set(k, arr);
      }
    }

    if (coaNameKeys.size) {
      const rows = await whereLowerIn(db('coa'), 'name', [...coaNameKeys])
        .where('company_id', context.companyUUID)
        .where('is_deleted', false)
        .where('is_active', true)
        .select<{ id: string; name: string; code: string | null }[]>(
          'id',
          'name',
          'code',
        );
      for (const r of rows) {
        const k = lower(r.name);
        const arr = coaRowsByName.get(k) ?? [];
        arr.push(r);
        coaRowsByName.set(k, arr);
      }
    }

    const projectRowsByCode = new Map<
      string,
      Array<{ id: string; name: string; code: string | null }>
    >();
    const projectRowsByName = new Map<
      string,
      Array<{ id: string; name: string; code: string | null }>
    >();

    if (projectCodeKeys.size) {
      const rows = await whereLowerIn(db('projects'), 'code', [
        ...projectCodeKeys,
      ])
        .where('company_id', context.companyUUID)
        .where('is_deleted', false)
        .select<{ id: string; name: string; code: string | null }[]>(
          'id',
          'name',
          'code',
        );
      for (const r of rows) {
        if (!r.code) continue;
        const k = lower(r.code);
        const arr = projectRowsByCode.get(k) ?? [];
        arr.push(r);
        projectRowsByCode.set(k, arr);
      }
    }

    if (projectNameKeys.size) {
      const rows = await whereLowerIn(db('projects'), 'name', [
        ...projectNameKeys,
      ])
        .where('company_id', context.companyUUID)
        .where('is_deleted', false)
        .select<{ id: string; name: string; code: string | null }[]>(
          'id',
          'name',
          'code',
        );
      for (const r of rows) {
        const k = lower(r.name);
        const arr = projectRowsByName.get(k) ?? [];
        arr.push(r);
        projectRowsByName.set(k, arr);
      }
    }

    const currencyByCode = new Map<string, { id: string; code: string }>();
    if (currencyCodes.size) {
      const rows = await db('currencies')
        .whereIn('code', [...currencyCodes])
        .where('is_deleted', false)
        .select<{ id: string; code: string }[]>('id', 'code');
      for (const r of rows) currencyByCode.set(r.code.toUpperCase(), r);
    }

    // Build grouped journals
    const groups = new Map<string, PreflightJournal>();
    const structuralErrors: ImportMessage[] = [];
    const currencyCodesByJournal = new Map<string, Set<string>>();

    const addStructuralError = (msg: ImportMessage) => {
      structuralErrors.push(msg);
    };

    for (let idx = 0; idx < body.lines.length; idx += 1) {
      const lineNumber = idx + 1;
      const line = body.lines[idx] as JournalImportCsvLine;

      const importKeyBase = getImportKey(line);
      const importKey =
        importKeyBase === 'invalid:row'
          ? `invalid:row:${lineNumber}`
          : importKeyBase;

      if (!groups.has(importKey)) {
        const override = journalOverrides.get(importKey);
        groups.set(importKey, {
          importKey,
          date: line.date,
          title: line.title,
          userReference: line.journal_reference ?? null,
          description: line.description ?? null,
          note: line.note ?? null,
          currencyCode: line.currency_code ?? null,
          exchangeRate: null,
          autoReversalDate: line.auto_reversal_date ?? null,
          contactId: override?.contactId ?? null,
          totals: { totalDebits: 0, totalCredits: 0, difference: 0 },
          lineCount: 0,
          canSaveDraft: false,
          canPost: false,
          messages: [],
          lines: [],
        });
      }

      const journal = groups.get(importKey)!;
      journal.lineCount += 1;

      if (journal.lineCount > IMPORT_MAX_LINES_PER_JOURNAL) {
        journal.messages.push({
          level: 'error',
          code: 'LIMIT_LINES_PER_JOURNAL',
          message: `Journal exceeds max lines per journal (${IMPORT_MAX_LINES_PER_JOURNAL})`,
          lineNumber,
        });
      }

      // Structural consistency for user-reference-based groups
      if (importKey.startsWith('ref:')) {
        const existingDate = journal.date?.trim();
        const existingTitle = journal.title?.trim();
        if (
          (existingDate && line.date && existingDate !== line.date) ||
          (existingTitle && line.title && existingTitle !== line.title)
        ) {
          addStructuralError({
            level: 'error',
            code: 'REF_GROUP_INCONSISTENT_HEADER',
            message:
              'Rows with the same journal_reference must have the same date and title',
            lineNumber,
          });
        }
      }

      const messages: ImportMessage[] = [];

      // Date/title validation (row-level; still show in preview)
      const date = line.date?.trim();
      if (!date) {
        messages.push({
          level: 'error',
          code: 'MISSING_DATE',
          message: 'Row is missing required field: date',
          lineNumber,
        });
      }
      if (date && !isValidYMD(date)) {
        messages.push({
          level: 'error',
          code: 'INVALID_DATE',
          message: `Invalid date: ${date}`,
          lineNumber,
        });
      }

      const title = line.title?.trim();
      if (!title) {
        messages.push({
          level: 'error',
          code: 'MISSING_TITLE',
          message: 'Row is missing required field: title',
          lineNumber,
        });
      }
      const autoReversalDate = line.auto_reversal_date?.trim();
      if (autoReversalDate && !isValidYMD(autoReversalDate)) {
        messages.push({
          level: 'error',
          code: 'INVALID_AUTO_REVERSAL_DATE',
          message: `Invalid auto_reversal_date: ${autoReversalDate}`,
          lineNumber,
        });
      }

      const debit = line.debit;
      const credit = line.credit;
      const debitVal = typeof debit === 'number' ? debit : undefined;
      const creditVal = typeof credit === 'number' ? credit : undefined;

      if (debitVal != null && debitVal < 0) {
        messages.push({
          level: 'error',
          code: 'NEGATIVE_DEBIT',
          message: 'Debit cannot be negative',
          lineNumber,
        });
      }
      if (creditVal != null && creditVal < 0) {
        messages.push({
          level: 'error',
          code: 'NEGATIVE_CREDIT',
          message: 'Credit cannot be negative',
          lineNumber,
        });
      }

      const debitPos = debitVal != null && debitVal > 0 ? debitVal : undefined;
      const creditPos =
        creditVal != null && creditVal > 0 ? creditVal : undefined;

      let side: PreflightLine['side'] = undefined;
      let amount: number | undefined = undefined;

      if (debitPos != null && creditPos != null) {
        messages.push({
          level: 'error',
          code: 'BOTH_DEBIT_AND_CREDIT',
          message: 'Row cannot have both debit and credit values',
          lineNumber,
        });
      } else if (debitPos != null) {
        side = 'debit';
        amount = debitPos;
      } else if (creditPos != null) {
        side = 'credit';
        amount = creditPos;
      } else {
        messages.push({
          level: 'error',
          code: 'MISSING_AMOUNT',
          message: 'Row must have either debit or credit > 0',
          lineNumber,
        });
      }

      if (amount != null) {
        if (!Number.isFinite(amount) || amount <= 0) {
          messages.push({
            level: 'error',
            code: 'INVALID_AMOUNT',
            message: 'Amount must be a positive number',
            lineNumber,
          });
        } else if (!decimalsOk(amount)) {
          messages.push({
            level: 'error',
            code: 'TOO_MANY_DECIMALS',
            message: 'Amount cannot have more than 2 decimal places',
            lineNumber,
          });
        }
      }

      const accountCode = line.account_code?.trim();
      const accountName = line.account_name?.trim();
      if (!accountCode && !accountName) {
        messages.push({
          level: 'error',
          code: 'MISSING_ACCOUNT',
          message: 'Row must include account_code or account_name',
          lineNumber,
        });
      }

      const projectCode = line.project_code?.trim();
      const projectName = line.project_name?.trim();

      const accountKey = keyFromCodeOrName('account', accountCode, accountName);
      const projectKey = keyFromCodeOrName('project', projectCode, projectName);

      // Resolve COA
      let coaStatus: ResolutionStatus = 'unresolved';
      let coaId: string | undefined;
      let coaMatches: number | undefined;

      const overriddenCoaId = accountOverrides.get(accountKey);
      if (overriddenCoaId) {
        coaStatus = 'resolved';
        coaId = overriddenCoaId;
      } else if (accountCode) {
        const candidates = coaRowsByCode.get(lower(accountCode)) ?? [];
        if (candidates.length === 1) {
          coaStatus = 'resolved';
          coaId = candidates[0]!.id;
        } else if (candidates.length > 1 && accountName) {
          const byName = candidates.filter(
            (c) => lower(c.name) === lower(accountName),
          );
          if (byName.length === 1) {
            coaStatus = 'resolved';
            coaId = byName[0]!.id;
          } else {
            coaStatus = 'ambiguous';
            coaMatches = candidates.length;
          }
        } else if (candidates.length > 1) {
          coaStatus = 'ambiguous';
          coaMatches = candidates.length;
        } else if (accountName) {
          const nameCandidates = coaRowsByName.get(lower(accountName)) ?? [];
          if (nameCandidates.length === 1) {
            coaStatus = 'resolved';
            coaId = nameCandidates[0]!.id;
          } else if (nameCandidates.length > 1) {
            coaStatus = 'ambiguous';
            coaMatches = nameCandidates.length;
          }
        }
      } else if (accountName) {
        const candidates = coaRowsByName.get(lower(accountName)) ?? [];
        if (candidates.length === 1) {
          coaStatus = 'resolved';
          coaId = candidates[0]!.id;
        } else if (candidates.length > 1) {
          coaStatus = 'ambiguous';
          coaMatches = candidates.length;
        }
      }

      if (accountCode || accountName) {
        if (coaStatus === 'unresolved') {
          messages.push({
            level: 'error',
            code: 'ACCOUNT_UNRESOLVED',
            message: 'Account could not be resolved',
            lineNumber,
          });
        } else if (coaStatus === 'ambiguous') {
          messages.push({
            level: 'error',
            code: 'ACCOUNT_AMBIGUOUS',
            message: `Account matches multiple COAs (${coaMatches ?? 2})`,
            lineNumber,
          });
        }
      }

      // Resolve Project (optional)
      let projectStatus: ResolutionStatus = 'resolved';
      let projectId: string | undefined;
      let projectMatches: number | undefined;

      const overriddenProjectId = projectOverrides.get(projectKey);
      if (overriddenProjectId) {
        projectStatus = 'resolved';
        projectId = overriddenProjectId;
      } else if (projectCode) {
        const candidates = projectRowsByCode.get(lower(projectCode)) ?? [];
        if (candidates.length === 1) {
          projectStatus = 'resolved';
          projectId = candidates[0]!.id;
        } else if (candidates.length > 1 && projectName) {
          const byName = candidates.filter(
            (c) => lower(c.name) === lower(projectName),
          );
          if (byName.length === 1) {
            projectStatus = 'resolved';
            projectId = byName[0]!.id;
          } else {
            projectStatus = 'ambiguous';
            projectMatches = candidates.length;
          }
        } else if (candidates.length > 1) {
          projectStatus = 'ambiguous';
          projectMatches = candidates.length;
        } else if (projectName) {
          const nameCandidates =
            projectRowsByName.get(lower(projectName)) ?? [];
          if (nameCandidates.length === 1) {
            projectStatus = 'resolved';
            projectId = nameCandidates[0]!.id;
          } else if (nameCandidates.length > 1) {
            projectStatus = 'ambiguous';
            projectMatches = nameCandidates.length;
          }
        } else {
          projectStatus = 'unresolved';
        }
      } else if (projectName) {
        const candidates = projectRowsByName.get(lower(projectName)) ?? [];
        if (candidates.length === 1) {
          projectStatus = 'resolved';
          projectId = candidates[0]!.id;
        } else if (candidates.length > 1) {
          projectStatus = 'ambiguous';
          projectMatches = candidates.length;
        } else {
          projectStatus = 'unresolved';
        }
      }

      if (projectCode || projectName) {
        if (projectStatus === 'unresolved') {
          messages.push({
            level: 'error',
            code: 'PROJECT_UNRESOLVED',
            message: 'Project could not be resolved',
            lineNumber,
          });
        } else if (projectStatus === 'ambiguous') {
          messages.push({
            level: 'error',
            code: 'PROJECT_AMBIGUOUS',
            message: `Project matches multiple projects (${projectMatches ?? 2})`,
            lineNumber,
          });
        }
      }

      // Currency consistency/validation: validate per group (but keep row context for debugging)
      const currencyCode = line.currency_code?.trim();
      if (currencyCode) {
        const upper = currencyCode.toUpperCase();
        if (
          !currencyByCode.has(upper) &&
          upper !== context.reportingCurrencyCode
        ) {
          messages.push({
            level: 'error',
            code: 'UNKNOWN_CURRENCY',
            message: `Unknown currency_code: ${upper}`,
            lineNumber,
          });
        }
      }

      const effectiveCurrencyCode = currencyCode
        ? currencyCode.toUpperCase()
        : context.reportingCurrencyCode;
      const currencySet =
        currencyCodesByJournal.get(importKey) ?? new Set<string>();
      currencySet.add(effectiveCurrencyCode);
      currencyCodesByJournal.set(importKey, currencySet);

      const normalized: PreflightLine = {
        lineNumber,
        date: line.date,
        title: line.title,
        userReference: line.journal_reference,
        description: line.description,
        note: line.note,
        currencyCode: line.currency_code,
        autoReversalDate: line.auto_reversal_date,
        lineDescription: line.line_description,
        debit: debitVal,
        credit: creditVal,
        side,
        amount,
        account: {
          key: accountKey,
          code: accountCode,
          name: accountName,
          status: coaStatus,
          matches: coaMatches,
          coaId,
        },
        project: {
          key: projectKey,
          code: projectCode,
          name: projectName,
          status: projectStatus,
          matches: projectMatches,
          projectId,
        },
        messages,
      };

      journal.lines.push(normalized);

      // Keep journal header fields stable; warn on conflicts
      const setIfEmpty = <K extends keyof PreflightJournal>(
        k: K,
        v: PreflightJournal[K],
      ) => {
        if (v == null) return;
        if (journal[k] == null) journal[k] = v;
        else if (journal[k] !== v) {
          journal.messages.push({
            level: 'warning',
            code: 'HEADER_FIELD_CONFLICT',
            message: `Conflicting values for ${String(k)} within the same journal group; using the first value`,
            lineNumber,
          });
        }
      };

      setIfEmpty('description', line.description ?? null);
      setIfEmpty('note', line.note ?? null);
      setIfEmpty('currencyCode', line.currency_code ?? null);
      setIfEmpty('autoReversalDate', line.auto_reversal_date ?? null);
    }

    if (structuralErrors.length) {
      return errorResponse(
        'Import is invalid: inconsistent journal_reference groups',
        {
          errors: structuralErrors,
        },
        { code: ErrorCode.INVALID_INPUT },
      );
    }

    if (groups.size > IMPORT_MAX_JOURNALS) {
      return errorResponse('Import exceeds maximum allowed journals', {
        maxJournals: IMPORT_MAX_JOURNALS,
        received: groups.size,
      });
    }

    // User reference conflicts against DB (existing non-deleted refs)
    const providedRefs = [...references].filter((r) => r.length > 0);
    const existingRefs = new Set<string>();
    if (providedRefs.length) {
      const rows = await db('journal_batches')
        .where('company_id', context.companyUUID)
        .where('is_deleted', false)
        .whereIn('user_reference', providedRefs)
        .select<{ user_reference: string }[]>('user_reference');
      for (const r of rows) existingRefs.add(r.user_reference);
    }

    // Period status lookups by date (distinct)
    const dates = new Set<string>();
    for (const j of groups.values()) {
      if (j.date && isValidYMD(j.date)) dates.add(j.date);
    }
    const periodByDate = new Map<
      string,
      {
        status?: 'open' | 'closed' | 'locked';
        periodInfo?: any;
        error?: string;
      }
    >();
    for (const d of dates) {
      try {
        const status = await getPeriodStatusForDate({
          companyId: context.companyUUID,
          date: d,
          trx,
        });
        periodByDate.set(d, status);
      } catch (error: unknown) {
        periodByDate.set(d, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Finalize per-journal validation
    for (const j of groups.values()) {
      const messages: ImportMessage[] = [...j.messages];

      const hasLineErrors = j.lines.some((l) =>
        l.messages.some((m) => m.level === 'error'),
      );

      // Totals: compute from amount-bearing lines even if account/project resolution is failing,
      // so users can still see if the journal balances.
      const amountLines = j.lines.filter(
        (l) =>
          l.side &&
          l.amount != null &&
          Number.isFinite(l.amount) &&
          l.amount > 0 &&
          // exclude obvious amount/side failures
          !l.messages.some((m) => m.code === 'MISSING_AMOUNT'),
      );

      // Currency validation at journal level
      const currencySet =
        currencyCodesByJournal.get(j.importKey) ?? new Set<string>();
      const currencyCodesList = [...currencySet];
      if (currencyCodesList.length > 1) {
        const sorted = currencyCodesList.sort();
        const ref = j.userReference?.trim();
        const date = j.date?.trim();
        const title = j.title?.trim();
        const journalLabel = ref
          ? `user reference ${ref}`
          : `date ${date ?? '(missing)'} and title ${title ?? '(missing)'}`;
        messages.push({
          level: 'error',
          code: 'MIXED_CURRENCY',
          message: `Journal group with ${journalLabel} must use a single currency. Found: ${sorted.join(', ')}`,
        });
        j.currencyCode = null;
      } else if (currencyCodesList.length === 1) {
        j.currencyCode = currencyCodesList[0]!;
      }

      const currencyCode = j.currencyCode?.trim();
      const fxEnabled = isFxImportEnabled();
      const reportingCode = context.reportingCurrencyCode;

      if (!currencyCode) {
        // Default to reporting currency; no further checks.
      } else {
        const upper = currencyCode.toUpperCase();
        if (upper !== reportingCode && !fxEnabled) {
          messages.push({
            level: 'error',
            code: 'FX_DISABLED',
            message: `FX imports are disabled; currency_code must be ${reportingCode}`,
          });
        }

        if (upper !== reportingCode && fxEnabled) {
          const currency = currencyByCode.get(upper);
          if (!currency) {
            messages.push({
              level: 'error',
              code: 'UNKNOWN_CURRENCY',
              message: `Unknown currency_code: ${upper}`,
            });
          } else if (j.date && isValidYMD(j.date)) {
            const rate = await determineExchangeRate({
              date: j.date,
              fromCurrencyId: currency.id,
              toCurrencyId: context.reportingCurrencyId,
            });
            if (rate && Number.isFinite(rate) && rate > 0) {
              j.exchangeRate = rate;
            } else {
              messages.push({
                level: 'warning',
                code: 'FX_RATE_UNAVAILABLE',
                message: `Unable to derive exchange rate for ${upper} on ${j.date}; please enter an exchange rate in preview`,
              });
            }
          } else {
            messages.push({
              level: 'warning',
              code: 'FX_RATE_UNAVAILABLE',
              message: `Unable to derive exchange rate for ${upper} without a valid date; please enter an exchange rate in preview`,
            });
          }
        }
      }

      const entriesCount = amountLines.length;
      if (entriesCount < 2) {
        messages.push({
          level: 'error',
          code: 'MIN_ENTRIES',
          message: 'Each journal must have at least two valid lines',
        });
      }

      // Totals (computed over valid amount-bearing lines)
      let totalDebits = 0;
      let totalCredits = 0;
      for (const l of amountLines) {
        if (!l.side || l.amount == null) continue;
        if (l.side === 'debit') totalDebits += l.amount;
        if (l.side === 'credit') totalCredits += l.amount;
      }
      const difference = totalDebits - totalCredits;

      j.totals = {
        totalDebits,
        totalCredits,
        difference,
      };

      if (Math.abs(difference) > 1e-10) {
        messages.push({
          level: 'error',
          code: 'NOT_BALANCED',
          message: `Debits and credits do not balance (difference: ${difference})`,
        });
      }

      // User reference conflicts
      const ref = j.userReference?.trim();
      if (ref && existingRefs.has(ref)) {
        messages.push({
          level: 'error',
          code: 'REFERENCE_CONFLICT',
          message: 'User reference already exists',
        });
      }

      // Period status
      if (j.date && isValidYMD(j.date)) {
        const period = periodByDate.get(j.date);
        if (period) {
          if (period.status) {
            j.periodStatus = period.status;
            j.periodInfo = period.periodInfo;
          } else if (period.error) {
            messages.push({
              level: 'warning',
              code: 'PERIOD_STATUS_UNAVAILABLE',
              message: `Unable to determine fiscal period status for ${j.date}: ${period.error}`,
            });
          }
        }
      }

      const hasErrors =
        hasLineErrors || messages.some((m) => m.level === 'error');
      j.messages = messages;
      j.canSaveDraft = !hasErrors;
      j.canPost = !hasErrors && j.periodStatus === 'open';
    }

    const journals = [...groups.values()].sort((a, b) =>
      (a.date ?? '').localeCompare(b.date ?? ''),
    );

    const countMessages = (
      js: PreflightJournal[],
      level: ImportMessage['level'],
    ) => {
      const journalLevel = js.reduce(
        (n, j) => n + j.messages.filter((m) => m.level === level).length,
        0,
      );
      const lineLevel = js.reduce((n, j) => {
        const c = j.lines.reduce(
          (ln, l) => ln + l.messages.filter((m) => m.level === level).length,
          0,
        );
        return n + c;
      }, 0);
      return journalLevel + lineLevel;
    };

    const summary = {
      totalLines: body.lines.length,
      totalJournals: journals.length,
      canSaveDraft: journals.filter((j) => j.canSaveDraft).length,
      canPost: journals.filter((j) => j.canPost).length,
      errors: countMessages(journals, 'error'),
      warnings: countMessages(journals, 'warning'),
    } satisfies PreflightSummary;

    return successResponse('Import preflight completed', { journals, summary });
  } catch (error) {
    if (trx) throw error;
    return errorResponse('Failed to preflight import', error);
  }
}

export async function importJournals(p: {
  companyId: string;
  userId: string;
  body: JournalImportBody;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    results: Array<{
      importKey: string;
      action: JournalImportAction;
      success: boolean;
      journalBatchId?: string;
      systemReference?: string | null;
      ledgerTransactionId?: string | null;
      code?: string;
      message?: string;
      error?: unknown;
    }>;
    summary: {
      total: number;
      drafts: number;
      posted: number;
      failed: number;
    };
  }>
> {
  const { companyId, userId, body, trx } = p;
  if (body.journals.length > IMPORT_MAX_JOURNALS) {
    return errorResponse('Import exceeds maximum allowed journals', {
      maxJournals: IMPORT_MAX_JOURNALS,
      received: body.journals.length,
    });
  }

  try {
    // Fast request-level validation to avoid avoidable DB constraint errors.
    const importKeys = body.journals.map((j) => j.importKey);
    const seenKeys = new Set<string>();
    const dupKeys = new Set<string>();
    for (const k of importKeys) {
      if (seenKeys.has(k)) dupKeys.add(k);
      seenKeys.add(k);
    }
    if (dupKeys.size) {
      return errorResponse(
        'Duplicate importKey values are not allowed',
        { duplicateImportKeys: [...dupKeys] },
        { code: ErrorCode.INVALID_INPUT },
      );
    }

    const refs = body.journals
      .map((j) => (j.data.user_reference ?? '').trim())
      .filter((r) => r.length > 0);
    const seenRefs = new Set<string>();
    const dupRefs = new Set<string>();
    for (const r of refs) {
      if (seenRefs.has(r)) dupRefs.add(r);
      seenRefs.add(r);
    }
    if (dupRefs.size) {
      return errorResponse(
        'Duplicate user references in the same import are not allowed',
        { duplicateReferences: [...dupRefs] },
        { code: ErrorCode.INVALID_INPUT },
      );
    }

    const context = await getCompanyImportContext(companyId, trx);
    const fxEnabled = isFxImportEnabled();

    const runOne = async (
      j: JournalImportBody['journals'][number],
      tx?: Knex.Transaction,
    ) => {
      const action = j.action;
      const currencyId =
        j.data.currency_id != null ? String(j.data.currency_id) : undefined;

      if (
        !fxEnabled &&
        currencyId &&
        currencyId !== context.reportingCurrencyId
      ) {
        throw new AppError(
          'FX imports are disabled for this environment',
          { currencyId, reportingCurrencyId: context.reportingCurrencyId },
          false,
          ErrorCode.OPERATION_NOT_ALLOWED,
        );
      }

      const dataForPost: JournalBatchData = {
        status: action,
        userReference: j.data.user_reference ?? null,
        date: j.data.date,
        title: j.data.title,
        description: j.data.description ?? undefined,
        note: j.data.note ?? undefined,
        contactId: j.data.contact_id ?? null,
        currencyId: j.data.currency_id ?? undefined,
        exchangeRate: j.data.exchange_rate ?? undefined,
        autoReversalDate: j.data.auto_reversal_date ?? undefined,
        metadata: j.data.metadata,
        entries: j.data.entries.map((e) => ({
          description: e.description,
          side: e.side,
          amount: e.amount,
          coaId: e.coa_id,
          projectId: e.project_id ?? null,
        })),
      };

      return postJournalRecord({
        companyId: context.companyUUID,
        userId,
        trx: tx,
        data: dataForPost,
      });
    };

    const results: Array<{
      importKey: string;
      action: JournalImportAction;
      success: boolean;
      journalBatchId?: string;
      systemReference?: string | null;
      ledgerTransactionId?: string | null;
      code?: string;
      message?: string;
      error?: unknown;
    }> = [];

    if (trx) {
      // Caller controls the transaction boundary.
      if (body.mode === 'all_or_nothing') {
        for (const j of body.journals) {
          const res = await runOne(j, trx);
          if (!res.success || !res.data) {
            throw new AppError(
              'Import failed (all_or_nothing)',
              { importKey: j.importKey, response: res },
              false,
              ErrorCode.GENERIC,
            );
          }
          results.push({
            importKey: j.importKey,
            action: j.action,
            success: true,
            journalBatchId: res.data.journalBatchId,
            systemReference: res.data.systemReference ?? null,
            ledgerTransactionId: res.data.ledgerTransactionId ?? null,
          });
        }
      } else {
        for (const j of body.journals) {
          try {
            const res = await runOne(j, trx);
            results.push(
              res.success && res.data
                ? {
                    importKey: j.importKey,
                    action: j.action,
                    success: true,
                    journalBatchId: res.data.journalBatchId,
                    systemReference: res.data.systemReference ?? null,
                    ledgerTransactionId: res.data.ledgerTransactionId ?? null,
                  }
                : {
                    importKey: j.importKey,
                    action: j.action,
                    success: false,
                    code: res.code,
                    message: res.message,
                    error: res.error,
                  },
            );
          } catch (error: unknown) {
            results.push({
              importKey: j.importKey,
              action: j.action,
              success: false,
              code: error instanceof AppError ? error.code : ErrorCode.GENERIC,
              message: error instanceof Error ? error.message : 'Import failed',
              error,
            });
          }
        }
      }
    } else if (body.mode === 'all_or_nothing') {
      await knexClient.transaction(async (tx) => {
        for (const j of body.journals) {
          const res = await runOne(j, tx);
          if (!res.success || !res.data) {
            throw new AppError(
              'Import failed (all_or_nothing)',
              { importKey: j.importKey, response: res },
              false,
              ErrorCode.GENERIC,
            );
          }
          results.push({
            importKey: j.importKey,
            action: j.action,
            success: true,
            journalBatchId: res.data.journalBatchId,
            systemReference: res.data.systemReference ?? null,
            ledgerTransactionId: res.data.ledgerTransactionId ?? null,
          });
        }
      });
    } else {
      // partial: each journal gets its own transaction
      for (const j of body.journals) {
        try {
          const res = await runOne(j, undefined);
          results.push(
            res.success && res.data
              ? {
                  importKey: j.importKey,
                  action: j.action,
                  success: true,
                  journalBatchId: res.data.journalBatchId,
                  systemReference: res.data.systemReference ?? null,
                  ledgerTransactionId: res.data.ledgerTransactionId ?? null,
                }
              : {
                  importKey: j.importKey,
                  action: j.action,
                  success: false,
                  code: res.code,
                  message: res.message,
                  error: res.error,
                },
          );
        } catch (error: unknown) {
          results.push({
            importKey: j.importKey,
            action: j.action,
            success: false,
            code: error instanceof AppError ? error.code : ErrorCode.GENERIC,
            message: error instanceof Error ? error.message : 'Import failed',
            error,
          });
        }
      }
    }

    const drafts = results.filter(
      (r) => r.success && r.action === 'draft',
    ).length;
    const posted = results.filter(
      (r) => r.success && r.action === 'posted',
    ).length;
    const failed = results.filter((r) => !r.success).length;

    return successResponse('Import completed', {
      results,
      summary: { total: results.length, drafts, posted, failed },
    });
  } catch (error) {
    if (trx) throw error;
    return errorResponse('Failed to import journals', error);
  }
}
