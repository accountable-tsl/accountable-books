import type { TxnFileBase } from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';
import z from 'zod';

import {
  acquireAdvisoryXactLocks,
  lockKeyCompany,
} from '../../shared/services/advisoryLocks.service.js';
import { AppError, ErrorCode } from '../../shared/utils/response.utils.js';
import { determineExchangeRate } from '../exchangeRates/exchangeRates.utils.js';
import { validateDebitCreditBalance } from './journals.utils.js';

import type {
  BaseJournalBatch,
  JournalBatchData,
  JournalEntriesBase,
  UpdateDraftJournalData,
} from './journals.types.js';

export type JournalCompanyContext = {
  companyUUID: string;
  reportingCurrencyId: string;
};

export type ParsedJournalInput = BaseJournalBatch & {
  status: 'draft' | 'posted';
  entries: JournalEntriesBase[];
  files?: TxnFileBase[] | undefined;
};

export async function resolveJournalCompanyContext(p: {
  companyId: string;
  trx: Knex.Transaction;
  traceId: string;
}): Promise<JournalCompanyContext> {
  const company =
    (await p
      .trx('companies')
      .where((b) =>
        b.where('short_code', p.companyId).orWhere('id', p.companyId),
      )
      .where('is_deleted', false)
      .first<{ id: string; reporting_currency_id: string }>(
        'id',
        'reporting_currency_id',
      )) ?? null;

  if (!company?.id || !company?.reporting_currency_id) {
    throw new AppError(
      `Company not found: ${p.companyId}`,
      { traceId: p.traceId, companyId: p.companyId },
      false,
      ErrorCode.NOT_FOUND,
    );
  }

  const companyUUID = company.id as string;
  const reportingCurrencyId = company.reporting_currency_id as string;

  await acquireAdvisoryXactLocks(p.trx, [lockKeyCompany(companyUUID)]);

  return { companyUUID, reportingCurrencyId };
}

export type PreparedJournalInput<TParsed extends ParsedJournalInput> = {
  batch: Omit<TParsed, 'entries' | 'files'>;
  entries: TParsed['entries'];
  files: TxnFileBase[];
  journalReference: string | null;
  journalCurrencyId: string;
  exchangeRate: number;
  isFx: boolean;
  contactId: string | null;
  isRecurring: boolean;
  recurringTemplateId: string | null;
  totalDebits: number;
  totalCredits: number;
};

export async function validateAndPrepareJournalInput<
  TParsed extends ParsedJournalInput,
>(p: {
  data: JournalBatchData | UpdateDraftJournalData;
  schema: z.ZodType<TParsed>;
  context: JournalCompanyContext;
  trx: Knex.Transaction;
  traceId: string;
  journalBatchIdForRefUniqCheck?: string;
}): Promise<PreparedJournalInput<TParsed>> {
  const validatedInput = p.schema.safeParse(p.data);
  if (!validatedInput.success) {
    throw new AppError(
      `Invalid input: ${validatedInput.error.message}`,
      {
        traceId: p.traceId,
        errors: z.flattenError(validatedInput.error),
        message: z.prettifyError(validatedInput.error),
      },
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  const { entries: rawEntries, files = [], ...rawBatch } = validatedInput.data;

  const entries = rawEntries.filter((e) => e.amount !== 0);

  if (entries.some((e) => e.amount < 0)) {
    throw new AppError(
      'Journal entry amounts must be positive',
      { traceId: p.traceId },
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  if (entries.length < 2) {
    throw new AppError(
      'At least two journal entries with non-zero amount are required',
      { traceId: p.traceId },
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  const balanceValidation = validateDebitCreditBalance(entries);
  if (!balanceValidation.isValid) {
    throw new AppError(
      `Journal entries are not balanced: ${balanceValidation.error}`,
      {
        traceId: p.traceId,
        totalDebits: balanceValidation.totalDebits,
        totalCredits: balanceValidation.totalCredits,
      },
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  let journalReference: string | null =
    typeof rawBatch.reference === 'string'
      ? rawBatch.reference.trim()
      : (rawBatch.reference ?? null);
  if (journalReference === '') journalReference = null;

  if (journalReference) {
    const qb = p
      .trx('journal_batches')
      .where('company_id', p.context.companyUUID)
      .where('reference', journalReference)
      .where('is_deleted', false);

    if (p.journalBatchIdForRefUniqCheck) {
      qb.whereNot('id', p.journalBatchIdForRefUniqCheck);
    }

    const existingRef = await qb.first<{ id: string }>('id');
    if (existingRef) {
      throw new AppError(
        'Journal reference already exists',
        {
          traceId: p.traceId,
          journalReference,
          existingJournalBatchId: existingRef.id,
        },
        false,
        ErrorCode.CONFLICT,
      );
    }
  }

  const journalCurrencyId =
    rawBatch.currency_id || p.context.reportingCurrencyId;
  const isFx = journalCurrencyId !== p.context.reportingCurrencyId;

  const currency = await p
    .trx('currencies')
    .where('id', journalCurrencyId)
    .where('is_deleted', false)
    .first<{ id: string }>('id');

  if (!currency) {
    throw new AppError(`Invalid currency ID: ${journalCurrencyId}`, {
      traceId: p.traceId,
    });
  }

  let exchangeRate = 1;
  if (isFx) {
    if (rawBatch.exchange_rate != null) {
      exchangeRate = Number(rawBatch.exchange_rate);
    } else {
      const rate = await determineExchangeRate({
        date: rawBatch.date,
        fromCurrencyId: journalCurrencyId,
        toCurrencyId: p.context.reportingCurrencyId,
      });

      if (!rate) {
        throw new AppError('Failed to determine exchange rate', {
          traceId: p.traceId,
          journalCurrencyId,
          reportingCurrencyId: p.context.reportingCurrencyId,
          date: rawBatch.date,
        });
      }

      exchangeRate = rate;
    }
  }

  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new AppError(
      'Invalid exchange rate',
      { traceId: p.traceId, exchangeRate },
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  const contactId = rawBatch.contact_id ?? null;
  if (contactId) {
    const contact = await p
      .trx('contacts')
      .where('id', contactId)
      .where('company_id', p.context.companyUUID)
      .where('is_deleted', false)
      .where('is_active', true)
      .first<{ id: string }>('id');

    if (!contact) {
      throw new AppError(`Invalid or inactive contact ID: ${contactId}`, {
        traceId: p.traceId,
      });
    }
  }

  const isRecurring = rawBatch.is_recurring ?? false;
  const recurringTemplateId = rawBatch.recurring_template_id ?? null;
  if (isRecurring && !recurringTemplateId) {
    throw new AppError('Recurring journals must include recurringTemplateId', {
      traceId: p.traceId,
    });
  }
  if (!isRecurring && recurringTemplateId) {
    throw new AppError(
      'recurringTemplateId cannot be set if isRecurring is false',
      { traceId: p.traceId },
    );
  }

  const coaIds = [...new Set(entries.map((e) => e.coa_id))];
  if (coaIds.length === 0) {
    throw new AppError(
      'At least one COA is required',
      { traceId: p.traceId },
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  const coas = await p
    .trx('coa')
    .where('company_id', p.context.companyUUID)
    .whereIn('id', coaIds)
    .where('is_deleted', false)
    .where('is_active', true)
    .select('id');

  if (coas.length !== coaIds.length) {
    const foundIds = new Set(coas.map((c) => c.id));
    const missing = coaIds.filter((id) => !foundIds.has(id));
    throw new AppError(`Invalid or inactive COA IDs: ${missing.join(', ')}`, {
      traceId: p.traceId,
    });
  }

  const projectIds = [
    ...new Set(entries.map((e) => e.project_id).filter(Boolean)),
  ] as string[];
  if (projectIds.length > 0) {
    const projects = await p
      .trx('projects')
      .where('company_id', p.context.companyUUID)
      .whereIn('id', projectIds)
      .where('is_deleted', false)
      .where('is_active', true)
      .select('id');

    if (projects.length !== projectIds.length) {
      const foundIds = new Set(projects.map((proj) => proj.id));
      const missing = projectIds.filter((id) => !foundIds.has(id));
      throw new AppError(
        `Invalid or inactive Project IDs: ${missing.join(', ')}`,
        { traceId: p.traceId },
      );
    }
  }

  return {
    batch: rawBatch,
    entries,
    files,
    journalReference,
    journalCurrencyId,
    exchangeRate,
    isFx,
    contactId,
    isRecurring,
    recurringTemplateId,
    totalDebits: balanceValidation.totalDebits!,
    totalCredits: balanceValidation.totalCredits!,
  };
}
