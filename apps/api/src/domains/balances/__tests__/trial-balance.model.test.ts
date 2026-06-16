import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { queueBroker } from '../../../jobs/queues/queue-broker.js';
import {
  createLedgerRecord,
  supersedeLedgerTransaction,
} from '../../ledgers/index.js';
import { fiscalCalendarService } from '../../reporting/fiscal-calendar/fiscal-calendar.service.js';
import { balanceRecalcQueue } from '../balance-recalc.queue.js';
import { getTrialBalance, refreshTrialBalance } from '../balances.model.js';
import { glBalanceService } from '../gl-balance.service.js';

import type { NewLedgerTransactionData } from '../../ledgers/index.js';

type TrialBalanceFixture = {
  companyId: string;
  userId: string;
  usdCurrencyId: string;
  cashCoaId: string;
  revenueCoaId: string;
  expenseCoaId: string;
  zeroCoaId: string;
};

describe('trial balance', () => {
  let trx: Knex.Transaction;
  let fixture: TrialBalanceFixture;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    fixture = await createFixture(trx);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    queueBroker.configure({ disableAll: true, logSkipped: true });
    await trx.rollback();
  });

  it('returns a balanced fiscal-period trial balance with zero accounts and explicit checks', async () => {
    await postJournal({
      trx,
      fixture,
      date: '2025-01-15',
      entries: [
        { coaId: fixture.cashCoaId, amount: 1000, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -1000, description: 'Receipt' },
      ],
    });

    await recalculateAccounts({
      trx,
      fixture,
      coaIds: [fixture.cashCoaId, fixture.revenueCoaId],
      from: '2025-01-15',
      to: '2025-01-15',
    });

    const result = await getTrialBalance({
      companyId: fixture.companyId,
      fiscalYear: 2025,
      periodNumber: 1,
      periodType: 'monthly',
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.period).toMatchObject({
      fiscalYear: 2025,
      periodNumber: 1,
      periodType: 'monthly',
      defaulted: false,
    });
    expect(result.data?.currency).toMatchObject({
      code: 'USD',
      minorUnit: 2,
    });
    expect(result.data?.checks).toMatchObject({
      opening: { balanced: true, difference: '0.000' },
      movement: { balanced: true, difference: '0.000' },
      closing: { balanced: true, difference: '0.000' },
    });
    expect(result.data?.freshness.status).toBe('fresh');
    expect(result.data?.checks).toMatchObject({
      opening: { balanced: true, difference: '0.000' },
      movement: { balanced: true, difference: '0.000' },
      closing: { balanced: true, difference: '0.000' },
    });

    const accounts = result.data?.accounts ?? [];
    expect(accounts.map((account) => account.coaId)).toContain(
      fixture.zeroCoaId,
    );

    const cash = accounts.find((account) => account.coaId === fixture.cashCoaId);
    const revenue = accounts.find(
      (account) => account.coaId === fixture.revenueCoaId,
    );
    const zero = accounts.find((account) => account.coaId === fixture.zeroCoaId);

    expect(cash).toMatchObject({
      accountCode: '1000',
      accountName: 'Operating Cash',
      periodDebit: '1000.00',
      periodCredit: '0.00',
      closingDebit: '1000.00',
      closingCredit: '0.00',
      signedClosingBalance: '1000.000',
    });
    expect(revenue).toMatchObject({
      accountCode: '4000',
      periodDebit: '0.00',
      periodCredit: '1000.00',
      closingDebit: '0.00',
      closingCredit: '1000.00',
      signedClosingBalance: '-1000.000',
    });
    expect(zero).toMatchObject({
      periodDebit: '0.00',
      periodCredit: '0.00',
      closingDebit: '0.00',
      closingCredit: '0.00',
      hasPeriodBalance: false,
    });
  });

  it('defaults to the monthly fiscal period containing the requested company-local date', async () => {
    const result = await getTrialBalance({
      companyId: fixture.companyId,
      asOfDate: '2025-02-14',
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.period).toMatchObject({
      fiscalYear: 2025,
      periodNumber: 2,
      periodType: 'monthly',
      startDate: '2025-02-01',
      endDate: '2025-02-28',
      defaulted: true,
    });
  });

  it('defaults to the requested fiscal period type when period type is explicit', async () => {
    const result = await getTrialBalance({
      companyId: fixture.companyId,
      periodType: 'quarterly',
      asOfDate: '2025-05-14',
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.period).toMatchObject({
      fiscalYear: 2025,
      periodNumber: 2,
      periodType: 'quarterly',
      defaulted: true,
    });
  });

  it('marks posted period activity without a materialized period balance as missing', async () => {
    await postJournal({
      trx,
      fixture,
      date: '2025-03-12',
      entries: [
        { coaId: fixture.cashCoaId, amount: 250, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -250, description: 'Receipt' },
      ],
    });

    const result = await getTrialBalance({
      companyId: fixture.companyId,
      fiscalYear: 2025,
      periodNumber: 3,
      periodType: 'monthly',
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.freshness.status).toBe('missing');
    expect(result.data?.freshness.missingCoaIds).toEqual(
      expect.arrayContaining([fixture.cashCoaId, fixture.revenueCoaId]),
    );
    expect(result.data?.accounts.find((a) => a.coaId === fixture.cashCoaId))
      .toMatchObject({
        hasPeriodBalance: false,
        freshness: 'missing',
      });
  });

  it('marks period balances as stale when newer relevant ledger state exists', async () => {
    await postJournal({
      trx,
      fixture,
      date: '2025-04-10',
      entries: [
        { coaId: fixture.cashCoaId, amount: 300, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -300, description: 'Receipt' },
      ],
    });

    await recalculateAccounts({
      trx,
      fixture,
      coaIds: [fixture.cashCoaId, fixture.revenueCoaId],
      from: '2025-04-10',
      to: '2025-04-10',
    });

    await trx('gl_period_balances')
      .where({
        company_id: fixture.companyId,
        fiscal_year: 2025,
        period_number: 4,
        period_type: 'monthly',
      })
      .update({ calculated_at: new Date('2025-04-10T00:00:00Z') });

    await postJournal({
      trx,
      fixture,
      date: '2025-04-12',
      entries: [
        { coaId: fixture.cashCoaId, amount: 50, description: 'Later receipt' },
        {
          coaId: fixture.revenueCoaId,
          amount: -50,
          description: 'Later receipt',
        },
      ],
    });

    const result = await getTrialBalance({
      companyId: fixture.companyId,
      fiscalYear: 2025,
      periodNumber: 4,
      periodType: 'monthly',
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.freshness.status).toBe('stale');
    expect(result.data?.freshness.staleCoaIds).toEqual(
      expect.arrayContaining([fixture.cashCoaId, fixture.revenueCoaId]),
    );
  });

  it('marks period balances as stale when a transaction is superseded out of the period', async () => {
    const oldLedgerTransactionId = await postJournal({
      trx,
      fixture,
      date: '2025-04-10',
      entries: [
        { coaId: fixture.cashCoaId, amount: 300, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -300, description: 'Receipt' },
      ],
    });

    await recalculateAccounts({
      trx,
      fixture,
      coaIds: [fixture.cashCoaId, fixture.revenueCoaId],
      from: '2025-04-10',
      to: '2025-04-10',
    });

    await trx('gl_period_balances')
      .where({
        company_id: fixture.companyId,
        fiscal_year: 2025,
        period_number: 4,
        period_type: 'monthly',
      })
      .update({ calculated_at: new Date('2025-04-10T00:00:00Z') });

    const supersede = await supersedeLedgerTransaction({
      oldLedgerTransactionId,
      newData: buildManualJournal({
        fixture,
        date: '2025-05-10',
        entries: [
          {
            coaId: fixture.cashCoaId,
            amount: 300,
            description: 'Receipt moved to May',
          },
          {
            coaId: fixture.revenueCoaId,
            amount: -300,
            description: 'Receipt moved to May',
          },
        ],
      }),
      companyId: fixture.companyId,
      userId: fixture.userId,
      trx,
    });
    expect(supersede.success).toBe(true);

    const result = await getTrialBalance({
      companyId: fixture.companyId,
      fiscalYear: 2025,
      periodNumber: 4,
      periodType: 'monthly',
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.freshness.status).toBe('stale');
    expect(result.data?.freshness.staleCoaIds).toEqual(
      expect.arrayContaining([fixture.cashCoaId, fixture.revenueCoaId]),
    );
  });

  it('marks carry-forward balances stale when the opening anchor is newer than the period row', async () => {
    await postJournal({
      trx,
      fixture,
      date: '2025-01-15',
      entries: [
        { coaId: fixture.cashCoaId, amount: 400, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -400, description: 'Receipt' },
      ],
    });
    await postJournal({
      trx,
      fixture,
      date: '2025-02-10',
      entries: [
        { coaId: fixture.cashCoaId, amount: 100, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -100, description: 'Receipt' },
      ],
    });

    await recalculateAccounts({
      trx,
      fixture,
      coaIds: [fixture.cashCoaId, fixture.revenueCoaId],
      from: '2025-01-15',
      to: '2025-02-10',
    });

    await trx('gl_daily_balance_snapshots')
      .where({
        company_id: fixture.companyId,
        coa_id: fixture.cashCoaId,
        day: '2025-01-31',
      })
      .update({ calculated_at: new Date('2025-07-20T00:00:00Z') });
    await trx('gl_period_balances')
      .where({
        company_id: fixture.companyId,
        coa_id: fixture.cashCoaId,
        fiscal_year: 2025,
        period_number: 2,
        period_type: 'monthly',
      })
      .update({ calculated_at: new Date('2025-07-15T00:00:00Z') });

    const result = await getTrialBalance({
      companyId: fixture.companyId,
      fiscalYear: 2025,
      periodNumber: 2,
      periodType: 'monthly',
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.freshness.status).toBe('stale');
    expect(result.data?.freshness.staleCoaIds).toContain(fixture.cashCoaId);
  });

  it('keeps P&L openings at zero at fiscal-year start while balance sheet accounts carry forward', async () => {
    await postJournal({
      trx,
      fixture,
      date: '2025-12-15',
      entries: [
        { coaId: fixture.cashCoaId, amount: 700, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -700, description: 'Receipt' },
      ],
    });
    await postJournal({
      trx,
      fixture,
      date: '2026-01-10',
      entries: [
        { coaId: fixture.cashCoaId, amount: 200, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -200, description: 'Receipt' },
      ],
    });

    await recalculateAccounts({
      trx,
      fixture,
      coaIds: [fixture.cashCoaId, fixture.revenueCoaId],
      from: '2025-12-15',
      to: '2026-01-10',
    });

    const result = await getTrialBalance({
      companyId: fixture.companyId,
      fiscalYear: 2026,
      periodNumber: 1,
      periodType: 'monthly',
      trx,
    });

    expect(result.success).toBe(true);
    expect(
      result.data?.accounts.find((account) => account.coaId === fixture.cashCoaId),
    ).toMatchObject({
      signedOpeningBalance: '700.000',
      signedClosingBalance: '900.000',
    });
    expect(
      result.data?.accounts.find(
        (account) => account.coaId === fixture.revenueCoaId,
      ),
    ).toMatchObject({
      signedOpeningBalance: '0.000',
      signedClosingBalance: '-200.000',
    });
  });

  it('returns an arbitrary date-range trial balance with balance sheet carry-forward and P&L range activity', async () => {
    await postJournal({
      trx,
      fixture,
      date: '2025-01-15',
      entries: [
        { coaId: fixture.cashCoaId, amount: 400, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -400, description: 'Receipt' },
      ],
    });
    await postJournal({
      trx,
      fixture,
      date: '2025-02-10',
      entries: [
        { coaId: fixture.cashCoaId, amount: 100, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -100, description: 'Receipt' },
      ],
    });

    await recalculateAccounts({
      trx,
      fixture,
      coaIds: [fixture.cashCoaId, fixture.revenueCoaId],
      from: '2025-01-15',
      to: '2025-02-10',
    });

    const result = await getTrialBalance({
      companyId: fixture.companyId,
      fromDate: '2025-02-01',
      toDate: '2025-02-28',
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.period).toMatchObject({
      kind: 'date_range',
      startDate: '2025-02-01',
      endDate: '2025-02-28',
      requestedStartDate: '2025-02-01',
      requestedEndDate: '2025-02-28',
      effectiveStartDate: '2025-02-01',
      effectiveEndDate: '2025-02-28',
      isFutureRange: false,
      defaulted: false,
    });
    expect(result.data?.freshness.status).toBe('fresh');

    const cash = result.data?.accounts.find(
      (account) => account.coaId === fixture.cashCoaId,
    );
    const revenue = result.data?.accounts.find(
      (account) => account.coaId === fixture.revenueCoaId,
    );

    expect(cash).toMatchObject({
      signedOpeningBalance: '400.000',
      periodDebit: '100.00',
      periodCredit: '0.00',
      signedClosingBalance: '500.000',
      closingDebit: '500.00',
    });
    expect(revenue).toMatchObject({
      signedOpeningBalance: '-400.000',
      periodDebit: '0.00',
      periodCredit: '100.00',
      signedClosingBalance: '-500.000',
      closingCredit: '500.00',
    });
  });

  it('keeps arbitrary cross-year P&L as range activity without carrying prior fiscal-year P&L', async () => {
    await postJournal({
      trx,
      fixture,
      date: '2025-12-15',
      entries: [
        { coaId: fixture.cashCoaId, amount: 700, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -700, description: 'Receipt' },
      ],
    });
    await postJournal({
      trx,
      fixture,
      date: '2026-01-10',
      entries: [
        { coaId: fixture.cashCoaId, amount: 200, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -200, description: 'Receipt' },
      ],
    });

    await recalculateAccounts({
      trx,
      fixture,
      coaIds: [fixture.cashCoaId, fixture.revenueCoaId],
      from: '2025-12-15',
      to: '2026-01-10',
    });

    const result = await getTrialBalance({
      companyId: fixture.companyId,
      fromDate: '2025-12-01',
      toDate: '2026-01-31',
      trx,
    });

    expect(result.success).toBe(true);

    expect(
      result.data?.accounts.find((account) => account.coaId === fixture.cashCoaId),
    ).toMatchObject({
      signedOpeningBalance: '0.000',
      periodDebit: '900.00',
      signedClosingBalance: '900.000',
    });
    expect(
      result.data?.accounts.find(
        (account) => account.coaId === fixture.revenueCoaId,
      ),
    ).toMatchObject({
      signedOpeningBalance: '0.000',
      periodCredit: '900.00',
      signedClosingBalance: '-900.000',
    });
  });

  it('caps future arbitrary date ranges at the company-local as-of date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));

    await postJournal({
      trx,
      fixture,
      date: '2026-06-10',
      entries: [
        { coaId: fixture.cashCoaId, amount: 125, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -125, description: 'Receipt' },
      ],
    });

    await recalculateAccounts({
      trx,
      fixture,
      coaIds: [fixture.cashCoaId, fixture.revenueCoaId],
      from: '2026-06-10',
      to: '2026-06-10',
    });

    const result = await getTrialBalance({
      companyId: fixture.companyId,
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.period).toMatchObject({
      kind: 'date_range',
      requestedEndDate: '2026-06-30',
      effectiveEndDate: '2026-06-14',
      endDate: '2026-06-14',
      isFutureRange: true,
      isOpenRange: true,
    });
    expect(
      result.data?.accounts.find((account) => account.coaId === fixture.cashCoaId),
    ).toMatchObject({
      periodDebit: '125.00',
      signedClosingBalance: '125.000',
    });

    vi.useRealTimers();
  });

  it('includes inactive historical accounts with period activity when zero accounts are hidden', async () => {
    await postJournal({
      trx,
      fixture,
      date: '2025-05-08',
      entries: [
        { coaId: fixture.cashCoaId, amount: -125, description: 'Payment' },
        { coaId: fixture.expenseCoaId, amount: 125, description: 'Payment' },
      ],
    });

    await recalculateAccounts({
      trx,
      fixture,
      coaIds: [fixture.cashCoaId, fixture.expenseCoaId],
      from: '2025-05-08',
      to: '2025-05-08',
    });

    await trx('coa')
      .where({ id: fixture.expenseCoaId })
      .update({ is_active: false });

    const result = await getTrialBalance({
      companyId: fixture.companyId,
      fiscalYear: 2025,
      periodNumber: 5,
      periodType: 'monthly',
      includeZeroBalances: false,
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.accounts.map((account) => account.coaId)).toContain(
      fixture.expenseCoaId,
    );
    expect(result.data?.accounts.map((account) => account.coaId)).not.toContain(
      fixture.zeroCoaId,
    );
  });

  it('does not queue refresh jobs when the trial balance is already fresh', async () => {
    await postJournal({
      trx,
      fixture,
      date: '2025-06-18',
      entries: [
        { coaId: fixture.cashCoaId, amount: 150, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -150, description: 'Receipt' },
      ],
    });

    await recalculateAccounts({
      trx,
      fixture,
      coaIds: [fixture.cashCoaId, fixture.revenueCoaId],
      from: '2025-06-18',
      to: '2025-06-18',
    });

    const add = vi.spyOn(balanceRecalcQueue, 'add');

    const result = await refreshTrialBalance({
      companyId: fixture.companyId,
      fiscalYear: 2025,
      periodNumber: 6,
      periodType: 'monthly',
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe('Trial balance is already fresh');
    expect(result.data).toMatchObject({
      accountsTargeted: 0,
      jobsQueued: 0,
      jobs: [],
    });
    expect(add).not.toHaveBeenCalled();
  });

  it('queues refresh jobs for stale or missing trial balance accounts only', async () => {
    await postJournal({
      trx,
      fixture,
      date: '2025-07-10',
      entries: [
        { coaId: fixture.cashCoaId, amount: 225, description: 'Receipt' },
        { coaId: fixture.revenueCoaId, amount: -225, description: 'Receipt' },
      ],
    });

    queueBroker.configure({ disableAll: false, logSkipped: false });
    vi.spyOn(balanceRecalcQueue, 'getJob').mockResolvedValue(undefined);
    const add = vi
      .spyOn(balanceRecalcQueue, 'add')
      .mockResolvedValue({ id: 'gl-refresh-job' } as any);

    const result = await refreshTrialBalance({
      companyId: fixture.companyId,
      fiscalYear: 2025,
      periodNumber: 7,
      periodType: 'monthly',
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.freshnessBeforeRefresh.status).toBe('missing');
    expect(result.data?.accountsTargeted).toBe(2);
    expect(result.data?.jobsQueued).toBe(2);
    expect(result.data?.jobs.map((job) => job.coaId)).toEqual(
      expect.arrayContaining([fixture.cashCoaId, fixture.revenueCoaId]),
    );
    expect(result.data?.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          coaId: fixture.cashCoaId,
          recalcFrom: '2025-07-10',
        }),
        expect.objectContaining({
          coaId: fixture.revenueCoaId,
          recalcFrom: '2025-07-10',
        }),
      ]),
    );
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledWith(
      'gl-balance',
      expect.objectContaining({
        companyId: fixture.companyId,
        coaId: fixture.cashCoaId,
        recalcFrom: '2025-07-10',
        recalcTo: undefined,
        triggeredBy: 'manual',
        type: 'gl-balance',
      }),
      expect.objectContaining({
        jobId: `gl-${fixture.companyId}-${fixture.cashCoaId}`,
        priority: 10,
      }),
    );
  });

  it('can force a full-period refresh including fresh zero-balance accounts', async () => {
    queueBroker.configure({ disableAll: false, logSkipped: false });
    vi.spyOn(balanceRecalcQueue, 'getJob').mockResolvedValue(undefined);
    const add = vi
      .spyOn(balanceRecalcQueue, 'add')
      .mockResolvedValue({ id: 'gl-refresh-job' } as any);

    const result = await refreshTrialBalance({
      companyId: fixture.companyId,
      fiscalYear: 2025,
      periodNumber: 8,
      periodType: 'monthly',
      includeFreshAccounts: true,
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.accountsTargeted).toBe(4);
    expect(result.data?.jobsQueued).toBe(4);
    expect(result.data?.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          coaId: fixture.cashCoaId,
          recalcFrom: '2025-08-01',
        }),
        expect.objectContaining({
          coaId: fixture.zeroCoaId,
          recalcFrom: '2025-08-01',
        }),
      ]),
    );
    expect(add).toHaveBeenCalledTimes(4);
  });
});

async function createFixture(
  trx: Knex.Transaction,
): Promise<TrialBalanceFixture> {
  const [user] = await trx('users')
    .insert({
      firstname: 'Trial',
      lastname: 'Balance Tester',
      email: `trial-balance-${randomUUID()}@example.com`,
      user_type: 'regular',
    })
    .returning<{ id: string }[]>('id');
  if (!user) throw new Error('Failed to create trial balance test user');

  const usd = await trx('currencies')
    .where({ code: 'USD' })
    .select<{ id: string }[]>('id')
    .first();
  const country = await trx('countries')
    .where({ code: 'US' })
    .select<{ id: string }[]>('id')
    .first();
  if (!usd || !country) {
    throw new Error('Required currency or country bootstrap rows not found');
  }

  const [company] = await trx('companies')
    .insert({
      legal_name: 'Trial Balance Test Company',
      short_code: `tbal-${randomUUID().slice(0, 8)}`,
      type: 'business',
      year_end_day: 31,
      year_end_month: 12,
      accounting_basis: 'modified_accrual_basis',
      country_id: country.id,
      reporting_currency_id: usd.id,
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!company) throw new Error('Failed to create trial balance test company');

  await fiscalCalendarService.generateCompanyFiscalCalendar({
    companyId: company.id,
    options: {
      yearsBack: 2,
      yearsForward: 10,
      periodTypes: ['monthly', 'quarterly', 'yearly'],
    },
    trx,
  });

  const accountTypes = await getAccountTypeIds(trx, [
    'ca_bank',
    'rev_revenue',
    'exp_opex_office_supplies',
  ]);

  const [cashCoa] = await trx('coa')
    .insert({
      company_id: company.id,
      account_type_id: accountTypes.ca_bank,
      currency_id: usd.id,
      name: 'Operating Cash',
      code: '1000',
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  const [revenueCoa] = await trx('coa')
    .insert({
      company_id: company.id,
      account_type_id: accountTypes.rev_revenue,
      currency_id: usd.id,
      name: 'Product Revenue',
      code: '4000',
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  const [expenseCoa] = await trx('coa')
    .insert({
      company_id: company.id,
      account_type_id: accountTypes.exp_opex_office_supplies,
      currency_id: usd.id,
      name: 'Office Supplies',
      code: '6100',
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  const [zeroCoa] = await trx('coa')
    .insert({
      company_id: company.id,
      account_type_id: accountTypes.exp_opex_office_supplies,
      currency_id: usd.id,
      name: 'Travel',
      code: '6200',
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');

  if (!cashCoa || !revenueCoa || !expenseCoa || !zeroCoa) {
    throw new Error('Failed to create trial balance test COAs');
  }

  return {
    companyId: company.id,
    userId: user.id,
    usdCurrencyId: usd.id,
    cashCoaId: cashCoa.id,
    revenueCoaId: revenueCoa.id,
    expenseCoaId: expenseCoa.id,
    zeroCoaId: zeroCoa.id,
  };
}

async function getAccountTypeIds(
  trx: Knex.Transaction,
  keys: string[],
): Promise<Record<string, string>> {
  const rows = await trx('account_types')
    .whereIn('key', keys)
    .select('id', 'key');
  const idsByKey = Object.fromEntries(
    rows.map((row: { id: string; key: string }) => [row.key, row.id]),
  );

  for (const key of keys) {
    if (!idsByKey[key]) {
      throw new Error(`Required account type bootstrap row not found: ${key}`);
    }
  }

  return idsByKey;
}

async function postJournal({
  trx,
  fixture,
  date,
  entries,
}: {
  trx: Knex.Transaction;
  fixture: TrialBalanceFixture;
  date: string;
  entries: Array<{ coaId: string; amount: number; description: string }>;
}): Promise<string> {
  const result = await createLedgerRecord({
    data: buildManualJournal({ fixture, date, entries }),
    companyId: fixture.companyId,
    userId: fixture.userId,
    trx,
  });

  expect(result.success).toBe(true);
  expect(result.data?.ledgerTransactionId).toBeTruthy();
  return result.data!.ledgerTransactionId;
}

function buildManualJournal({
  fixture,
  date,
  entries,
}: {
  fixture: TrialBalanceFixture;
  date: string;
  entries: Array<{ coaId: string; amount: number; description: string }>;
}): NewLedgerTransactionData {
  return {
    transaction_date: date,
    transaction_source: 'manual_journal',
    source_transaction_id: randomUUID(),
    categorization_source: 'manual',
    source_transaction_currency_id: fixture.usdCurrencyId,
    description: entries[0]?.description ?? 'Trial balance fixture journal',
    transactions: entries.map((entry) => ({
      fs_date: date,
      coa_id: entry.coaId,
      source_currency_id: fixture.usdCurrencyId,
      source_amount: entry.amount,
      description: entry.description,
    })),
  };
}

async function recalculateAccounts({
  trx,
  fixture,
  coaIds,
  from,
  to,
}: {
  trx: Knex.Transaction;
  fixture: TrialBalanceFixture;
  coaIds: string[];
  from: string;
  to: string;
}): Promise<void> {
  for (const coaId of coaIds) {
    await glBalanceService.recalculateBalance(
      {
        companyId: fixture.companyId,
        coaId,
        recalcFrom: from,
        recalcTo: to,
        triggeredBy: 'manual',
      },
      trx,
    );
  }
}
