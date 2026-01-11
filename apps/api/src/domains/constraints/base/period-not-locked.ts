import { getFiscalCalendar } from '../../reporting/fiscal-calendar/fiscal-calendar.service.js';

import type { FiscalCalendar } from '../../reporting/fiscal-calendar/fiscal-calendar.types.js';
import type { Constraint, ConstraintBase } from '../constraints-types.js';

const periodNotLockedBase: ConstraintBase = {
  code: 'period_not_locked',
  description: 'Cannot post into closed or locked fiscal periods',
  scope: 'head',
} as const;

export const periodNotLocked: Constraint = {
  ...periodNotLockedBase,

  validate: async (ctx) => {
    // Collect all unique dates from entries, or use transaction_date as fallback
    const dates = new Set<string>();

    // First, try to get dates from entries
    for (const entry of ctx.entries) {
      if (entry.fs_date) {
        dates.add(entry.fs_date);
      }
    }

    // If no entry dates, use transaction_date
    if (dates.size === 0 && ctx.transaction_date) {
      dates.add(ctx.transaction_date);
    }

    // If still no dates, cannot validate
    if (dates.size === 0) {
      return [];
    }

    // Convert dates to YYYY-MM-DD format and find min/max
    const dateArray = Array.from(dates);
    const sortedDates = dateArray.sort();
    const startYMD = sortedDates[0]!;
    const endYMD = sortedDates[sortedDates.length - 1]!;

    // Check for closed or locked periods - pass transaction from context if available
    const closedOrLockedPeriods = await getFiscalCalendar({
      companyId: ctx.companyUUID,
      startYMD,
      endYMD,
      periodTypes: ['monthly'],
      statuses: ['closed', 'locked'],
      trx: ctx.trx,
    });

    if (closedOrLockedPeriods.length === 0) {
      return [];
    }

    // Return violations for each closed/locked period
    return closedOrLockedPeriods.map((period: FiscalCalendar) => ({
      code: periodNotLockedBase.code,
      message: `Cannot post into ${period.status} period: FY${period.fiscal_year}-P${period.period_number} (${period.start_date}..${period.end_date})`,
      scope: periodNotLockedBase.scope,
      severity: 'error' as const,
    }));
  },
};
