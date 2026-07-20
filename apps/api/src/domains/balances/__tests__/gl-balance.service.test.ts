import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { createLedgerRecord } from '../../ledgers/index.js';
import {
  claimNextPendingIntent,
  markIntentProcessed,
  OUTBOX_INTENT,
} from '../../outbox/index.js';
import {
  closeFiscalPeriod,
  fiscalCalendarService,
  lockFiscalPeriod,
} from '../../reporting/fiscal-calendar/fiscal-calendar.service.js';
import { handleGlBalanceRecalcOutbox } from '../gl-balance.outbox.js';
import { glBalanceService } from '../gl-balance.service.js';

import type { NewLedgerTransactionData } from '../../ledgers/index.js';

type BalanceFixture = {
  companyId: string;
  userId: string;
  usdCurrencyId: string;
  cashCoaId: string;
  revenueCoaId: string;
};

type DailySnapshotRow = {
  day: string | Date;
  opening_balance: string | number;
  day_debits: string | number;
  day_credits: string | number;
  closing_balance: string | number;
  transaction_count: string | number;
};

type MonthlyPeriodRow = {
  id: string;
  fiscal_year: number;
  period_number: number;
};

describe('GL balance recalculation', () => {
  let trx: Knex.Transaction;
  let fixture: BalanceFixture;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    fixture = await createFixture(trx);
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('materializes daily, period, and current balances after a period is locked', async () => {
    await postCashMovement({
      trx,
      fixture,
      date: '2025-01-15',
      cashAmount: 1000,
      description: 'Customer receipt',
    });
    await postCashMovement({
      trx,
      fixture,
      date: '2025-01-16',
      cashAmount: -250,
      description: 'Receipt reversal',
    });

    const monthlyPeriod = await getMonthlyPeriodForDate({
      trx,
      companyId: fixture.companyId,
      date: '2025-01-15',
    });
    await closeThenLockFiscalPeriod({
      trx,
      companyId: fixture.companyId,
      userId: fixture.userId,
      fiscalYear: monthlyPeriod.fiscal_year,
      periodNumber: monthlyPeriod.period_number,
    });

    const result = await glBalanceService.recalculateBalance(
      {
        companyId: fixture.companyId,
        coaId: fixture.cashCoaId,
        recalcFrom: '2025-01-15',
        recalcTo: '2025-01-16',
        triggeredBy: 'manual',
      },
      trx,
    );

    expect(result).toMatchObject({
      daysProcessed: 2,
      snapshotsCreated: 2,
      finalBalance: 750,
      lastProcessedDate: '2025-01-16',
    });

    const dailyRows = await trx('gl_daily_balance_snapshots')
      .where({
        company_id: fixture.companyId,
        coa_id: fixture.cashCoaId,
      })
      .orderBy('day', 'asc');

    expect(dailyRows).toHaveLength(2);
    expect(snapshotView(dailyRows[0])).toEqual({
      day: '2025-01-15',
      openingBalance: 0,
      dayDebits: 1000,
      dayCredits: 0,
      closingBalance: 1000,
      transactionCount: 1,
    });
    expect(snapshotView(dailyRows[1])).toEqual({
      day: '2025-01-16',
      openingBalance: 1000,
      dayDebits: 0,
      dayCredits: 250,
      closingBalance: 750,
      transactionCount: 1,
    });
    expect(dailyRows.every((row) => row.calculated_at instanceof Date)).toBe(
      true,
    );

    const periodBalance = await trx('gl_period_balances')
      .where({
        company_id: fixture.companyId,
        coa_id: fixture.cashCoaId,
        fiscal_calendar_id: monthlyPeriod.id,
      })
      .first();

    expect(periodBalance).toBeTruthy();
    expect(numberValue(periodBalance.opening_balance)).toBe(0);
    expect(numberValue(periodBalance.period_debits)).toBe(1000);
    expect(numberValue(periodBalance.period_credits)).toBe(250);
    expect(numberValue(periodBalance.closing_balance)).toBe(750);
    expect(Number(periodBalance.transaction_count)).toBe(2);
    expect(periodBalance.calculated_at).toBeInstanceOf(Date);

    const currentBalance = await trx('gl_current_balances')
      .where({
        company_id: fixture.companyId,
        coa_id: fixture.cashCoaId,
      })
      .first();

    expect(currentBalance).toBeTruthy();
    expect(asYMD(currentBalance.as_of_date)).toBe('2025-01-16');
    expect(numberValue(currentBalance.reporting_currency_balance)).toBe(750);
    expect(currentBalance.calculated_at).toBeInstanceOf(Date);
  });

  it('post -> drain GL-recalc outbox intent -> balances materialized in the DB (no mocks)', async () => {
    // 1. Posting a journal writes a GL_BALANCE_RECALC_REQUESTED outbox row in
    //    the same transaction (the Phase 4 front door) — but no balances yet.
    await postCashMovement({
      trx,
      fixture,
      date: '2025-01-15',
      cashAmount: 1000,
      description: 'Customer receipt',
    });

    const balancesBefore = await trx('gl_daily_balance_snapshots').where({
      company_id: fixture.companyId,
      coa_id: fixture.cashCoaId,
    });
    expect(balancesBefore).toHaveLength(0);

    // 2. The post produced a pending recalc intent for the cash account. Claim
    //    it the way the dispatcher does.
    const scopeKey = `${OUTBOX_INTENT.GL_BALANCE_RECALC_REQUESTED}:${fixture.companyId}:${fixture.cashCoaId}`;
    const intent = await claimNextPendingIntent(trx, {
      intentType: OUTBOX_INTENT.GL_BALANCE_RECALC_REQUESTED,
      scopeKey,
    });
    expect(intent).not.toBeNull();
    expect(intent!.payload).toMatchObject({
      companyId: fixture.companyId,
      coaId: fixture.cashCoaId,
      recalcFrom: '2025-01-15',
      triggeredBy: 'ledger_entry',
    });

    // 3. Drain it through the REAL handler (no mock): this runs the actual
    //    recalc, then mark the intent processed.
    await handleGlBalanceRecalcOutbox(intent!.payload, trx);
    await markIntentProcessed(trx, intent!.id);

    // 4. Balances are now materialized in the DB.
    const daily = await trx('gl_daily_balance_snapshots')
      .where({
        company_id: fixture.companyId,
        coa_id: fixture.cashCoaId,
        day: '2025-01-15',
      })
      .first();
    expect(daily).toBeTruthy();
    expect(numberValue(daily.closing_balance)).toBe(1000);

    const current = await trx('gl_current_balances')
      .where({ company_id: fixture.companyId, coa_id: fixture.cashCoaId })
      .first();
    expect(current).toBeTruthy();
    expect(numberValue(current.reporting_currency_balance)).toBe(1000);

    const processed = await trx('app.outbox')
      .where({ id: intent!.id })
      .first('status');
    expect(processed?.status).toBe('processed');
  });

  it('does not move current balance backward during a bounded historical recalculation', async () => {
    await postCashMovement({
      trx,
      fixture,
      date: '2025-02-01',
      cashAmount: 100,
      description: 'Initial February receipt',
    });
    await postCashMovement({
      trx,
      fixture,
      date: '2025-02-10',
      cashAmount: 25,
      description: 'Later February receipt',
    });

    await glBalanceService.recalculateBalance(
      {
        companyId: fixture.companyId,
        coaId: fixture.cashCoaId,
        recalcFrom: '2025-02-01',
        recalcTo: '2025-02-10',
        triggeredBy: 'manual',
      },
      trx,
    );

    await glBalanceService.recalculateBalance(
      {
        companyId: fixture.companyId,
        coaId: fixture.cashCoaId,
        recalcFrom: '2025-02-01',
        recalcTo: '2025-02-01',
        triggeredBy: 'manual',
      },
      trx,
    );

    const currentBalance = await trx('gl_current_balances')
      .where({
        company_id: fixture.companyId,
        coa_id: fixture.cashCoaId,
      })
      .first();

    expect(currentBalance).toBeTruthy();
    expect(asYMD(currentBalance.as_of_date)).toBe('2025-02-10');
    expect(numberValue(currentBalance.reporting_currency_balance)).toBe(125);
  });

  it('does not rewrite unchanged daily snapshots during a redundant recalculation', async () => {
    await postCashMovement({
      trx,
      fixture,
      date: '2025-03-05',
      cashAmount: 175,
      description: 'March receipt',
    });

    await glBalanceService.recalculateBalance(
      {
        companyId: fixture.companyId,
        coaId: fixture.cashCoaId,
        recalcFrom: '2025-03-05',
        recalcTo: '2025-03-05',
        triggeredBy: 'manual',
      },
      trx,
    );

    const stableCalculatedAt = new Date('2025-03-06T00:00:00.000Z');
    await trx('gl_daily_balance_snapshots')
      .where({
        company_id: fixture.companyId,
        coa_id: fixture.cashCoaId,
        day: '2025-03-05',
      })
      .update({ calculated_at: stableCalculatedAt });

    await glBalanceService.recalculateBalance(
      {
        companyId: fixture.companyId,
        coaId: fixture.cashCoaId,
        recalcFrom: '2025-03-05',
        recalcTo: '2025-03-05',
        triggeredBy: 'manual',
      },
      trx,
    );

    const snapshot = await trx('gl_daily_balance_snapshots')
      .where({
        company_id: fixture.companyId,
        coa_id: fixture.cashCoaId,
        day: '2025-03-05',
      })
      .first();

    expect(snapshotView(snapshot)).toEqual({
      day: '2025-03-05',
      openingBalance: 0,
      dayDebits: 175,
      dayCredits: 0,
      closingBalance: 175,
      transactionCount: 1,
    });
    expect(snapshot.calculated_at).toEqual(stableCalculatedAt);
  });
});

async function createFixture(trx: Knex.Transaction): Promise<BalanceFixture> {
  const [user] = await trx('users')
    .insert({
      firstname: 'GL',
      lastname: 'Balance Tester',
      email: `gl-balance-${randomUUID()}@example.com`,
      user_type: 'regular',
    })
    .returning<{ id: string }[]>('id');
  if (!user) throw new Error('Failed to create GL balance test user');

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
      legal_name: 'GL Balance Test Company',
      short_code: `glbal-${randomUUID().slice(0, 8)}`,
      type: 'business',
      year_end_day: 31,
      year_end_month: 12,
      accounting_basis: 'modified_accrual_basis',
      country_id: country.id,
      reporting_currency_id: usd.id,
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!company) throw new Error('Failed to create GL balance test company');

  await fiscalCalendarService.generateCompanyFiscalCalendar({
    companyId: company.id,
    options: {
      yearsBack: 2,
      yearsForward: 10,
      periodTypes: ['monthly', 'quarterly', 'yearly'],
    },
    trx,
  });

  const accountTypes = await getAccountTypeIds(trx, ['ca_bank', 'rev_revenue']);

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
  if (!cashCoa || !revenueCoa) {
    throw new Error('Failed to create GL balance test COAs');
  }

  return {
    companyId: company.id,
    userId: user.id,
    usdCurrencyId: usd.id,
    cashCoaId: cashCoa.id,
    revenueCoaId: revenueCoa.id,
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

async function postCashMovement({
  trx,
  fixture,
  date,
  cashAmount,
  description,
}: {
  trx: Knex.Transaction;
  fixture: BalanceFixture;
  date: string;
  cashAmount: number;
  description: string;
}): Promise<void> {
  const result = await createLedgerRecord({
    data: buildManualJournal({
      fixture,
      date,
      cashAmount,
      description,
    }),
    companyId: fixture.companyId,
    userId: fixture.userId,
    trx,
  });

  expect(result.success).toBe(true);
}

function buildManualJournal({
  fixture,
  date,
  cashAmount,
  description,
}: {
  fixture: BalanceFixture;
  date: string;
  cashAmount: number;
  description: string;
}): NewLedgerTransactionData {
  return {
    transaction_date: date,
    transaction_source: 'manual_journal',
    source_transaction_id: randomUUID(),
    categorization_source: 'manual',
    source_transaction_currency_id: fixture.usdCurrencyId,
    description,
    transactions: [
      {
        fs_date: date,
        coa_id: fixture.cashCoaId,
        source_currency_id: fixture.usdCurrencyId,
        source_amount: cashAmount,
        description,
      },
      {
        fs_date: date,
        coa_id: fixture.revenueCoaId,
        source_currency_id: fixture.usdCurrencyId,
        source_amount: -cashAmount,
        description,
      },
    ],
  };
}

async function getMonthlyPeriodForDate({
  trx,
  companyId,
  date,
}: {
  trx: Knex.Transaction;
  companyId: string;
  date: string;
}): Promise<MonthlyPeriodRow> {
  const period = await trx('fiscal_calendar')
    .select('id', 'fiscal_year', 'period_number')
    .where({
      company_id: companyId,
      period_type: 'monthly',
    })
    .where('start_date', '<=', date)
    .where('end_date', '>=', date)
    .first();

  if (!period) {
    throw new Error(`Monthly fiscal period not found for ${date}`);
  }

  return period;
}

async function closeThenLockFiscalPeriod({
  trx,
  companyId,
  userId,
  fiscalYear,
  periodNumber,
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  fiscalYear: number;
  periodNumber: number;
}): Promise<void> {
  const close = await closeFiscalPeriod({
    companyId,
    fiscalYear,
    periodNumber,
    userId,
    trx,
  });
  expect(close.success).toBe(true);

  const lock = await lockFiscalPeriod({
    companyId,
    fiscalYear,
    periodNumber,
    userId,
    trx,
  });
  expect(lock.success).toBe(true);
}

function snapshotView(row: DailySnapshotRow) {
  return {
    day: asYMD(row.day),
    openingBalance: numberValue(row.opening_balance),
    dayDebits: numberValue(row.day_debits),
    dayCredits: numberValue(row.day_credits),
    closingBalance: numberValue(row.closing_balance),
    transactionCount: Number(row.transaction_count),
  };
}

function numberValue(value: string | number): number {
  return Number(value);
}

function asYMD(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value;
}
