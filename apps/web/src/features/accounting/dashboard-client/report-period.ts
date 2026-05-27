/**
 * Report period types and helpers for statement tabs.
 * The period "mode" is inferred from user selection — no separate mode picker.
 */

import type { ApiPeriod } from '@/modules/accounting/reporting';

import { MONTHS } from './constants';

import type { PeriodBounds } from './period-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { ApiPeriod };

export type PeriodMode =
  | 'month'
  | 'quarter'
  | 'year'
  | 'ytd'
  | 'trailing12m'
  | 'custom';

export type CompareMode = 'none' | 'prior_period' | 'prior_year';

export type ReportPeriod = {
  mode: PeriodMode;
  anchor: { monthIdx: number; year: number };
  /** End of range — only meaningful for custom mode. */
  endAnchor?: { monthIdx: number; year: number };
  compare: CompareMode;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getQuarterForMonth(monthIdx: number): 1 | 2 | 3 | 4 {
  if (monthIdx < 3) return 1;
  if (monthIdx < 6) return 2;
  if (monthIdx < 9) return 3;
  return 4;
}

export function getQuarterStartMonth(quarter: 1 | 2 | 3 | 4): number {
  return (quarter - 1) * 3;
}

function toDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function shiftYearsClamped(d: Date, years: number): Date {
  const y = d.getFullYear() + years;
  const m = d.getMonth();
  const day = d.getDate();
  // JS Date will overflow (e.g. Feb 29 -> Mar 1). Clamp back into month.
  const shifted = new Date(y, m, day);
  while (shifted.getMonth() !== m) {
    shifted.setDate(shifted.getDate() - 1);
  }
  return shifted;
}

function getDaysInRange(start: Date, end: Date): number {
  const ms = toDateOnly(end).getTime() - toDateOnly(start).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

function formatMonthDay(d: Date): string {
  return `${MONTHS[d.getMonth()].short} ${d.getDate()}`;
}

function formatMonthDayYear(d: Date): string {
  return `${MONTHS[d.getMonth()].short} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatDateRangeLabel(start: Date, end: Date): string {
  const s = toDateOnly(start);
  const e = toDateOnly(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();

  if (sameMonth) {
    // Feb 1–13, 2026
    return `${MONTHS[s.getMonth()].short} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  if (sameYear) {
    // Jan 1–Feb 13, 2026
    return `${MONTHS[s.getMonth()].short} ${s.getDate()}–${MONTHS[e.getMonth()].short} ${e.getDate()}, ${s.getFullYear()}`;
  }
  // Dec 15, 2025–Jan 13, 2026
  return `${formatMonthDayYear(s)}–${formatMonthDayYear(e)}`;
}

/** Whether arrow stepping is meaningful for a given mode. */
export function canStep(rp: ReportPeriod): boolean {
  return rp.mode !== 'trailing12m' && rp.mode !== 'custom';
}

/** Whether comparison is supported for a given mode. */
export function canCompare(rp: ReportPeriod): boolean {
  return rp.mode !== 'trailing12m' && rp.mode !== 'custom';
}

export type ReportCoverage = {
  start: Date;
  end: Date;
  fullEnd: Date;
  isPartial: boolean;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export function getDefaultReportPeriod(bounds: PeriodBounds): ReportPeriod {
  return {
    mode: 'month',
    anchor: { monthIdx: bounds.latest.monthIdx, year: bounds.latest.year },
    compare: 'none',
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatPeriodLabel(rp: ReportPeriod): string {
  const { mode, anchor } = rp;
  switch (mode) {
    case 'month':
      return `${MONTHS[anchor.monthIdx].short} ${anchor.year}`;
    case 'quarter':
      return `Q${getQuarterForMonth(anchor.monthIdx)} ${anchor.year}`;
    case 'year':
      return `FY ${anchor.year}`;
    case 'ytd':
      return `YTD ${anchor.year}`;
    case 'trailing12m':
      return 'Trailing 12M';
    case 'custom': {
      if (!rp.endAnchor)
        return `${MONTHS[anchor.monthIdx].short} ${anchor.year}`;
      const start = `${MONTHS[anchor.monthIdx].short} ${anchor.year}`;
      const end = `${MONTHS[rp.endAnchor.monthIdx].short} ${rp.endAnchor.year}`;
      return `${start} – ${end}`;
    }
    default:
      return '';
  }
}

/**
 * Column label variant for statement tables.
 * Slightly more explicit for longer periods without adding sublabels.
 */
export function formatPeriodColumnLabel(rp: ReportPeriod): string {
  const { mode, anchor } = rp;
  switch (mode) {
    case 'month':
      return `${MONTHS[anchor.monthIdx].short} ${anchor.year}`;
    case 'quarter':
      return `Q${getQuarterForMonth(anchor.monthIdx)} ${anchor.year}`;
    case 'year':
      return `Jan – Dec ${anchor.year}`;
    case 'ytd':
      return `Jan – ${MONTHS[anchor.monthIdx].short} ${anchor.year}`;
    case 'trailing12m':
      return 'Trailing 12M';
    case 'custom':
      return formatPeriodLabel(rp);
    default:
      return '';
  }
}

export function formatCompareLabel(compare: CompareMode): string {
  switch (compare) {
    case 'prior_period':
      return 'vs Prior Period';
    case 'prior_year':
      return 'vs Prior Year';
    default:
      return '';
  }
}

function getFullRangeForPeriod(
  rp: ReportPeriod,
  asOf: Date,
): {
  start: Date;
  fullEnd: Date;
} {
  const { mode, anchor } = rp;

  switch (mode) {
    case 'month': {
      const start = new Date(anchor.year, anchor.monthIdx, 1);
      const fullEnd = new Date(anchor.year, anchor.monthIdx + 1, 0);
      return { start, fullEnd };
    }
    case 'quarter': {
      const q = getQuarterForMonth(anchor.monthIdx);
      const startMonth = getQuarterStartMonth(q);
      const start = new Date(anchor.year, startMonth, 1);
      const fullEnd = new Date(anchor.year, startMonth + 3, 0);
      return { start, fullEnd };
    }
    case 'year':
    case 'ytd': {
      const start = new Date(anchor.year, 0, 1);
      const fullEnd = new Date(anchor.year, 11, 31);
      return { start, fullEnd };
    }
    case 'trailing12m': {
      const asOfDay = toDateOnly(asOf);
      const start = new Date(asOfDay.getFullYear(), asOfDay.getMonth() - 11, 1);
      return { start, fullEnd: asOfDay };
    }
    case 'custom': {
      // Custom isn't enabled in v1; keep a safe fallback (month).
      const start = new Date(anchor.year, anchor.monthIdx, 1);
      const fullEnd = new Date(anchor.year, anchor.monthIdx + 1, 0);
      return { start, fullEnd };
    }
    default: {
      const start = new Date(anchor.year, anchor.monthIdx, 1);
      const fullEnd = new Date(anchor.year, anchor.monthIdx + 1, 0);
      return { start, fullEnd };
    }
  }
}

export function getReportCoverage(
  rp: ReportPeriod,
  asOf: Date,
): ReportCoverage {
  const asOfDay = toDateOnly(asOf);
  const { start, fullEnd } = getFullRangeForPeriod(rp, asOfDay);

  // If "as of" falls within the selected range, we're looking at an in-progress
  // period (e.g. MTD / QTD / YTD). Otherwise it's a historical closed period.
  const isWithin = asOfDay >= start && asOfDay <= fullEnd;
  const end = isWithin ? asOfDay : fullEnd;
  const isPartial = end < fullEnd;

  return { start, end, fullEnd, isPartial };
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function reportPeriodToApiPeriod(
  rp: ReportPeriod,
  asOf: Date,
): ApiPeriod {
  const coverage = getReportCoverage(rp, asOf);
  const { mode, anchor } = rp;

  let periodType: ApiPeriod['periodType'] = 'monthly';
  let periodNumber = anchor.monthIdx + 1;

  if (mode === 'quarter') {
    periodType = 'quarterly';
    periodNumber = getQuarterForMonth(anchor.monthIdx);
  } else if (mode === 'year' || mode === 'ytd') {
    periodType = 'yearly';
    periodNumber = 1;
  } else if (mode === 'trailing12m' || mode === 'custom') {
    const days =
      (coverage.end.getTime() - coverage.start.getTime()) / 86_400_000 + 1;
    if (days <= 31) {
      periodType = 'monthly';
      periodNumber = coverage.start.getMonth() + 1;
    } else if (days <= 95) {
      periodType = 'quarterly';
      periodNumber = getQuarterForMonth(coverage.start.getMonth());
    } else {
      periodType = 'yearly';
      periodNumber = 1;
    }
  }

  return {
    periodType,
    fiscalYear: coverage.start.getFullYear(),
    periodNumber,
    startDate: toYMD(coverage.start),
    endDate: toYMD(coverage.end),
  };
}

/**
 * Column headers should never hide partial coverage.
 * When the current period is partial and comparison is enabled, we default to
 * same-day comparisons (MTD vs MTD, not MTD vs full month).
 */
export function getStatementColumnLabels(
  rp: ReportPeriod,
  asOf: Date,
): {
  currentLabel: string;
  compareLabel?: string;
  isPartial: boolean;
  asOfLabel?: string;
  asOfTitle?: string;
} {
  const coverage = getReportCoverage(rp, asOf);
  const currentLabel = coverage.isPartial
    ? formatDateRangeLabel(coverage.start, coverage.end)
    : formatPeriodColumnLabel(rp);

  if (rp.compare === 'none' || !canCompare(rp)) {
    return { currentLabel, isPartial: coverage.isPartial };
  }

  // Partial periods: compare the same coverage window (e.g. Feb 1–13 vs Jan 1–13).
  if (coverage.isPartial) {
    const days = getDaysInRange(coverage.start, coverage.end);

    if (rp.compare === 'prior_year') {
      const compareStart = shiftYearsClamped(coverage.start, -1);
      const compareEnd = shiftYearsClamped(coverage.end, -1);
      return {
        currentLabel,
        compareLabel: formatDateRangeLabel(compareStart, compareEnd),
        isPartial: true,
        asOfLabel: `Through ${formatMonthDay(coverage.end)}`,
        asOfTitle: `Data through ${formatMonthDayYear(coverage.end)}. Comparison uses the same day range.`,
      };
    }

    // prior_period: use the prior period start, then take the same number of days.
    const priorPeriod = getCompareReportPeriod({
      ...rp,
      compare: 'prior_period',
    });
    if (!priorPeriod) {
      return { currentLabel, isPartial: true };
    }
    const priorFull = getFullRangeForPeriod(priorPeriod, asOf);
    const compareStart = priorFull.start;
    const compareEnd = (() => {
      const candidate = addDays(compareStart, days - 1);
      return candidate > priorFull.fullEnd ? priorFull.fullEnd : candidate;
    })();

    return {
      currentLabel,
      compareLabel: formatDateRangeLabel(compareStart, compareEnd),
      isPartial: true,
      asOfLabel: `Through ${formatMonthDay(coverage.end)}`,
      asOfTitle: `Data through ${formatMonthDayYear(coverage.end)}. Comparison uses the same day range.`,
    };
  }

  // Closed periods: compare full prior period / prior year.
  const comparePeriod = getCompareReportPeriod(rp);
  return {
    currentLabel,
    compareLabel: comparePeriod
      ? formatPeriodColumnLabel(comparePeriod)
      : undefined,
    isPartial: false,
  };
}

/**
 * Compute the compare period "shape" as a ReportPeriod (with compare cleared).
 * Used for labelling columns like "Jan 2025" instead of generic "Prior".
 */
export function getCompareReportPeriod(rp: ReportPeriod): ReportPeriod | null {
  if (rp.compare === 'none') return null;
  if (!canCompare(rp)) return null;

  if (rp.compare === 'prior_year') {
    return {
      ...rp,
      compare: 'none',
      anchor: { ...rp.anchor, year: rp.anchor.year - 1 },
      endAnchor: rp.endAnchor
        ? { ...rp.endAnchor, year: rp.endAnchor.year - 1 }
        : undefined,
    };
  }

  // prior_period: step backwards by the current period mode
  const abs = periodToAbsolute(rp.anchor);
  const delta =
    rp.mode === 'quarter'
      ? 3
      : rp.mode === 'month'
        ? 1
        : rp.mode === 'year'
          ? 12
          : rp.mode === 'ytd'
            ? 12
            : 0;

  if (delta === 0) return null;
  const nextAnchor = absoluteToPeriod(abs - delta);

  if (rp.mode === 'quarter') {
    const q = getQuarterForMonth(nextAnchor.monthIdx);
    nextAnchor.monthIdx = getQuarterStartMonth(q);
  }

  return { ...rp, compare: 'none', anchor: nextAnchor };
}

// ---------------------------------------------------------------------------
// Stepping (arrow nav)
// ---------------------------------------------------------------------------

export function periodToAbsolute(p: {
  monthIdx: number;
  year: number;
}): number {
  return p.year * 12 + p.monthIdx;
}

function absoluteToPeriod(abs: number): { monthIdx: number; year: number } {
  const year = Math.floor(abs / 12);
  const monthIdx = abs - year * 12;
  return { monthIdx, year };
}

function clampAbsolute(abs: number, bounds: PeriodBounds): number {
  const min = periodToAbsolute(bounds.earliest);
  const max = periodToAbsolute(bounds.latest);
  return Math.max(min, Math.min(max, abs));
}

export function stepPeriod(
  rp: ReportPeriod,
  direction: 1 | -1,
  bounds: PeriodBounds,
): ReportPeriod {
  if (!canStep(rp)) return rp;

  const abs = periodToAbsolute(rp.anchor);
  let nextAbs: number;

  switch (rp.mode) {
    case 'month':
      nextAbs = abs + direction;
      break;
    case 'quarter':
      nextAbs = abs + direction * 3;
      break;
    case 'year':
    case 'ytd':
      nextAbs = periodToAbsolute({
        monthIdx: rp.anchor.monthIdx,
        year: rp.anchor.year + direction,
      });
      break;
    default:
      return rp;
  }

  nextAbs = clampAbsolute(nextAbs, bounds);
  const nextAnchor = absoluteToPeriod(nextAbs);

  // For quarter mode, snap to quarter start
  if (rp.mode === 'quarter') {
    const q = getQuarterForMonth(nextAnchor.monthIdx);
    nextAnchor.monthIdx = getQuarterStartMonth(q);
  }

  return { ...rp, anchor: nextAnchor };
}

/** Check if stepping in a direction would change anything (for disabling buttons). */
export function canStepInDirection(
  rp: ReportPeriod,
  direction: 1 | -1,
  bounds: PeriodBounds,
): boolean {
  if (!canStep(rp)) return false;
  const stepped = stepPeriod(rp, direction, bounds);
  return (
    stepped.anchor.monthIdx !== rp.anchor.monthIdx ||
    stepped.anchor.year !== rp.anchor.year
  );
}
