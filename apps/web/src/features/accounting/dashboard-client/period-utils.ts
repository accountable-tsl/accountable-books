/**
 * Period (month/year) types and helpers for the dashboard.
 * Used in production: bounds can later come from API (earliest/latest report);
 * fallback bounds are used until then.
 */

import { MONTHS } from './constants';

export type Period = { monthIdx: number; year: number };

export type PeriodBounds = { earliest: Period; latest: Period };

/** Fallback bounds when API is not available: last 5 years to current month. */
export function getDefaultBounds(): PeriodBounds {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  return {
    earliest: { year: currentYear - 5, monthIdx: 0 },
    latest: { year: currentYear, monthIdx: currentMonthIdx },
  };
}

/** Default period = latest (current month/year) clamped to bounds. */
export function getDefaultPeriod(bounds: PeriodBounds): Period {
  return clampPeriodToBounds(
    { year: bounds.latest.year, monthIdx: bounds.latest.monthIdx },
    bounds,
  );
}

export function clampPeriodToBounds(
  period: Period,
  bounds: PeriodBounds,
): Period {
  const { year } = period;
  let { monthIdx } = period;
  if (year < bounds.earliest.year) return bounds.earliest;
  if (year > bounds.latest.year) return bounds.latest;
  if (year === bounds.earliest.year && monthIdx < bounds.earliest.monthIdx)
    monthIdx = bounds.earliest.monthIdx;
  if (year === bounds.latest.year && monthIdx > bounds.latest.monthIdx)
    monthIdx = bounds.latest.monthIdx;
  return { year, monthIdx };
}

export function getYearOptions(
  bounds: PeriodBounds,
): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  for (let y = bounds.earliest.year; y <= bounds.latest.year; y++) {
    out.push({ value: String(y), label: String(y) });
  }
  return out;
}

/** Month options for a given year, restricted to bounds. */
export function getMonthOptionsForYear(
  year: number,
  bounds: PeriodBounds,
): Array<{ value: string; label: string }> {
  let start = 0;
  let end = 11;
  if (year === bounds.earliest.year) start = bounds.earliest.monthIdx;
  if (year === bounds.latest.year) end = bounds.latest.monthIdx;
  return MONTHS.filter((m) => m.idx >= start && m.idx <= end).map((m) => ({
    value: String(m.idx),
    label: m.short,
  }));
}
