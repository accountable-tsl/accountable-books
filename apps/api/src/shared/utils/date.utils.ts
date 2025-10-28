export function toDateString(
  input: string | Date,
  format: 'yyyy-mm-dd' | 'dd/mm/yyyy' | 'mm/dd/yyyy' = 'yyyy-mm-dd',
): string | null {
  let date: Date;

  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'string') {
    date = new Date(input);
    if (isNaN(date.getTime())) return null; // Invalid date
  } else {
    return null;
  }

  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());

  switch (format) {
    case 'dd/mm/yyyy':
      return `${day}/${month}/${year}`;
    case 'mm/dd/yyyy':
      return `${month}/${day}/${year}`;
    case 'yyyy-mm-dd':
    default:
      return `${year}-${month}-${day}`;
  }
}

/** Strict pattern for 'YYYY-MM-DD' */
export const YMD_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Strict ISO-8601 instant with timezone (Z or ±hh:mm) */
export const ISO_INSTANT_REGEX =
  /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Validate a string is a real calendar date in 'YYYY-MM-DD' form.
 * Rejects impossible dates like 2025-02-31.
 */
export function isValidYMD(ymd: string): boolean {
  if (!YMD_REGEX.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Convert any reasonable input into a strict 'YYYY-MM-DD' string (UTC date).
 *
 * Accepts:
 *  - YMD string (e.g. '2025-03-04')
 *  - ISO-8601 instant with timezone (e.g. '2025-03-04T23:30:00Z')
 *  - JS Date object
 *  - Epoch milliseconds (number)
 *
 * Rejects:
 *  - Ambiguous strings without timezone info (e.g. '2025-03-04T12:00:00')
 *  - Invalid or impossible dates
 */
export function toYMD(input: string | number | Date): string {
  if (input == null) throw new Error('toYMD: input is null or undefined');

  // 1. Already a valid YMD string
  if (typeof input === 'string' && isValidYMD(input)) return input;

  // 2. ISO instant with explicit timezone
  if (typeof input === 'string' && ISO_INSTANT_REGEX.test(input)) {
    const dt = new Date(input);
    if (Number.isNaN(dt.getTime()))
      throw new Error(`Invalid ISO instant: ${input}`);
    return dt.toISOString().slice(0, 10);
  }

  // 3. Epoch number (milliseconds)
  if (typeof input === 'number') {
    const dt = new Date(input);
    if (Number.isNaN(dt.getTime())) throw new Error(`Invalid epoch: ${input}`);
    return dt.toISOString().slice(0, 10);
  }

  // 4. JS Date object
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new Error('Invalid Date object');
    const y = input.getUTCFullYear();
    const m = String(input.getUTCMonth() + 1).padStart(2, '0');
    const d = String(input.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  throw new Error(`Unsupported date input: ${input}`);
}

/**
 * Convert any reasonable input (YMD | ISO | Date | epoch) into a JS Date,
 * with explicit intent for how to handle the time component.
 *
 * mode:
 *  - 'keep'  → preserve existing time (ISO/Date/epoch)
 *  - 'start' → 00:00:00.000 UTC (start of day)
 *  - 'end'   → 23:59:59.999 UTC (end of day)
 *
 * Rules:
 *  - YMD strings can only use 'start' or 'end' (no time to 'keep')
 *  - ISO, Date, or epoch can use any mode
 *  - All results are UTC-based (no local-time drift)
 */
export function toDate(
  input: string | number | Date,
  mode: 'keep' | 'start' | 'end',
): Date {
  if (input == null) throw new Error('toDate: input is null or undefined');

  // 1. YMD string → explicit start or end
  if (typeof input === 'string' && isValidYMD(input)) {
    const [y, m, d] = input.split('-').map(Number);
    if (mode === 'start') return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    if (mode === 'end') return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    throw new Error(
      `Cannot 'keep' time for a YMD string: it has no time component`,
    );
  }

  // 2. ISO string or epoch number → parse to Date first
  const dt = new Date(input as any);
  if (Number.isNaN(dt.getTime()))
    throw new Error(`Invalid date input: ${input}`);

  if (mode === 'keep') return dt;

  // 3. Normalize to start or end of day in UTC
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  const d = dt.getUTCDate();

  if (mode === 'start') return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  if (mode === 'end') return new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

  throw new Error(`Unsupported mode: ${mode}`);
}

export function addDaysToYMD(ymd: string, days: number): string {
  const dt = toDate(ymd, 'start');
  const ms = dt.getTime() + days * 86400000;
  return toYMD(new Date(ms));
}

export function addMonthsToYMD(ymd: string, n: number): string {
  if (!isValidYMD(ymd)) {
    throw new Error(`Invalid ymd: ${ymd}`);
  }

  const dt = toDate(ymd, 'start');
  const y = dt.getUTCFullYear(),
    m = dt.getUTCMonth(),
    d = dt.getUTCDate();
  const firstTarget = new Date(Date.UTC(y, m + n, 1));
  const lastDay = new Date(
    Date.UTC(firstTarget.getUTCFullYear(), firstTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const day = Math.min(d, lastDay);
  return toYMD(
    new Date(
      Date.UTC(firstTarget.getUTCFullYear(), firstTarget.getUTCMonth(), day),
    ),
  );
}
