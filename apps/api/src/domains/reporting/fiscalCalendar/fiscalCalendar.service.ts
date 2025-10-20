import { knexClient as db } from '../../../db/knexClient.js';
import type { Knex } from 'knex';
import pino from 'pino';
import type {
  FiscalCalendar,
  NewFiscalCalendar,
  FiscalPeriodValidation,
  FiscalPeriodResponse,
} from './fiscalCalendar.types.js';
import { format, addMonths, subMonths, isBefore, isAfter } from 'date-fns';

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
function calculateFiscalPeriod(
  date: Date,
  yearEndMonth: number,
  yearEndDay: number,
  periodType: 'monthly' | 'quarterly' | 'yearly',
): {
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
export async function getFiscalPeriodForDate(
  companyId: string,
  date: Date | string,
  periodType: 'monthly' | 'quarterly' | 'yearly' = 'monthly',
  trx?: Knex.Transaction,
): Promise<FiscalCalendar | null> {
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
  periodType: 'monthly' = 'monthly',
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
    calculateFiscalPeriod(
      dateObj,
      company.year_end_month,
      company.year_end_day,
      periodType,
    );

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

  // Check for pending transactions in the period
  const pendingTransactions = await trx('bank_transactions as bt')
    .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
    .where({
      'ba.company_id': companyId,
    })
    .whereBetween('bt.txn_at', [period.start_date, period.end_date])
    .where('bt.is_deleted', false)
    .where('bt.categorization_status', 'uncategorized')
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
