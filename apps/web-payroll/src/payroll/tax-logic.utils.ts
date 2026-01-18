import type {
  Employee,
  EmploymentProrationMethod,
  IsoDateString,
  PayrollMonth,
} from './tax-logic.types';

export function assertValidPayrollMonth(month: PayrollMonth) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`Invalid payroll month "${month}". Expected YYYY-MM.`);
  }
  const m = Number(month.slice(5, 7));
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`Invalid payroll month "${month}". Month must be 01..12.`);
  }
}

/**
 * Converts a PayrollMonth string (format: "YYYY-MM") into a zero-based continuous month index.
 * Example:
 * - "2025-01" → 2025×12 + 0 = 24300
 * - "2025-06" → 2025×12 + 5 = 24305
 * - "2026-01" → 2026×12 + 0 = 24312
 *
 * Main use: easy month-to-month arithmetic and sorting.
 */
export function monthIndex(month: PayrollMonth): number {
  assertValidPayrollMonth(month);
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return year * 12 + (m - 1);
}

function parseIsoDate(date: IsoDateString): {
  year: number;
  month: number;
  day: number;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid ISO date "${date}". Expected YYYY-MM-DD.`);
  }
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (month < 1 || month > 12) throw new Error(`Invalid ISO date "${date}".`);
  if (day < 1 || day > 31) throw new Error(`Invalid ISO date "${date}".`);
  return { year, month, day };
}

function daysInMonth(month: PayrollMonth): number {
  assertValidPayrollMonth(month);
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)); // 1..12
  return new Date(year, m, 0).getDate();
}

function payrollMonthFromIsoDate(date: IsoDateString): PayrollMonth {
  const { year, month } = parseIsoDate(date);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function getEmploymentWindowForMonth(
  employee: Employee,
  month: PayrollMonth,
): { employed: boolean; startDay: number; endDay: number; dim: number } {
  assertValidPayrollMonth(month);

  const dim = daysInMonth(month);
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));

  let startDay = 1;
  let endDay = dim;

  if (employee.joinDate) {
    const joinMonth = payrollMonthFromIsoDate(employee.joinDate);
    if (monthIndex(month) < monthIndex(joinMonth))
      return { employed: false, startDay, endDay, dim };
    if (joinMonth === month) {
      const { year: jy, month: jm, day: jd } = parseIsoDate(employee.joinDate);
      if (jy !== year || jm !== m) throw new Error('joinDate month mismatch.');
      startDay = Math.max(1, Math.min(dim, jd));
    }
  }

  if (employee.exitDate) {
    const exitMonth = payrollMonthFromIsoDate(employee.exitDate);
    if (monthIndex(month) > monthIndex(exitMonth))
      return { employed: false, startDay, endDay, dim };
    if (exitMonth === month) {
      const { year: ey, month: em, day: ed } = parseIsoDate(employee.exitDate);
      if (ey !== year || em !== m) throw new Error('exitDate month mismatch.');
      endDay = Math.max(1, Math.min(dim, ed));
    }
  }

  if (endDay < startDay) return { employed: false, startDay, endDay, dim };
  return { employed: true, startDay, endDay, dim };
}

// Counts how many business days (Monday–Friday) are between startDay and endDay (inclusive) in the given year and month.
function countBusinessDaysInRange(
  year: number,
  month: number,
  startDay: number,
  endDay: number,
) {
  let count = 0;
  for (let d = startDay; d <= endDay; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Sun..6=Sat
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

/**
 * Returns employment fraction for a payroll month based on join/exit dates.
 *
 * - `full_month`: any employment in the month => 1, else 0
 * - `calendar_days`: calendar-day proration (default when join/exit exists)
 * - `business_days`: Mon–Fri proration
 * - `thirty_360`: 30-day month proration (30/360-style)
 *
 * If join/exit are not provided, this returns 1 for all methods.
 */
export function getEmploymentFractionForMonth({
  employee,
  month,
  method = 'calendar_days',
}: {
  employee: Employee;
  month: PayrollMonth;
  method?: EmploymentProrationMethod;
}): number {
  assertValidPayrollMonth(month);

  if (!employee.joinDate && !employee.exitDate) return 1;

  const { employed, startDay, endDay, dim } = getEmploymentWindowForMonth(
    employee,
    month,
  );
  if (!employed) return 0;

  if (method === 'full_month') return 1;

  if (method === 'thirty_360') {
    const start = Math.min(30, startDay);
    const end = Math.min(30, endDay);
    if (end < start) return 0;
    return clamp01((end - start + 1) / 30);
  }

  if (method === 'business_days') {
    const year = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const denom = countBusinessDaysInRange(year, m, 1, dim);
    if (denom === 0) return 0;
    const numer = countBusinessDaysInRange(year, m, startDay, endDay);
    return clamp01(numer / denom);
  }

  const workedDays = endDay - startDay + 1;
  return clamp01(workedDays / dim);
}

/**
 * Checks if a given payroll month falls within a specified date range.
 *
 * @param month - The payroll month to check (format: "YYYY-MM")
 * @param fromMonth - The start of the range (inclusive, format: "YYYY-MM")
 * @param toMonth - The end of the range (inclusive, format: "YYYY-MM").
 *                  If omitted, checks if month is >= fromMonth (open-ended)
 * @returns true if month is within [fromMonth, toMonth], false otherwise
 */
export function monthInRange({
  month,
  fromMonth,
  toMonth,
}: {
  month: PayrollMonth;
  fromMonth: PayrollMonth;
  toMonth?: PayrollMonth;
}): boolean {
  const x = monthIndex(month);
  const from = monthIndex(fromMonth);
  const to = toMonth ? monthIndex(toMonth) : Number.POSITIVE_INFINITY;
  return x >= from && x <= to;
}

/**
 * Finds the single period that contains the given month.
 * Throws if multiple periods overlap on that month.
 *
 * @param items - List of periods (each has fromMonth and optional toMonth)
 * @param month - The month to find a period for ("YYYY-MM")
 * @param label - Name for error message (e.g. "salary", "tax")
 * @returns The matching period or undefined if none found
 * @throws Error if more than one period matches the month
 */
export function pickSinglePeriod<
  T extends { fromMonth: PayrollMonth; toMonth?: PayrollMonth },
>(items: T[] | undefined, month: PayrollMonth, label: string): T | undefined {
  if (!items?.length) return undefined;
  const matches = items.filter((p) =>
    monthInRange({ month, fromMonth: p.fromMonth, toMonth: p.toMonth }),
  );
  if (matches.length === 0) return undefined;
  if (matches.length > 1) {
    throw new Error(
      `Overlapping ${label} periods for ${month}. Fix data so only one period applies.`,
    );
  }
  return matches[0];
}

export function listMonthsFromJanuaryTo(month: PayrollMonth): PayrollMonth[] {
  assertValidPayrollMonth(month);
  const year = month.slice(0, 4);
  const targetM = Number(month.slice(5, 7));
  const months: PayrollMonth[] = [];
  for (let m = 1; m <= targetM; m++) {
    months.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

export function assertValidRate(x: number, label: string) {
  if (!Number.isFinite(x) || x < 0 || x > 1) {
    throw new Error(
      `Invalid ${label} "${x}". Expected a number between 0 and 1.`,
    );
  }
}

type RatePair = {
  employeeRate: number;
  employerRate: number;
};

/**
 * Resolve statutory contribution rates with a consistent precedence and validation:
 * - precedence: override -> defaults -> fallback
 * - validates each rate is within 0..1
 * - enforces employer minimum and total minimum
 */
export function resolveRatePair(params: {
  label: string; // used in error messages (e.g. "pension", "NHIS")
  override?: RatePair;
  defaults?: RatePair;
  fallback: RatePair;
  minEmployerRate: number;
  minTotalRate: number;
}): { eeRate: number; erRate: number } {
  const { label, override, defaults, fallback, minEmployerRate, minTotalRate } =
    params;

  const eeRate =
    override?.employeeRate ?? defaults?.employeeRate ?? fallback.employeeRate;
  const erRate =
    override?.employerRate ?? defaults?.employerRate ?? fallback.employerRate;

  assertValidRate(eeRate, `${label} employeeRate`);
  assertValidRate(erRate, `${label} employerRate`);

  if (erRate < minEmployerRate) {
    throw new Error(
      `Invalid ${label} rates: employerRate must be at least ${minEmployerRate}.`,
    );
  }
  if (eeRate + erRate < minTotalRate) {
    throw new Error(
      `Invalid ${label} rates: employeeRate + employerRate must be at least ${minTotalRate}.`,
    );
  }

  return { eeRate, erRate };
}
