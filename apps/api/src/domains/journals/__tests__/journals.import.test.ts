import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { determineExchangeRate } from '../../exchangeRates/exchangeRates.utils.js';
import { importJournals, preflightJournalImport } from '../journals.import.js';

vi.mock('../../exchangeRates/exchangeRates.utils.js', () => ({
  determineExchangeRate: vi.fn(),
}));

describe('journals import - preflight + import', () => {
  let trx: Knex.Transaction;
  let testCompanyId: string;
  let testUserId: string;
  let usdCurrencyId: string;
  let ngnCurrencyId: string;
  let coa: {
    cash: { id: string; name: string; code: string | null };
    expense: { id: string; name: string; code: string | null };
  };

  const prevFxEnv = process.env.JOURNAL_IMPORT_ENABLE_FX;

  beforeEach(async () => {
    const db = getTestDb();
    trx = await db.transaction();

    testCompanyId = await getTestCompanyId(trx, 'bizDemoUS');
    testUserId = await getTestUserId(trx, US_USER_EMAIL);
    usdCurrencyId = await getCurrencyId(trx, 'USD');
    ngnCurrencyId = await getCurrencyId(trx, 'NGN');
    vi.mocked(determineExchangeRate).mockResolvedValue(0.001);

    const cashCoa = await trx('coa')
      .where({ company_id: testCompanyId })
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where('account_types.key', 'ca_bank')
      .select<
        { id: string; name: string; code: string | null }[]
      >('coa.id', 'coa.name', 'coa.code')
      .first();

    const expenseCoa = await trx('coa')
      .where({ company_id: testCompanyId })
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where('account_types.key', 'exp_opex_office_supplies')
      .select<
        { id: string; name: string; code: string | null }[]
      >('coa.id', 'coa.name', 'coa.code')
      .first();

    if (!cashCoa || !expenseCoa) {
      throw new Error(
        'Demo company missing required COAs. Ensure demo data is seeded.',
      );
    }

    coa = { cash: cashCoa, expense: expenseCoa };
  });

  afterEach(async () => {
    process.env.JOURNAL_IMPORT_ENABLE_FX = prevFxEnv;
    vi.mocked(determineExchangeRate).mockReset();
    await trx.rollback();
  });

  it('preflight rejects inconsistent journal_reference groups (different date/title)', async () => {
    const ref = `IMPORT-${randomUUID()}`;
    const result = await preflightJournalImport({
      companyId: testCompanyId,
      userId: testUserId,
      trx,
      body: {
        lines: [
          {
            date: '2025-01-15',
            title: 'Import Journal',
            journal_reference: ref,
            line_description: 'Cash',
            account_code: coa.cash.code ?? undefined,
            account_name: coa.cash.name,
            debit: 100,
          },
          {
            date: '2025-01-16',
            title: 'Import Journal',
            journal_reference: ref,
            line_description: 'Expense',
            account_code: coa.expense.code ?? undefined,
            account_name: coa.expense.name,
            credit: 100,
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.code).toBeDefined();
  });

  it('preflight groups by journal_reference and marks journal saveable/postable when valid', async () => {
    const ref = `IMPORT-${randomUUID()}`;
    const result = await preflightJournalImport({
      companyId: testCompanyId,
      userId: testUserId,
      trx,
      body: {
        lines: [
          {
            date: '2025-01-15',
            title: 'Import Journal',
            journal_reference: ref,
            line_description: 'Cash',
            account_code: coa.cash.code ?? undefined,
            account_name: coa.cash.name,
            debit: 100,
          },
          {
            date: '2025-01-15',
            title: 'Import Journal',
            journal_reference: ref,
            line_description: 'Expense',
            account_code: coa.expense.code ?? undefined,
            account_name: coa.expense.name,
            credit: 100,
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.journals.length).toBe(1);
    expect(result.data?.journals[0]?.canSaveDraft).toBe(true);
    expect(result.data?.journals[0]?.canPost).toBe(true);
  });

  it('preflight errors on mixed currency within a journal group', async () => {
    const ref = `IMPORT-${randomUUID()}`;
    const result = await preflightJournalImport({
      companyId: testCompanyId,
      userId: testUserId,
      trx,
      body: {
        lines: [
          {
            date: '2025-01-15',
            title: 'Mixed Currency Journal',
            journal_reference: ref,
            currency_code: 'USD',
            line_description: 'Cash',
            account_code: coa.cash.code ?? undefined,
            account_name: coa.cash.name,
            debit: 100,
          },
          {
            date: '2025-01-15',
            title: 'Mixed Currency Journal',
            journal_reference: ref,
            currency_code: 'EUR',
            line_description: 'Expense',
            account_code: coa.expense.code ?? undefined,
            account_name: coa.expense.name,
            credit: 100,
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    const journal = result.data!.journals[0]!;
    const codes = journal.messages.map((m) => m.code);
    expect(codes).toContain('MIXED_CURRENCY');
    expect(journal.canSaveDraft).toBe(false);
    expect(journal.canPost).toBe(false);
  });

  it('preflight derives exchange rate when FX is enabled', async () => {
    process.env.JOURNAL_IMPORT_ENABLE_FX = 'true';

    const ref = `IMPORT-${randomUUID()}`;
    const result = await preflightJournalImport({
      companyId: testCompanyId,
      userId: testUserId,
      trx,
      body: {
        lines: [
          {
            date: '2025-01-15',
            title: 'FX Journal',
            journal_reference: ref,
            currency_code: 'NGN',
            line_description: 'Cash',
            account_code: coa.cash.code ?? undefined,
            account_name: coa.cash.name,
            debit: 100,
          },
          {
            date: '2025-01-15',
            title: 'FX Journal',
            journal_reference: ref,
            currency_code: 'NGN',
            line_description: 'Expense',
            account_code: coa.expense.code ?? undefined,
            account_name: coa.expense.name,
            credit: 100,
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    const journal = result.data!.journals[0]!;
    expect(journal.exchangeRate).toBeCloseTo(0.001, 10);
    expect(journal.messages.some((m) => m.code === 'FX_RATE_UNAVAILABLE')).toBe(
      false,
    );
  });

  it('preflight warns when FX rate cannot be derived', async () => {
    process.env.JOURNAL_IMPORT_ENABLE_FX = 'true';
    vi.mocked(determineExchangeRate).mockResolvedValueOnce(null);

    const ref = `IMPORT-${randomUUID()}`;
    const result = await preflightJournalImport({
      companyId: testCompanyId,
      userId: testUserId,
      trx,
      body: {
        lines: [
          {
            date: '2025-01-15',
            title: 'FX Journal',
            journal_reference: ref,
            currency_code: 'NGN',
            line_description: 'Cash',
            account_code: coa.cash.code ?? undefined,
            account_name: coa.cash.name,
            debit: 100,
          },
          {
            date: '2025-01-15',
            title: 'FX Journal',
            journal_reference: ref,
            currency_code: 'NGN',
            line_description: 'Expense',
            account_code: coa.expense.code ?? undefined,
            account_name: coa.expense.name,
            credit: 100,
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    const journal = result.data!.journals[0]!;
    const codes = journal.messages.map((m) => m.code);
    expect(codes).toContain('FX_RATE_UNAVAILABLE');
  });

  it('preflight errors when FX imports are disabled', async () => {
    process.env.JOURNAL_IMPORT_ENABLE_FX = 'false';

    const ref = `IMPORT-${randomUUID()}`;
    const result = await preflightJournalImport({
      companyId: testCompanyId,
      userId: testUserId,
      trx,
      body: {
        lines: [
          {
            date: '2025-01-15',
            title: 'FX Journal',
            journal_reference: ref,
            currency_code: 'NGN',
            line_description: 'Cash',
            account_code: coa.cash.code ?? undefined,
            account_name: coa.cash.name,
            debit: 100,
          },
          {
            date: '2025-01-15',
            title: 'FX Journal',
            journal_reference: ref,
            currency_code: 'NGN',
            line_description: 'Expense',
            account_code: coa.expense.code ?? undefined,
            account_name: coa.expense.name,
            credit: 100,
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    const journal = result.data!.journals[0]!;
    const codes = journal.messages.map((m) => m.code);
    expect(codes).toContain('FX_DISABLED');
  });

  it('preflight errors on unknown currency codes', async () => {
    const ref = `IMPORT-${randomUUID()}`;
    const result = await preflightJournalImport({
      companyId: testCompanyId,
      userId: testUserId,
      trx,
      body: {
        lines: [
          {
            date: '2025-01-15',
            title: 'Bad Currency',
            journal_reference: ref,
            currency_code: 'ZZZ',
            line_description: 'Cash',
            account_code: coa.cash.code ?? undefined,
            account_name: coa.cash.name,
            debit: 100,
          },
          {
            date: '2025-01-15',
            title: 'Bad Currency',
            journal_reference: ref,
            currency_code: 'ZZZ',
            line_description: 'Expense',
            account_code: coa.expense.code ?? undefined,
            account_name: coa.expense.name,
            credit: 100,
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    const journal = result.data!.journals[0]!;
    const codes = journal.messages.map((m) => m.code);
    expect(codes).toContain('UNKNOWN_CURRENCY');
  });

  it('preflight reports missing date/title and summary counts line-level errors', async () => {
    const result = await preflightJournalImport({
      companyId: testCompanyId,
      userId: testUserId,
      trx,
      body: {
        lines: [
          {
            // missing date + title
            line_description: 'Cash',
            account_name: coa.cash.name,
            debit: 10,
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.summary.errors).toBeGreaterThan(0);
    const journal = result.data!.journals[0]!;
    const line = journal.lines[0]!;
    const codes = line.messages.map((m) => m.code);
    expect(codes).toContain('MISSING_DATE');
    expect(codes).toContain('MISSING_TITLE');
  });

  it('imports two journals as drafts (partial) in a transaction', async () => {
    const r1 = `IMPORT-${randomUUID()}`;
    const r2 = `IMPORT-${randomUUID()}`;

    const result = await importJournals({
      companyId: testCompanyId,
      userId: testUserId,
      trx,
      body: {
        mode: 'partial',
        journals: [
          {
            importKey: `ref:${r1}`,
            action: 'draft',
            data: {
              date: '2025-01-10',
              title: 'Draft 1',
              user_reference: r1,
              currency_id: usdCurrencyId,
              entries: [
                {
                  description: 'Cash',
                  coa_id: coa.cash.id,
                  amount: 50,
                  side: 'debit',
                },
                {
                  description: 'Expense',
                  coa_id: coa.expense.id,
                  amount: 50,
                  side: 'credit',
                },
              ],
            },
          },
          {
            importKey: `ref:${r2}`,
            action: 'draft',
            data: {
              date: '2025-01-11',
              title: 'Draft 2',
              user_reference: r2,
              currency_id: usdCurrencyId,
              entries: [
                {
                  description: 'Cash',
                  coa_id: coa.cash.id,
                  amount: 75,
                  side: 'debit',
                },
                {
                  description: 'Expense',
                  coa_id: coa.expense.id,
                  amount: 75,
                  side: 'credit',
                },
              ],
            },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.results.length).toBe(2);
    expect(result.data?.summary.drafts).toBe(2);

    const inserted = await trx('journal_batches')
      .whereIn('user_reference', [r1, r2])
      .select('id', 'status');

    expect(inserted.length).toBe(2);
    expect(inserted.every((r) => r.status === 'draft')).toBe(true);
  }, 30_000);

  it('rejects FX imports when JOURNAL_IMPORT_ENABLE_FX=false', async () => {
    process.env.JOURNAL_IMPORT_ENABLE_FX = 'false';

    const ref = `IMPORT-${randomUUID()}`;
    const result = await importJournals({
      companyId: testCompanyId,
      userId: testUserId,
      trx,
      body: {
        mode: 'partial',
        journals: [
          {
            importKey: `ref:${ref}`,
            action: 'draft',
            data: {
              date: '2025-01-12',
              title: 'FX Draft',
              user_reference: ref,
              currency_id: ngnCurrencyId,
              exchange_rate: 0.001,
              entries: [
                {
                  description: 'Cash',
                  coa_id: coa.cash.id,
                  amount: 100,
                  side: 'debit',
                },
                {
                  description: 'Expense',
                  coa_id: coa.expense.id,
                  amount: 100,
                  side: 'credit',
                },
              ],
            },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.results[0]?.success).toBe(false);
  });
});
