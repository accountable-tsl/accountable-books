import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  closeFiscalPeriod,
  ensureAndFetchFiscalCalendar,
  fiscalCalendarService,
  lockFiscalPeriod,
  reopenFiscalPeriod,
} from './fiscal-calendar.service.js';

type FiscalCalendarFixture = {
  companyId: string;
  userId: string;
};

describe('FiscalCalendarService.calculateFiscalPeriodYMD', () => {
  it('calculates monthly periods for a calendar-year company', () => {
    expect(
      fiscalCalendarService.calculateFiscalPeriodYMD({
        ymd: '2024-01-15',
        yearEndMonth: 12,
        yearEndDay: 31,
        periodType: 'monthly',
      }),
    ).toEqual({
      fiscalYear: 2024,
      periodNumber: 1,
      startYMD: '2024-01-01',
      endYMD: '2024-01-31',
    });
  });

  it('calculates monthly periods across a non-calendar fiscal year', () => {
    expect(
      fiscalCalendarService.calculateFiscalPeriodYMD({
        ymd: '2024-05-15',
        yearEndMonth: 4,
        yearEndDay: 30,
        periodType: 'monthly',
      }),
    ).toEqual({
      fiscalYear: 2025,
      periodNumber: 1,
      startYMD: '2024-05-01',
      endYMD: '2024-05-31',
    });

    expect(
      fiscalCalendarService.calculateFiscalPeriodYMD({
        ymd: '2024-04-15',
        yearEndMonth: 4,
        yearEndDay: 30,
        periodType: 'monthly',
      }),
    ).toEqual({
      fiscalYear: 2024,
      periodNumber: 12,
      startYMD: '2024-04-01',
      endYMD: '2024-04-30',
    });
  });

  it('keeps generated monthly periods contiguous', () => {
    const first = fiscalCalendarService.calculateFiscalPeriodYMD({
      ymd: '2024-05-01',
      yearEndMonth: 4,
      yearEndDay: 30,
      periodType: 'monthly',
    });
    const second = fiscalCalendarService.calculateFiscalPeriodYMD({
      ymd: '2024-06-01',
      yearEndMonth: 4,
      yearEndDay: 30,
      periodType: 'monthly',
    });

    expect(first.endYMD).toBe('2024-05-31');
    expect(second.startYMD).toBe('2024-06-01');
  });

  it('handles leap-day fiscal year ends in non-leap years', () => {
    expect(
      fiscalCalendarService.calculateFiscalPeriodYMD({
        ymd: '2025-02-28',
        yearEndMonth: 2,
        yearEndDay: 29,
        periodType: 'yearly',
      }),
    ).toEqual({
      fiscalYear: 2025,
      periodNumber: 1,
      startYMD: '2024-03-01',
      endYMD: '2025-02-28',
    });

    expect(
      fiscalCalendarService.calculateFiscalPeriodYMD({
        ymd: '2025-03-01',
        yearEndMonth: 2,
        yearEndDay: 29,
        periodType: 'yearly',
      }),
    ).toEqual({
      fiscalYear: 2026,
      periodNumber: 1,
      startYMD: '2025-03-01',
      endYMD: '2026-02-28',
    });
  });
});

describe('fiscal period lifecycle', () => {
  let trx: Knex.Transaction;
  let fixture: FiscalCalendarFixture;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    fixture = await createFixture(trx);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await trx.rollback();
  });

  it('requires close before lock and treats locked periods as one-way in normal workflows', async () => {
    const period = await getMonthlyPeriodForDate({
      trx,
      companyId: fixture.companyId,
      date: '2025-01-15',
    });

    const openLock = await lockFiscalPeriod({
      companyId: fixture.companyId,
      userId: fixture.userId,
      fiscalYear: period.fiscal_year,
      periodNumber: period.period_number,
      trx,
    });
    expect(openLock.success).toBe(false);
    expect(openLock.message).toContain('must be closed before it can be locked');

    const close = await closeFiscalPeriod({
      companyId: fixture.companyId,
      userId: fixture.userId,
      fiscalYear: period.fiscal_year,
      periodNumber: period.period_number,
      trx,
    });
    expect(close.success).toBe(true);

    const lock = await lockFiscalPeriod({
      companyId: fixture.companyId,
      userId: fixture.userId,
      fiscalYear: period.fiscal_year,
      periodNumber: period.period_number,
      trx,
    });
    expect(lock.success).toBe(true);

    const reopen = await reopenFiscalPeriod({
      companyId: fixture.companyId,
      userId: fixture.userId,
      fiscalYear: period.fiscal_year,
      periodNumber: period.period_number,
      reason: 'Accidental lock',
      trx,
    });
    expect(reopen.success).toBe(false);
    expect(reopen.message).toContain('locked and cannot be reopened');

    const row = await trx('fiscal_calendar')
      .where({
        company_id: fixture.companyId,
        fiscal_year: period.fiscal_year,
        period_number: period.period_number,
        period_type: 'monthly',
      })
      .first();

    expect(row.status).toBe('locked');
    expect(row.closed_at).toBeInstanceOf(Date);
    expect(row.closed_by_id).toBe(fixture.userId);
    expect(row.locked_at).toBeInstanceOf(Date);
    expect(row.locked_by_id).toBe(fixture.userId);
  });

  it('does not fill fiscal calendar gaps when requested coverage already exists', async () => {
    const fillSpy = vi.spyOn(fiscalCalendarService, 'fillCoverageGaps');

    const { rows } = await ensureAndFetchFiscalCalendar({
      companyId: fixture.companyId,
      startYMD: '2025-01-15',
      endYMD: '2025-01-16',
      fetchTypes: ['monthly'],
      requireMonthlyOpen: false,
      trx,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].period_type).toBe('monthly');
    expect(fillSpy).not.toHaveBeenCalled();
  });
});

async function createFixture(
  trx: Knex.Transaction,
): Promise<FiscalCalendarFixture> {
  const [user] = await trx('users')
    .insert({
      firstname: 'Fiscal',
      lastname: 'Calendar Tester',
      email: `fiscal-calendar-${randomUUID()}@example.com`,
      user_type: 'regular',
    })
    .returning<{ id: string }[]>('id');
  if (!user) throw new Error('Failed to create fiscal calendar test user');

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
      legal_name: 'Fiscal Calendar Test Company',
      short_code: `fc-${randomUUID().slice(0, 8)}`,
      type: 'business',
      year_end_day: 31,
      year_end_month: 12,
      accounting_basis: 'modified_accrual_basis',
      country_id: country.id,
      reporting_currency_id: usd.id,
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!company) throw new Error('Failed to create fiscal calendar test company');

  await fiscalCalendarService.generateCompanyFiscalCalendar({
    companyId: company.id,
    options: {
      yearsBack: 2,
      yearsForward: 10,
      periodTypes: ['monthly', 'quarterly', 'yearly'],
    },
    trx,
  });

  return {
    companyId: company.id,
    userId: user.id,
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
}): Promise<{ fiscal_year: number; period_number: number }> {
  const period = await trx('fiscal_calendar')
    .select('fiscal_year', 'period_number')
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
