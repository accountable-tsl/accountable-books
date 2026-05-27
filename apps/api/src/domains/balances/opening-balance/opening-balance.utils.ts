// Format a Date as YYYY-MM-DD using UTC fields
export function ymdUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Parse YYYY-MM-DD to a UTC Date at 00:00:00.000Z
export function dateFromYmdUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) throw new Error('Invalid YMD');
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

// Add N days to a YMD (UTC) and return YMD
export function addDaysYmd(ymd: string, n: number): string {
  const dt = dateFromYmdUtc(ymd);
  dt.setUTCDate(dt.getUTCDate() + n);
  return ymdUtc(dt);
}

// Derive as_of_date = previous UTC day (end-of-day position)
// Example: coverage_start = 2025-10-11T... → as_of_date = '2025-10-10'
export function asOfDateYmdFromCoverageStart(coverageStart: Date): string {
  // previous UTC calendar day
  const prev = new Date(
    Date.UTC(
      coverageStart.getUTCFullYear(),
      coverageStart.getUTCMonth(),
      coverageStart.getUTCDate() - 1,
      0,
      0,
      0,
      0,
    ),
  );
  return ymdUtc(prev);
}

// Journal entries are posted at the start (00:00Z) of the new period
// This ensures all same-day transactions apply after the opening balance
export function journalDateFromCoverageStart(coverageStart: Date): Date {
  // midnight UTC of the new period (truncate coverage_start to 00:00Z)
  return new Date(
    Date.UTC(
      coverageStart.getUTCFullYear(),
      coverageStart.getUTCMonth(),
      coverageStart.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

export const determineFiscalYear = (
  date: Date,
  yearEndMonth: number,
  yearEndDay: number,
): number => {
  const y = date.getUTCFullYear();
  const yearEnd = new Date(
    Date.UTC(y, yearEndMonth - 1, yearEndDay, 23, 59, 59, 999),
  );
  return date > yearEnd ? y + 1 : y;
};
