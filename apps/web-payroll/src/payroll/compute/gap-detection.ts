import type { PayrollRun, PayrollRunsIndex } from '../domain';

/**
 * Detect missing finalized months between the earliest finalized run and the current run
 *
 * **IMPORTANT: This is COMPANY-level gap detection, not employee-level.**
 * It checks whether the company has finalized payroll runs for all months in a sequence,
 * not whether individual employees appear in every month (employees can join/leave at any time).
 *
 * This helps identify gaps in payroll records that might affect YTD calculations.
 * For example, if there's a finalized run for February and the user is trying to
 * finalize April, March would be detected as a gap.
 *
 * **Policy for handling gaps:**
 *
 * 1. **Starting fresh (no previous finalized runs)**:
 *    - Returns empty array - no gaps detected, no nudge shown
 *    - This is expected when starting to use the system mid-year
 *    - User can proceed without any warnings
 *
 * 2. **Missing months with previous finalized records**:
 *    - Gaps are detected and user is nudged (not blocked)
 *    - Common scenarios:
 *      a. **Months handled outside system**: Acceptable - user can proceed
 *      b. **Months skipped by mistake**: User should create finalized runs for missing months
 *         to ensure accurate YTD calculations
 *
 * 3. **User action**:
 *    - System shows warning but does NOT block finalization
 *    - User can proceed if gaps are intentional (manual handling, mid-year start)
 *    - User should create missing finalized runs if gaps are unintentional
 *
 * **Note on employee-level considerations:**
 * - Employee mid-year joins/leaves are NOT gaps (company still has a run for that month)
 * - Employee-level YTD calculations handle mid-year joins by only including months after
 *   join date (handled in YTD calculation logic, not gap detection)
 * - We do NOT validate employee-per-month gaps (employees can join/leave at any time)
 *
 * @param currentRun - The run being finalized
 * @param runsIndex - All runs for the company
 * @returns Array of missing month keys (e.g., ['2026-03'] if March 2026 is missing).
 *          Returns empty array if no previous finalized runs exist (starting fresh).
 */
export function detectMonthGaps(
  currentRun: PayrollRun,
  runsIndex: PayrollRunsIndex,
): string[] {
  const gaps: string[] = [];

  // Filter to finalized runs for the same company and year
  const sameCompanyRuns = runsIndex.runs.filter(
    (r) =>
      r.status === 'final' &&
      r.periodYear === currentRun.periodYear &&
      // Match companyId: both undefined means same company, or both have same value
      (r.companyId === currentRun.companyId ||
        (r.companyId == null && currentRun.companyId == null)),
  );

  if (sameCompanyRuns.length === 0) {
    // No previous finalized runs - no gaps to detect
    return gaps;
  }

  // Find the earliest finalized month
  // Initialize with the first run, then find the minimum
  let earliestMonth = sameCompanyRuns[0]!.periodMonth;
  let earliestYear = sameCompanyRuns[0].periodYear;

  for (const run of sameCompanyRuns) {
    const runStartMonth = run.periodMonth;
    const runStartYear = run.periodYear;

    // Calculate month number (year * 12 + month) for comparison
    const runMonthNum = runStartYear * 12 + runStartMonth;
    const earliestMonthNum = earliestYear * 12 + earliestMonth;

    if (runMonthNum < earliestMonthNum) {
      earliestMonth = runStartMonth;
      earliestYear = runStartYear;
    }
  }

  // Determine the range to check
  const startMonthNum = earliestYear * 12 + earliestMonth;
  const endMonthNum = currentRun.periodYear * 12 + currentRun.periodMonth;

  // Check each month in between for a finalized run
  for (let monthNum = startMonthNum + 1; monthNum < endMonthNum; monthNum++) {
    const checkYear = Math.floor((monthNum - 1) / 12);
    const checkMonth = ((monthNum - 1) % 12) + 1;

    // Check if there's a finalized run for this month
    const hasRunForMonth = sameCompanyRuns.some((run) => {
      const runStartMonth = run.periodMonth;
      const runEndMonth = run.periodEndMonth ?? run.periodMonth;
      const runStartYear = run.periodYear;
      const runEndYear = run.periodEndYear ?? run.periodYear;

      // Check if the month falls within the run's period
      const runStartNum = runStartYear * 12 + runStartMonth;
      const runEndNum = runEndYear * 12 + runEndMonth;

      return monthNum >= runStartNum && monthNum <= runEndNum;
    });

    if (!hasRunForMonth) {
      // This month is missing - add to gaps
      const monthKey = `${checkYear}-${String(checkMonth).padStart(2, '0')}`;
      gaps.push(monthKey);
    }
  }

  return gaps;
}

/**
 * Format month gaps for display
 *
 * @param gaps - Array of month keys (e.g., ['2026-03', '2026-05'])
 * @returns Formatted string for display (e.g., "March 2026, May 2026")
 */
export function formatMonthGaps(gaps: string[]): string {
  if (gaps.length === 0) return '';

  const formatted = gaps.map((monthKey) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  });

  if (formatted.length === 1) {
    return formatted[0];
  }

  if (formatted.length === 2) {
    return `${formatted[0]} and ${formatted[1]}`;
  }

  // For 3+ gaps, use Oxford comma
  const last = formatted.pop();
  return `${formatted.join(', ')}, and ${last}`;
}
