import type { z } from 'zod';

import { CompensationPeriodSchema } from '../domain';
import { getPeriodStartKey } from '../utils';

import type { PayrollRun, PayrollRunItem } from '../domain';

/**
 * Resolve compensation period for a specific month
 *
 * Finds the compensation period in the history that applies to the given month.
 * A period applies if the month is >= fromMonth and (toMonth is undefined or month <= toMonth).
 *
 * **Important**: Returns the FULL compensation period (not a simplified type) so callers
 * have access to all fields including BHT breakdown values.
 *
 * **Overlapping Periods**:
 * - Zod schema validates individual periods (toMonth >= fromMonth) but does NOT prevent
 *   overlapping periods in the array
 * - If multiple periods match, returns the FIRST one found (earliest fromMonth wins)
 * - In practice, compensation periods should not overlap - each month should have exactly
 *   one applicable period. If overlaps exist due to data issues, the first match is used.
 *
 * This is the correct way to resolve compensation - don't just use compHistory[0]!
 *
 * @param compHistory - Array of compensation periods
 * @param monthKey - Month key in format "YYYY-MM" (e.g., "2026-03")
 * @returns The full compensation period that applies to the month, or null if none found
 */
export function resolveCompensationForMonth<
  T extends { fromMonth: string; toMonth?: string },
>(compHistory: T[], monthKey: string): T | null {
  // Find the period that contains this month
  for (const period of compHistory) {
    if (monthKey >= period.fromMonth) {
      // Month is >= fromMonth, check if it's <= toMonth (or toMonth is undefined)
      if (period.toMonth == null || monthKey <= period.toMonth) {
        return period;
      }
    }
  }

  // No matching period found
  return null;
}

/**
 * Calculate employment fraction for a month based on join/exit dates
 *
 * Returns the fraction of the month the employee was employed (0.0 to 1.0).
 * Supports multiple proration methods:
 * - `calendar_days`: Calendar-day proration (default) - uses actual days in month
 * - `thirty_360`: 30-day month proration (30/360-style) - assumes 30 days per month
 * - `business_days`: Business days proration (Mon-Fri only)
 * - `full_month`: Full month - any employment in the month = 1.0, else 0.0
 *
 * This is critical for accurate payroll calculations, especially for:
 * - Employees who join mid-month
 * - Employees who exit mid-month
 * - YTD calculations (worked month units)
 *
 * @param runItem - The payroll run item
 * @param monthKey - Month key in format "YYYY-MM" (e.g., "2026-03")
 * @param method - Proration method (default: 'calendar_days')
 * @returns Employment fraction (0.0 to 1.0)
 */
export function calculateEmploymentFraction(
  runItem: PayrollRunItem,
  monthKey: string,
  method:
    | 'calendar_days'
    | 'thirty_360'
    | 'business_days'
    | 'full_month' = 'calendar_days',
): number {
  const joinDate = runItem.employeeSnapshot.joinDate;
  const exitDate = runItem.employeeSnapshot.exitDate;

  // No join/exit dates = full month (all methods)
  if (!joinDate && !exitDate) {
    return 1.0;
  }

  // Parse month key
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // Get days in month
  const daysInMonth = new Date(year, month, 0).getDate();

  let startDay = 1;
  let endDay = daysInMonth;

  // Check join date
  if (joinDate) {
    const joinDateObj = new Date(joinDate);
    const joinYear = joinDateObj.getFullYear();
    const joinMonth = joinDateObj.getMonth() + 1; // getMonth() returns 0-11
    const joinDay = joinDateObj.getDate();

    // If join is in this month, start from join day
    if (joinYear === year && joinMonth === month) {
      startDay = Math.max(1, Math.min(daysInMonth, joinDay));
    } else if (joinYear > year || (joinYear === year && joinMonth > month)) {
      // Joined after this month = not employed
      return 0.0;
    }
  }

  // Check exit date
  if (exitDate) {
    const exitDateObj = new Date(exitDate);
    const exitYear = exitDateObj.getFullYear();
    const exitMonth = exitDateObj.getMonth() + 1;
    const exitDay = exitDateObj.getDate();

    // If exit is in this month, end at exit day
    if (exitYear === year && exitMonth === month) {
      endDay = Math.max(1, Math.min(daysInMonth, exitDay));
    } else if (exitYear < year || (exitYear === year && exitMonth < month)) {
      // Exited before this month = not employed
      return 0.0;
    }
  }

  // If endDay < startDay, employee wasn't employed this month
  if (endDay < startDay) {
    return 0.0;
  }

  // Apply proration method
  if (method === 'full_month') {
    return 1.0;
  }

  if (method === 'thirty_360') {
    // 30/360: Assume 30 days per month, cap days at 30
    const start = Math.min(30, startDay);
    const end = Math.min(30, endDay);
    if (end < start) return 0.0;
    const daysWorked = end - start + 1;
    return Math.max(0.0, Math.min(1.0, daysWorked / 30));
  }

  if (method === 'business_days') {
    // Business days: Count Mon-Fri only
    const businessDaysInMonth = countBusinessDaysInMonth(year, month);
    if (businessDaysInMonth === 0) return 0.0;
    const businessDaysWorked = countBusinessDaysInRange(
      year,
      month,
      startDay,
      endDay,
    );
    return Math.max(
      0.0,
      Math.min(1.0, businessDaysWorked / businessDaysInMonth),
    );
  }

  // calendar_days (default): Use actual calendar days
  const daysWorked = endDay - startDay + 1;
  return Math.max(0.0, Math.min(1.0, daysWorked / daysInMonth));
}

/**
 * Count business days (Mon-Fri) in a month
 */
function countBusinessDaysInMonth(year: number, month: number): number {
  return countBusinessDaysInRange(
    year,
    month,
    1,
    new Date(year, month, 0).getDate(),
  );
}

/**
 * Count business days (Mon-Fri) in a date range within a month
 */
function countBusinessDaysInRange(
  year: number,
  month: number,
  startDay: number,
  endDay: number,
): number {
  let count = 0;
  for (let day = startDay; day <= endDay; day++) {
    const date = new Date(year, month - 1, day); // month is 1-based, Date uses 0-based
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // Monday (1) through Friday (5)
      count++;
    }
  }
  return count;
}

/**
 * Get the compensation period and employment fraction for a run item
 *
 * Convenience function that combines compensation resolution and employment fraction
 * calculation. This is the correct way to get monthly compensation data.
 *
 * Returns the FULL compensation period (not simplified) so callers have access to
 * all fields including BHT breakdown values (annualBasic, annualHousing, annualTransport).
 *
 * Uses the employment proration method from run settings (or default: 'calendar_days').
 *
 * @param runItem - The payroll run item
 * @param run - The payroll run (for month key and settings)
 * @returns Object with full compensation period and employment fraction, or null if no compensation found
 */
export function getCompensationAndFraction(
  runItem: PayrollRunItem,
  run: PayrollRun,
): {
  comp: z.infer<typeof CompensationPeriodSchema>;
  employmentFraction: number;
} | null {
  const monthKey = getPeriodStartKey(run);
  const compHistory = runItem.payProfileSnapshot.compensationHistory;

  if (compHistory.length === 0) {
    return null;
  }

  const comp = resolveCompensationForMonth(compHistory, monthKey);
  if (!comp) {
    return null;
  }

  // Get proration method from run settings (default: 'calendar_days')
  const prorationMethod =
    run.settings?.employmentProrationMethod ?? 'calendar_days';
  const employmentFraction = calculateEmploymentFraction(
    runItem,
    monthKey,
    prorationMethod,
  );

  return { comp, employmentFraction };
}
