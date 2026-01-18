/**
 * Shared utility functions for the payroll module
 */

import { getLagosState } from './data/states';
import {
  PAYROLL_TOOL_SCHEMA_VERSION,
  PayrollCompanyDefaultsSchema,
} from './domain';

import type {
  PayrollCompanyDefaults,
  PayrollRun,
  PayrollRunIndexEntry,
} from './domain';

/**
 * Generate a unique ID using crypto.randomUUID()
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Parse year and month from string state to numbers
 */
export function parsePeriod(
  year: string,
  month: string,
): {
  periodYear: number;
  periodMonth: number;
} {
  return {
    periodYear: parseInt(year, 10),
    periodMonth: parseInt(month, 10),
  };
}

/**
 * Format month and year into a month key (e.g., "2026-01")
 */
export function formatMonthKey(year: string, month: string): string {
  const monthNum = parseInt(month, 10);
  return `${year}-${String(monthNum).padStart(2, '0')}`;
}

/**
 * Get the default state value, falling back to Lagos if not provided
 */
export function getDefaultState(fallback?: string | null): string {
  return fallback ?? getLagosState().value;
}

/**
 * Deep partial type that makes all nested properties optional recursively
 */
type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

// Deep merge helper for nested objects
export function deepMerge<T extends Record<string, any>>(
  target: T,
  update: DeepPartial<T>,
): T {
  const result = { ...target };

  for (const key in update) {
    const updateValue = update[key];
    const targetValue = result[key];

    if (updateValue === undefined) {
      continue;
    }

    // If the value is a plain object and target also has a plain object, recurse
    if (
      updateValue !== null &&
      typeof updateValue === 'object' &&
      !Array.isArray(updateValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, updateValue);
    } else {
      // Otherwise, just replace (including arrays, primitives, null)
      result[key] = updateValue as any;
    }
  }

  return result;
}

/**
 * Updates for company defaults - all fields are optional except we exclude
 * updatedAt and schemaVersion as these are managed automatically
 */
export type CompanyDefaultsUpdate = DeepPartial<
  Omit<PayrollCompanyDefaults, 'updatedAt' | 'schemaVersion'>
>;

export function updateCompanyDefaultSettings(
  current: PayrollCompanyDefaults,
  updates: CompanyDefaultsUpdate,
): PayrollCompanyDefaults {
  const merged = deepMerge(current, updates);

  // Automatically update the timestamp
  const newObj = {
    ...merged,
    updatedAt: new Date().toISOString(),
  };
  // Validate the result to ensure it still conforms to the schema
  const validated = PayrollCompanyDefaultsSchema.parse(newObj);

  return validated;
}

/**
 * Helper to create initial company defaults with automatic timestamp
 */
export function createCompanyDefaultSettings(
  data: Omit<PayrollCompanyDefaults, 'updatedAt' | 'schemaVersion'>,
): PayrollCompanyDefaults {
  const defaults: PayrollCompanyDefaults = {
    ...data,
    schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };

  return PayrollCompanyDefaultsSchema.parse(defaults);
}

/**
 * Check if a payroll run is a multi-period run (covers more than one month).
 */
export function isMultiPeriodRun(run: PayrollRun): boolean {
  if (run.periodEndMonth == null || run.periodEndYear == null) {
    return false;
  }
  return (
    run.periodEndYear > run.periodYear ||
    (run.periodEndYear === run.periodYear &&
      run.periodEndMonth > run.periodMonth)
  );
}

/**
 * Get the period start as a month key (YYYY-MM format).
 */
export function getPeriodStartKey(run: PayrollRun): string {
  return `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
}

/**
 * Get the period end as a month key (YYYY-MM format).
 * Returns the start key if no end is specified (single-month run).
 */
export function getPeriodEndKey(run: PayrollRun): string {
  if (run.periodEndMonth != null && run.periodEndYear != null) {
    return `${run.periodEndYear}-${String(run.periodEndMonth).padStart(2, '0')}`;
  }
  return getPeriodStartKey(run);
}

/**
 * Get all month keys covered by this payroll run.
 * Returns an array of YYYY-MM strings from start to end (inclusive).
 */
export function getPeriodMonthKeys(run: PayrollRun): string[] {
  const startKey = getPeriodStartKey(run);
  const endKey = getPeriodEndKey(run);

  if (startKey === endKey) {
    return [startKey];
  }

  const keys: string[] = [];
  const [startYear, startMonth] = startKey.split('-').map(Number);
  const [endYear, endMonth] = endKey.split('-').map(Number);

  let currentYear = startYear;
  let currentMonth = startMonth;

  while (
    currentYear < endYear ||
    (currentYear === endYear && currentMonth <= endMonth)
  ) {
    keys.push(`${currentYear}-${String(currentMonth).padStart(2, '0')}`);

    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }
  }

  return keys;
}

/**
 * Format ISO timestamp to relative time string
 * Examples: "now", "2hrs ago", "5 hrs ago", "3 days ago", "Jan 15, 2026"
 */
export function formatRelativeTime(isoString: string): string {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();

  // Handle invalid dates or future dates
  if (isNaN(then.getTime())) {
    return 'Invalid date';
  }

  // If future date, show as "now" (shouldn't happen but handle gracefully)
  if (diffMs < 0) {
    return 'now';
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Less than 1 minute: "now"
  if (diffSeconds < 60) {
    return 'now';
  }

  // Less than 1 hour: "X mins ago"
  if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'min' : 'mins'} ago`;
  }

  // Less than 24 hours: "X hrs ago"
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hr' : 'hrs'} ago`;
  }

  // Less than 7 days: "X days ago"
  if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  }

  // 7+ days: show actual date
  return then.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format month number to month name (e.g., 1 -> "Jan", 12 -> "Dec")
 */
function formatMonthName(month: number): string {
  const date = new Date(2000, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short' });
}

/**
 * Format run period as "Jan 2026" or "Jan 2026 to Mar 2026" for multi-period runs
 */
export function formatRunPeriod(run: PayrollRunIndexEntry): string {
  const startMonth = formatMonthName(run.periodMonth);
  const startYear = run.periodYear;

  // Single period run
  if (run.periodEndMonth == null || run.periodEndYear == null) {
    return `${startMonth} ${startYear}`;
  }

  // Multi-period run
  const endMonth = formatMonthName(run.periodEndMonth);
  const endYear = run.periodEndYear;

  // If same year, only show year once
  if (startYear === endYear) {
    return `${startMonth} to ${endMonth} ${startYear}`;
  }

  return `${startMonth} ${startYear} to ${endMonth} ${endYear}`;
}

/**
 * Format finalized date for display
 */
function formatFinalizedDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format tooltip text for a payroll run list item
 * Includes relative time, status, period, and other helpful metadata
 */
export function formatRunTooltipText(run: PayrollRunIndexEntry): string {
  const lines: string[] = [];

  // Relative time
  const relativeTime = formatRelativeTime(run.updatedAt);
  lines.push(`Updated ${relativeTime}`);

  // Status
  lines.push(`Status: ${run.status === 'final' ? 'Finalized' : 'Draft'}`);

  // Period (with end date if multi-period)
  const period = formatRunPeriod(run);
  lines.push(`Period: ${period}`);

  // Finalized date if applicable
  if (run.status === 'final' && run.finalizedAt) {
    const finalizedDate = formatFinalizedDate(run.finalizedAt);
    lines.push(`Finalized: ${finalizedDate}`);
  }

  // Demo indicator
  if (run.isDemo) {
    lines.push('Demo run');
  }

  return lines.join('\n');
}
