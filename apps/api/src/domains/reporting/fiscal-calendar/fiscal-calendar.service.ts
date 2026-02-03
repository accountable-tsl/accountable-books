import type { Knex } from 'knex';
import { addMonths, format, isAfter, isBefore, subMonths } from 'date-fns';
import pino from 'pino';

import { knexClient as db } from '../../../db/knexClient.js';
import {
  addDaysToYMD,
  addMonthsToYMD,
  isValidYMD,
  toDate,
  toYMD,
} from '../../../shared/utils/date.utils.js';
import { getCompanyUUID } from '../../../shared/utils/random.utils.js';
import { fiscalPeriodType } from './fiscal-calendar.types.js';

import type {
  ExtendResult,
  FiscalCalendar,
  FiscalCalendarStatus,
  FiscalPeriodResponse,
  FiscalPeriodType,
  FiscalPeriodValidation,
  FiscalPeriodYMD,
  NewFiscalCalendar,
} from './fiscal-calendar.types.js';

const logger = pino();

/**
 * Calculate fiscal year and period for a given date based on company's year-end
 *
 * @example
 * // Company with Dec 31 year-end:
 * // Jan 15, 2024 → FY2024, Period 1 (Jan)
 *
 * // Company with Apr 30 year-end:
 * // May 15, 2024 → FY2025, Period 1 (May 1-31)
 * // Apr 15, 2024 → FY2024, Period 12 (Apr 1-30)
 */
function calculateFiscalPeriod({
  date,
  yearEndMonth,
  yearEndDay,
  periodType,
}: {
  date: Date;
  yearEndMonth: number;
  yearEndDay: number;
  periodType: 'monthly' | 'quarterly' | 'yearly';
}): {
  fiscalYear: number;
  periodNumber: number;
  startDate: Date;
  endDate: Date;
} {
  const calendarYear = date.getFullYear();

  // Determine fiscal year
  // If current date is AFTER the year-end date, we're in the next fiscal year
  const currentYearEnd = new Date(calendarYear, yearEndMonth - 1, yearEndDay);
  const fiscalYear = isAfter(date, currentYearEnd)
    ? calendarYear + 1
    : calendarYear;

  // Calculate fiscal period based on type
  if (periodType === 'yearly') {
    // Fiscal year start = day after previous year-end
    const fiscalYearStart = new Date(
      fiscalYear - 1,
      yearEndMonth - 1,
      yearEndDay + 1,
    );
    const fiscalYearEnd = new Date(fiscalYear, yearEndMonth - 1, yearEndDay);

    return {
      fiscalYear,
      periodNumber: 1,
      startDate: fiscalYearStart,
      endDate: fiscalYearEnd,
    };
  }

  // For monthly/quarterly: Calculate which period we're in
  // Fiscal month 1 starts the day after year-end
  const fiscalYearStart = new Date(
    fiscalYear - 1,
    yearEndMonth - 1,
    yearEndDay + 1,
  );

  // Calculate months since fiscal year start
  let monthsSinceFiscalStart = 0;
  let currentPeriodStart = new Date(fiscalYearStart);

  while (isBefore(currentPeriodStart, date)) {
    const nextMonth = addMonths(currentPeriodStart, 1);
    if (
      isBefore(date, nextMonth) ||
      date.getTime() === currentPeriodStart.getTime()
    ) {
      break;
    }
    monthsSinceFiscalStart++;
    currentPeriodStart = nextMonth;
  }

  if (periodType === 'monthly') {
    const periodNumber = (monthsSinceFiscalStart % 12) + 1;
    const startDate = addMonths(fiscalYearStart, monthsSinceFiscalStart);
    const endDate = subMonths(addMonths(startDate, 1), 1); // End of month

    return {
      fiscalYear,
      periodNumber,
      startDate,
      endDate: new Date(
        endDate.getFullYear(),
        endDate.getMonth() + 1,
        0, // Last day of month
      ),
    };
  } else {
    // Quarterly
    const periodNumber = Math.floor(monthsSinceFiscalStart / 3) + 1;
    const quarterStartMonth = Math.floor(monthsSinceFiscalStart / 3) * 3;
    const startDate = addMonths(fiscalYearStart, quarterStartMonth);
    const endDate = subMonths(addMonths(startDate, 3), 1); // End of 3rd month

    return {
      fiscalYear,
      periodNumber,
      startDate,
      endDate: new Date(
        endDate.getFullYear(),
        endDate.getMonth() + 1,
        0, // Last day of month
      ),
    };
  }
}

/**
 * Get fiscal period for a given date
 */
export async function getFiscalPeriodForDate({
  companyId,
  date,
  periodType = 'monthly',
  trx,
}: {
  companyId: string;
  date: Date | string;
  periodType?: 'monthly' | 'quarterly' | 'yearly';
  trx?: Knex.Transaction;
}): Promise<FiscalCalendar | null> {
  const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');

  const period = await (trx || db)('fiscal_calendar')
    .where({
      company_id: companyId,
      period_type: periodType,
    })
    .where('start_date', '<=', dateStr)
    .where('end_date', '>=', dateStr)
    .first();

  return period || null;
}

/**
 * Ensure fiscal period exists for a given date, creating if necessary
 * Uses company's year_end_month and year_end_day to calculate fiscal periods
 */
export async function ensureFiscalPeriodExists(
  companyId: string,
  date: Date | string,
  periodType: FiscalPeriodType = 'monthly',
  trx?: Knex.Transaction,
): Promise<FiscalCalendar> {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // Get company's fiscal year settings
  const company = await (trx || db)('companies')
    .select('year_end_month', 'year_end_day')
    .where('id', companyId)
    .first();

  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  // Calculate fiscal year and period based on company's year-end
  const { fiscalYear, periodNumber, startDate, endDate } =
    calculateFiscalPeriod({
      date: dateObj,
      yearEndMonth: company.year_end_month,
      yearEndDay: company.year_end_day,
      periodType,
    });

  // Check if period already exists
  const existing = await (trx || db)('fiscal_calendar')
    .where({
      company_id: companyId,
      fiscal_year: fiscalYear,
      period_number: periodNumber,
      period_type: periodType,
    })
    .first();

  if (existing) {
    return existing;
  }

  // Create new period with fiscal dates
  const newPeriod: NewFiscalCalendar = {
    company_id: companyId,
    fiscal_year: fiscalYear,
    period_number: periodNumber,
    period_type: periodType,
    start_date: format(startDate, 'yyyy-MM-dd'),
    end_date: format(endDate, 'yyyy-MM-dd'),
    status: 'open',
  };

  const [created] = await (trx || db)('fiscal_calendar')
    .insert(newPeriod)
    .returning('*');

  logger.info(
    {
      companyId,
      fiscalYear,
      periodNumber,
      periodType,
      yearEndMonth: company.year_end_month,
      yearEndDay: company.year_end_day,
    },
    `Created fiscal period for company ${companyId}: FY${fiscalYear}-P${periodNumber} (${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')})`,
  );

  return created;
}

/**
 * Close a fiscal period
 */
export async function closeFiscalPeriod(
  companyId: string,
  fiscalYear: number,
  periodNumber: number,
  userId: string,
  periodType: 'monthly' = 'monthly',
): Promise<{ success: boolean; message: string; warnings?: string[] }> {
  return await db.transaction(async (trx) => {
    // Get the period
    const period = await trx('fiscal_calendar')
      .where({
        company_id: companyId,
        fiscal_year: fiscalYear,
        period_number: periodNumber,
        period_type: periodType,
      })
      .first();

    if (!period) {
      return {
        success: false,
        message: `Fiscal period not found: ${fiscalYear}-${periodNumber}`,
      };
    }

    if (period.status === 'closed') {
      return {
        success: false,
        message: `Period ${fiscalYear}-${periodNumber} is already closed`,
      };
    }

    // Validate period can be closed
    const validation = await validatePeriodClose(companyId, period, trx);
    if (!validation.passed) {
      return {
        success: false,
        message: `Cannot close period: ${validation.errors.join(', ')}`,
        warnings: validation.warnings,
      };
    }

    // Close the period
    await trx('fiscal_calendar')
      .where({
        company_id: companyId,
        fiscal_year: fiscalYear,
        period_number: periodNumber,
        period_type: periodType,
      })
      .update({
        status: 'closed',
        closed_at: new Date(),
        closed_by_id: userId,
        updated_at: new Date(),
      });

    logger.info(
      {
        companyId,
        fiscalYear,
        periodNumber,
        periodType,
        closedBy: userId,
      },
      `Closed fiscal period for company ${companyId}: ${fiscalYear}-${periodNumber}`,
    );

    return {
      success: true,
      message: `Period ${fiscalYear}-${periodNumber} closed successfully`,
      warnings: validation.warnings,
    };
  });
}

/**
 * Validate that a period can be closed
 */
async function validatePeriodClose(
  companyId: string,
  period: FiscalCalendar,
  trx: Knex.Transaction,
): Promise<FiscalPeriodValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hasLedgerEntry = trx('ledger_transaction')
    .whereRaw('ledger_transaction.source_transaction_id = bt.id')
    .where('ledger_transaction.source', 'bank_transaction')
    .where('ledger_transaction.is_deleted', false)
    .limit(1);

  // Check for pending transactions in the period
  const pendingTransactions = await trx('bank_transactions as bt')
    .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
    .where({
      'ba.company_id': companyId,
    })
    .whereBetween('bt.txn_at', [period.start_date, period.end_date])
    .where('bt.is_deleted', false)
    // .where('bt.categorization_status', 'uncategorized')
    .whereNotExists(hasLedgerEntry)
    .count('* as count')
    .first();

  if (
    pendingTransactions &&
    parseInt(pendingTransactions.count as string) > 0
  ) {
    warnings.push(
      `${pendingTransactions.count} uncategorized transactions found`,
    );
  }

  // Check for unposted journal entries
  const unpostedEntries = await trx('journal_entries')
    .join(
      'journal_batches',
      'journal_entries.journal_batch_id',
      'journal_batches.id',
    )
    .where('journal_batches.company_id', companyId)
    .whereBetween('journal_batches.date', [period.start_date, period.end_date])
    .where('journal_batches.status', 'draft')
    .count('* as count')
    .first();

  if (unpostedEntries && parseInt(unpostedEntries.count as string) > 0) {
    errors.push(`${unpostedEntries.count} unposted journal entries found`);
  }

  // Check if later periods are already closed
  const laterPeriods = await trx('fiscal_calendar')
    .where({
      company_id: companyId,
      period_type: period.period_type,
    })
    .where('fiscal_year', '>', period.fiscal_year)
    .orWhere(function () {
      this.where('fiscal_year', period.fiscal_year).where(
        'period_number',
        '>',
        period.period_number,
      );
    })
    .where('status', 'closed')
    .count('* as count')
    .first();

  if (laterPeriods && parseInt(laterPeriods.count as string) > 0) {
    warnings.push('Later periods are already closed');
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Reopen a fiscal period
 */
export async function reopenFiscalPeriod(
  companyId: string,
  fiscalYear: number,
  periodNumber: number,
  userId: string,
  reason: string,
  periodType: 'monthly' = 'monthly',
): Promise<{ success: boolean; message: string }> {
  return await db.transaction(async (trx) => {
    // Get the period
    const period = await trx('fiscal_calendar')
      .where({
        company_id: companyId,
        fiscal_year: fiscalYear,
        period_number: periodNumber,
        period_type: periodType,
      })
      .first();

    if (!period) {
      return {
        success: false,
        message: `Fiscal period not found: ${fiscalYear}-${periodNumber}`,
      };
    }

    if (period.status !== 'closed') {
      return {
        success: false,
        message: `Period ${fiscalYear}-${periodNumber} is not closed`,
      };
    }

    // Reopen the period
    await trx('fiscal_calendar')
      .where({
        company_id: companyId,
        fiscal_year: fiscalYear,
        period_number: periodNumber,
        period_type: periodType,
      })
      .update({
        status: 'open',
        closed_at: null,
        closed_by_id: null,
        updated_at: new Date(),
      });

    logger.info(
      {
        companyId,
        fiscalYear,
        periodNumber,
        periodType,
        reopenedBy: userId,
        reason,
      },
      `Reopened fiscal period for company ${companyId}: ${fiscalYear}-${periodNumber}`,
    );

    return {
      success: true,
      message: `Period ${fiscalYear}-${periodNumber} reopened successfully`,
    };
  });
}

/**
 * Get fiscal periods for a company
 */
export async function getFiscalPeriods(
  companyId: string,
  fiscalYear?: number,
  periodType: 'monthly' | 'quarterly' | 'yearly' = 'monthly',
  trx?: Knex.Transaction,
): Promise<FiscalPeriodResponse[]> {
  let query = (trx || db)('fiscal_calendar').where({
    company_id: companyId,
    period_type: periodType,
  });

  if (fiscalYear) {
    query = query.where('fiscal_year', fiscalYear);
  }

  const periods = await query
    .orderBy('fiscal_year', 'asc')
    .orderBy('period_number', 'asc');

  return periods.map((period) => ({
    companyId: period.company_id,
    fiscalYear: period.fiscal_year,
    periodNumber: period.period_number,
    periodType: period.period_type,
    startDate: period.start_date,
    endDate: period.end_date,
    status: period.status,
    closedAt: period.closed_at ? period.closed_at.toISOString() : undefined,
    closedById: period.closed_by_id,
  }));
}

class FiscalCalendarService {
  readonly PERIOD_TYPES: FiscalPeriodType[] = [
    'monthly',
    'quarterly',
    'yearly',
  ];

  readonly ALLOWED_TYPES_SET = new Set<FiscalPeriodType>(this.PERIOD_TYPES);

  private normalizePeriodTypes(types?: FiscalPeriodType[]): FiscalPeriodType[] {
    const arr = (types && types.length ? types : this.PERIOD_TYPES).filter(
      (t) => this.ALLOWED_TYPES_SET.has(t),
    );
    return Array.from(new Set(arr)).sort(
      (a, b) => this.PERIOD_TYPES.indexOf(a) - this.PERIOD_TYPES.indexOf(b),
    );
  }

  async generateCompanyFiscalCalendar({
    companyId,
    options,
    trx,
  }: {
    companyId: string;
    options?: Partial<{
      yearsBack: number;
      yearsForward: number;
      periodTypes: FiscalPeriodType[];
      status?: FiscalCalendarStatus;
    }>;
    trx?: Knex.Transaction;
  }): Promise<{ created: number; skipped: number }> {
    const {
      yearsBack = 2,
      yearsForward = 10,
      periodTypes,
      status = 'open',
    } = options ?? {};

    if (yearsBack < 0 || yearsBack > 20) {
      throw new Error('yearsBack must be 0–20');
    }
    if (yearsForward < 1 || yearsForward > 50) {
      throw new Error('yearsForward must be 1–50');
    }

    const types = this.normalizePeriodTypes(periodTypes);

    const exec = async (txn: Knex.Transaction) => {
      const {
        yearEndMonth,
        yearEndDay,
        id: companyUUID,
      } = await this.getCompanyContext(companyId, txn);

      const todayYMD = toYMD(new Date());
      const { fiscalYear: currentFY } = this.calculateFiscalPeriodYMD({
        ymd: todayYMD,
        yearEndMonth,
        yearEndDay,
        periodType: 'yearly',
      });

      const startFY = currentFY - yearsBack;
      const endFY = currentFY + yearsForward;

      let totalCreated = 0;

      for (const type of types) {
        const batchSize = 100;
        let rows: NewFiscalCalendar[] = [];

        for (let fy = startFY; fy <= endFY; fy++) {
          const { startYMD: fyStart, endYMD: fyEnd } = this.fiscalYearBounds({
            fiscalYear: fy,
            yearEndMonth,
            yearEndDay,
          });

          // Walk this fiscal year by periods of the selected type
          let cursor = fyStart;
          while (cursor <= fyEnd) {
            const p = this.calculateFiscalPeriodYMD({
              ymd: cursor,
              yearEndMonth,
              yearEndDay,
              periodType: type,
            });

            rows.push({
              company_id: companyUUID,
              fiscal_year: p.fiscalYear,
              period_number: p.periodNumber,
              period_type: type,
              start_date: p.startYMD,
              end_date: p.endYMD,
              status,
            });

            // Flush in batches to keep memory bounded
            if (rows.length >= batchSize) {
              const res = await txn('fiscal_calendar')
                .insert(rows)
                .onConflict([
                  'company_id',
                  'fiscal_year',
                  'period_number',
                  'period_type',
                ])
                .ignore()
                .returning('company_id');
              totalCreated += res.length;
              rows = []; // Reset rows for the next batch
            }

            // Next period begins the day after the current period's end
            cursor = addDaysToYMD(p.endYMD, 1);
          }
        }

        // Flush any remaining rows
        if (rows.length > 0) {
          const res = await txn('fiscal_calendar')
            .insert(rows)
            .onConflict([
              'company_id',
              'fiscal_year',
              'period_number',
              'period_type',
            ])
            .ignore()
            .returning('company_id');
          totalCreated += res.length;
        }
      }

      return { created: totalCreated, skipped: 0 };
    };

    if (trx) {
      return await exec(trx);
    } else {
      return await db.transaction(exec);
    }
  }

  /**
   * Ensure company has at least N months of future fiscal periods
   * Extends coverage if needed
   *
   * @param companyId - Company UUID
   * @param minFutureMonths - Minimum months of future coverage (default: 24)
   * @param trx - Optional transaction
   */
  async ensureFutureCoverage({
    companyId,
    minFutureMonths = 24,
    trx,
  }: {
    companyId: string;
    minFutureMonths?: number;
    trx?: Knex.Transaction;
  }): Promise<ExtendResult> {
    if (minFutureMonths < 1 || minFutureMonths > 120) {
      throw new Error('minFutureMonths must be between 1 and 120');
    }

    const exec = async (txn: Knex.Transaction): Promise<ExtendResult> => {
      const {
        id: companyUUID,
        yearEndDay,
        yearEndMonth,
      } = await this.getCompanyContext(companyId, txn);

      const todayYMD = toYMD(new Date());

      function endOfContainingMonth(ymd: string): string {
        const dt = toDate(ymd, 'start');
        const end = new Date(
          Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0),
        );
        return toYMD(end);
      }

      const maxYMD = (a: string | null, b: string) => (a ? (a > b ? a : b) : b);

      // Horizon aligns to end of the month, then each type maps that to its own end
      const horizonEndDate = endOfContainingMonth(
        addMonthsToYMD(todayYMD, minFutureMonths),
      );

      let periodsAdded = 0;
      let coverageEnd: string | null = null;
      const types = this.normalizePeriodTypes(this.PERIOD_TYPES);

      for (const type of types) {
        const last = await txn('fiscal_calendar')
          .where({
            company_id: companyUUID,
            period_type: type,
          })
          .max<{ max: string }[]>('end_date as max');

        const lastEnd = last[0]?.max || null;

        // Start generating from tomorrow or day after last end, whichever is later
        const start = lastEnd ? addDaysToYMD(lastEnd, 1) : todayYMD;
        const startBound = start > todayYMD ? start : todayYMD;

        // Compute the end bound as the end of the period that contains the horizon for this type
        const endPeriod = this.calculateFiscalPeriodYMD({
          ymd: horizonEndDate,
          yearEndMonth,
          yearEndDay,
          periodType: type,
        });
        const endBound = endPeriod.endYMD;

        if (startBound > endBound) {
          // already covered
          coverageEnd = maxYMD(coverageEnd, endBound);
          continue;
        }

        // Walk periods from startBound to endBound
        const rows: NewFiscalCalendar[] = [];
        let cursor = startBound;

        while (cursor <= endBound) {
          const p = this.calculateFiscalPeriodYMD({
            ymd: cursor,
            yearEndDay,
            yearEndMonth,
            periodType: type,
          });

          rows.push({
            company_id: companyUUID,
            fiscal_year: p.fiscalYear,
            period_number: p.periodNumber,
            period_type: type,
            start_date: p.startYMD,
            end_date: p.endYMD,
            status: 'open',
          });

          cursor = addDaysToYMD(p.endYMD, 1);
        }

        if (rows.length) {
          const inserted = await this.createFiscalCalendarRecords({
            data: rows,
            trx: txn,
          });

          periodsAdded += inserted.length;
        }
        coverageEnd = maxYMD(coverageEnd, endBound);
      }

      return {
        extended: periodsAdded > 0,
        periodsAdded,
        newCoverageEndDate: coverageEnd,
      };
    };

    if (trx) {
      return await exec(trx);
    } else {
      return db.transaction(exec);
    }
  }

  /**
   *  Fill gaps in fiscal calendar coverage for a specific date range
   * Idempotent - safe to run multiple times
   * @param companyId - Company UUID
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @param periodTypes - Period types to fill (default: all three)
   * @param trx - Optional transaction
   *
   */
  async fillCoverageGaps(p: {
    companyId: string;
    startDate: string;
    endDate: string;
    periodTypes?: FiscalPeriodType[];
    trx?: Knex.Transaction;
  }): Promise<{
    periodsFilled: number;
    dateRange: { start: string; end: string };
  }> {
    const {
      companyId,
      startDate,
      endDate,
      periodTypes = this.PERIOD_TYPES,
      trx,
    } = p;

    if (!isValidYMD(startDate) || !isValidYMD(endDate) || startDate > endDate) {
      throw new Error(
        `fillCoverageGaps: invalid range ${startDate}..${endDate}`,
      );
    }

    const {
      id: companyUUID,
      yearEndMonth,
      yearEndDay,
    } = await this.getCompanyContext(companyId, trx);

    const types = this.normalizePeriodTypes(periodTypes);

    let periodsFilled = 0;
    for (const type of types) {
      const startPeriod = this.calculateFiscalPeriodYMD({
        ymd: startDate,
        yearEndMonth,
        yearEndDay,
        periodType: type,
      });

      const endPeriod = this.calculateFiscalPeriodYMD({
        ymd: endDate,
        yearEndMonth,
        yearEndDay,
        periodType: type,
      });

      // Sanity check: reject unreasonably large ranges
      const fiscalYearSpan = endPeriod.fiscalYear - startPeriod.fiscalYear + 1;
      const MAX_FISCAL_YEARS = 20; // Reasonable limit

      if (fiscalYearSpan > MAX_FISCAL_YEARS) {
        throw new Error(
          `fillCoverageGaps: Range too large (${fiscalYearSpan} fiscal years). ` +
            `Maximum allowed: ${MAX_FISCAL_YEARS} years. ` +
            `Range: ${startDate} to ${endDate}`,
        );
      }

      const rows: NewFiscalCalendar[] = [];

      let cursor = startDate;

      // Walk periods covering [startDate..endDate]
      while (cursor <= endDate) {
        const p = this.calculateFiscalPeriodYMD({
          ymd: cursor,
          yearEndMonth,
          yearEndDay,
          periodType: type,
        });
        rows.push({
          company_id: companyUUID,
          fiscal_year: p.fiscalYear,
          period_number: p.periodNumber,
          period_type: type,
          start_date: p.startYMD,
          end_date: p.endYMD,
          status: 'open',
        });

        cursor = addDaysToYMD(p.endYMD, 1);
      }

      const i = await this.createFiscalCalendarRecords({
        data: rows,
        trx,
      });

      periodsFilled += i.length;
    }

    return { periodsFilled, dateRange: { start: startDate, end: endDate } };
  }

  private async getCompanyContext(
    companyId: string,
    trx?: Knex.Transaction,
  ): Promise<{ yearEndMonth: number; yearEndDay: number; id: string }> {
    const knex = trx ?? db;
    const company = await knex('companies')
      .select('year_end_month', 'year_end_day', 'id')
      .where((b) => b.where('id', companyId).orWhere('short_code', companyId))
      .first<{ year_end_month: number; year_end_day: number; id: string }>();

    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    const yearEndMonth = company.year_end_month;
    const yearEndDay = company.year_end_day;

    if (!yearEndMonth || !yearEndDay) {
      throw new Error('Company year end month and day not found');
    }
    return {
      yearEndMonth,
      yearEndDay,
      id: company.id,
    };
  }

  /**
   * Given a date in YYYY-MM-DD format, company's fiscal year-end (month/day), and period type,
   * It computes and return the which fiscal year that date belongs to, which period number within that fiscal year and the inclusive start/end dates of that period
   *
   * @param ymd - Date in YYYY-MM-DD format
   * @param yearEndMonth - Month of the year-end
   * @param yearEndDay - Day of the year-end
   * @param periodType - Type of period to calculate the fiscal year range for
   * @returns { startFiscalYear: number, endFiscalYear: number }
   *
   * Edge cases to address:
   * - Non-existent “year-end” days (e.g., Feb-29 on non-leap years)
   * - Months have different lengths (30 vs 31 vs 28/29); adding months can “overflow.”
   * - Inclusive period ends (we want period_span like [start,end] with no off-by-one)
   */
  calculateFiscalPeriodYMD({
    ymd,
    yearEndMonth,
    yearEndDay,
    periodType,
  }: {
    ymd: string;
    yearEndMonth: number;
    yearEndDay: number;
    periodType: FiscalPeriodType;
  }): FiscalPeriodYMD {
    if (!isValidYMD(ymd)) {
      throw new Error(`Invalid ymd: ${ymd}`);
    }

    if (yearEndMonth < 1 || yearEndMonth > 12) {
      throw new Error(`Invalid yearEndMonth: ${yearEndMonth}`);
    }

    if (yearEndDay < 1 || yearEndDay > 31) {
      throw new Error(`Invalid yearEndDay: ${yearEndDay}`);
    }

    if (
      periodType !== 'yearly' &&
      periodType !== 'monthly' &&
      periodType !== 'quarterly'
    ) {
      throw new Error(`Invalid periodType: ${periodType}`);
    }

    const date = toDate(ymd, 'start'); // start of day
    const calendarYear = date.getUTCFullYear();

    const currentYearEndYMD = this.getValidYearEndYMD({
      year: calendarYear,
      yearEndMonth,
      yearEndDay,
    });

    // If date is after this calendar year's fiscal year-end,
    // it belongs to next fiscal year
    const fiscalYear =
      ymd > currentYearEndYMD ? calendarYear + 1 : calendarYear;

    const fiscalYearEndYMD = this.getValidYearEndYMD({
      year: fiscalYear,
      yearEndMonth,
      yearEndDay,
    });
    const previousYearEndYMD = this.getValidYearEndYMD({
      year: fiscalYear - 1,
      yearEndMonth,
      yearEndDay,
    });
    const fiscalYearStartYMD = addDaysToYMD(previousYearEndYMD, 1);

    if (periodType === 'yearly') {
      return {
        fiscalYear,
        periodNumber: 1,
        startYMD: fiscalYearStartYMD,
        endYMD: fiscalYearEndYMD,
      };
    }

    if (periodType === 'monthly') {
      // Find which month of the fiscal year contains our date
      for (let month = 0; month < 12; month++) {
        const periodStart = addMonthsToYMD(fiscalYearStartYMD, month);
        const periodEnd = addDaysToYMD(addMonthsToYMD(periodStart, 1), -1);

        if (ymd >= periodStart && ymd <= periodEnd) {
          return {
            fiscalYear,
            periodNumber: month + 1,
            startYMD: periodStart,
            endYMD: periodEnd,
          };
        }
      }

      throw new Error(`Date ${ymd} outside fiscal year ${fiscalYear}`);
    }

    // Find which quarter contains our date
    for (let quarter = 0; quarter < 4; quarter++) {
      const periodStart = addMonthsToYMD(fiscalYearStartYMD, quarter * 3);
      const periodEnd = addDaysToYMD(addMonthsToYMD(periodStart, 3), -1);

      if (ymd >= periodStart && ymd <= periodEnd) {
        return {
          fiscalYear,
          periodNumber: quarter + 1,
          startYMD: periodStart,
          endYMD: periodEnd,
        };
      }
    }

    throw new Error(`Date ${ymd} outside fiscal year ${fiscalYear}`);
  }

  // Handles fiscal year-ends on invalid days (e.g., Feb 30)
  // Falls back to last valid day of the month
  private getValidYearEndYMD({
    year,
    yearEndMonth,
    yearEndDay,
  }: {
    year: number;
    yearEndMonth: number;
    yearEndDay: number;
  }): string {
    // Attempt exact fiscal year-end date
    const end = new Date(Date.UTC(year, yearEndMonth - 1, yearEndDay));

    // Month overflow means invalid day (e.g., Feb 30 became Mar 2)
    if (end.getUTCMonth() + 1 !== yearEndMonth) {
      const lastDayOfMonth = new Date(Date.UTC(year, yearEndMonth, 0));
      return toYMD(lastDayOfMonth);
    }

    return toYMD(end);
  }

  private fiscalYearBounds({
    fiscalYear,
    yearEndMonth,
    yearEndDay,
  }: {
    fiscalYear: number;
    yearEndMonth: number;
    yearEndDay: number;
  }): { startYMD: string; endYMD: string } {
    const endYMD = this.getValidYearEndYMD({
      year: fiscalYear,
      yearEndMonth,
      yearEndDay,
    });
    const prevEndYMD = this.getValidYearEndYMD({
      year: fiscalYear - 1,
      yearEndMonth,
      yearEndDay,
    });
    const startYMD = addDaysToYMD(prevEndYMD, 1);
    return { startYMD, endYMD };
  }

  async createFiscalCalendarRecords(p: {
    data: NewFiscalCalendar[];
    trx?: Knex.Transaction;
  }) {
    const { data, trx } = p;
    const knex = trx ?? db;

    const result = await knex('fiscal_calendar')
      .insert(data)
      .onConflict(['company_id', 'fiscal_year', 'period_number', 'period_type'])
      .ignore()
      .returning('company_id');

    return result;
  }
}

export const fiscalCalendarService = new FiscalCalendarService();

async function createFiscalCalendarRecords(p: {
  data: NewFiscalCalendar[];
  trx?: Knex.Transaction;
}) {
  const { data, trx } = p;
  const knex = trx ?? db;

  const result = await knex('fiscal_calendar')
    .insert(data)
    .onConflict(['company_id', 'fiscal_year', 'period_number', 'period_type'])
    .ignore()
    .returning('company_id');

  return result;
}

export async function getFiscalCalendar({
  companyId,
  startYMD,
  endYMD,
  periodTypes,
  statuses,
  trx,
}: {
  companyId: string;
  startYMD: string; // YYYY-MM-DD
  endYMD: string; // YYYY-MM-DD
  periodTypes?: FiscalPeriodType[];
  statuses?: FiscalCalendarStatus[];
  trx?: Knex.Transaction;
}): Promise<FiscalCalendar[]> {
  if (!isValidYMD(startYMD) || !isValidYMD(endYMD)) {
    throw new Error(
      'Invalid date format: use YYYY-MM-DD (real calendar dates only)',
    );
  }

  if (startYMD > endYMD) {
    throw new Error(`Invalid range: ${startYMD} > ${endYMD}`);
  }
  const companyUUID = await getCompanyUUID(companyId, trx);

  const knex = trx ?? db;
  const query = knex('fiscal_calendar')
    .select(
      'company_id',
      'fiscal_year',
      'period_number',
      'period_type',
      'start_date',
      'end_date',
      'status',
      'closed_at',
      'closed_by_id',
      'created_at',
      'updated_at',
      'metadata',
    )
    .where('company_id', companyUUID)
    .andWhereRaw("period_span && daterange(?::date, ?::date, '[]')", [
      startYMD,
      endYMD,
    ]);

  if (periodTypes?.length) {
    query.whereIn('period_type', periodTypes);
  }
  if (statuses?.length) {
    query.whereIn('status', statuses);
  }

  const periods = await query.orderBy([
    { column: 'period_type', order: 'asc' },
    { column: 'fiscal_year', order: 'asc' },
    { column: 'period_number', order: 'asc' },
  ]);

  return periods.map((period) => ({
    ...period,
    start_date: toYMD(period.start_date),
    end_date: toYMD(period.end_date),
  }));
}

/**
 * Ensures fiscal calendar coverage exists for the requested date range and returns
 * the relevant fiscal periods, while optionally enforcing that no posting occurs
 * into closed or locked monthly periods.
 *
 * This is the main safe entry point for any operation that needs to:
 * - Read fiscal periods (monthly, quarterly, yearly)
 * - Validate that posting is allowed (open periods only)
 * - Guarantee that the fiscal calendar is populated for the date range
 *
 * Behavior:
 * 1. Validates the date range (throws if invalid or backwards)
 * 2. Idempotently fills any missing fiscal periods for monthly, quarterly, and yearly
 *    (via `fillCoverageGaps` — this is a side-effect)
 * 3. If `requireMonthlyOpen = true`, checks that **no monthly period** in the range
 *    is closed or locked → throws descriptive error if any are
 * 4. Returns only the fiscal calendar rows for the requested `fetchTypes`
 *
 * Use this function instead of calling `getFiscalCalendar` directly when:
 * - You are about to post transactions / journal entries
 * - You want to ensure gaps are filled automatically
 * - You need to enforce accounting period locking rules
 *
 * @param {Object} params - Function parameters
 * @param {string} params.companyId - The company identifier
 * @param {string} params.startYMD - Start date in YYYY-MM-DD format (inclusive)
 * @param {string} params.endYMD - End date in YYYY-MM-DD format (inclusive)
 * @param {FiscalPeriodType[]} [params.fetchTypes=['monthly','quarterly','yearly']] - Which period granularities to return
 * @param {boolean} [params.requireMonthlyOpen=true] - If true, throws if any monthly period in range is closed/locked
 * @param {Knex.Transaction} [params.trx] - Optional Knex transaction to participate in
 *
 * @returns {Promise<{ rows: FiscalCalendar[] }>} Object containing the requested fiscal periods
 *
 * @throws {Error} If date range is invalid or backwards
 * @throws {Error} If `requireMonthlyOpen=true` and any month in range is closed or locked
 *                 (error message includes the specific blocked period)
 *
 * @example
 * // Before posting a January 2026 invoice
 * const { rows } = await ensureAndFetchFiscalCalendar({
 *   companyId: "co_abc123",
 *   startYMD: "2026-01-15",
 *   endYMD: "2026-01-15",
 *   fetchTypes: ["monthly"],
 *   requireMonthlyOpen: true,
 *   trx,
 * });
 *
 * // For a quarterly report (read-only, no need to check open status)
 * const { rows } = await ensureAndFetchFiscalCalendar({
 *   companyId: "co_abc123",
 *   startYMD: "2026-01-01",
 *   endYMD: "2026-12-31",
 *   fetchTypes: ["quarterly"],
 *   requireMonthlyOpen: false,
 * });
 */
export async function ensureAndFetchFiscalCalendar({
  companyId,
  startYMD,
  endYMD,
  fetchTypes = ['monthly', 'quarterly', 'yearly'],
  requireMonthlyOpen = true,
  trx,
}: {
  companyId: string;
  startYMD: string;
  endYMD: string;
  fetchTypes?: FiscalPeriodType[];
  requireMonthlyOpen?: boolean;
  trx?: Knex.Transaction;
}): Promise<{ rows: FiscalCalendar[] }> {
  if (!isValidYMD(startYMD) || !isValidYMD(endYMD) || startYMD > endYMD) {
    throw new Error(
      `ensureAndFetchFiscalCalendar: invalid range ${startYMD}..${endYMD}`,
    );
  }

  // Ensure coverage exists (idempotent)
  await fiscalCalendarService.fillCoverageGaps({
    companyId,
    startDate: startYMD,
    endDate: endYMD,
    periodTypes: ['monthly', 'quarterly', 'yearly'],
    trx,
  });

  // Enforce “no posting into closed/locked monthly periods” if requested
  if (requireMonthlyOpen) {
    const blocking = await getFiscalCalendar({
      companyId,
      startYMD,
      endYMD,
      periodTypes: ['monthly'],
      statuses: ['closed', 'locked'],
      trx,
    });
    if (blocking.length) {
      const first = blocking[0];
      throw new Error(
        `Cannot post into a closed/locked month: FY${first.fiscal_year}-P${first.period_number} (${first.start_date}..${first.end_date})`,
      );
    }
  }

  // Return whatever types the caller wants to use
  const rows = await getFiscalCalendar({
    companyId,
    startYMD,
    endYMD,
    periodTypes: fetchTypes,
    trx,
  });

  return { rows };
}

/**
 * Returns the fiscal period status for a specific date.
 *
 * Intended for UI hints like "this date is in a locked period" before attempting
 * to post journals/ledger transactions.
 *
 * This function is non-throwing with respect to period status (closed/locked):
 * it will return the status rather than raising, but it will still throw for
 * invalid inputs or missing company.
 */
export async function getPeriodStatusForDate({
  companyId,
  date,
  trx,
}: {
  companyId: string;
  date: string; // YYYY-MM-DD
  trx?: Knex.Transaction;
}): Promise<{
  status: FiscalCalendarStatus;
  periodInfo?: {
    periodType: FiscalPeriodType;
    fiscalYear: number;
    periodNumber: number;
    startDate: string;
    endDate: string;
  };
}> {
  const { rows } = await ensureAndFetchFiscalCalendar({
    companyId,
    startYMD: date,
    endYMD: date,
    fetchTypes: ['monthly'],
    requireMonthlyOpen: false,
    trx,
  });

  const monthly = rows.find((p) => p.period_type === 'monthly') ?? rows[0];
  if (!monthly) {
    throw new Error(`No fiscal period found for date ${date}`);
  }

  return {
    status: monthly.status,
    periodInfo: {
      periodType: monthly.period_type,
      fiscalYear: monthly.fiscal_year,
      periodNumber: monthly.period_number,
      startDate: monthly.start_date,
      endDate: monthly.end_date,
    },
  };
}
