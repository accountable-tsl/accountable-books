/**
 * Report period types and helpers for statement tabs.
 * The period "mode" is inferred from user selection — no separate mode picker.
 */

import { MONTHS } from './constants';

import type { PeriodBounds } from './period-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

/** Whether arrow stepping is meaningful for a given mode. */
export function canStep(rp: ReportPeriod): boolean {
  return rp.mode !== 'trailing12m' && rp.mode !== 'custom';
}

/** Whether comparison is supported for a given mode. */
export function canCompare(rp: ReportPeriod): boolean {
  return rp.mode !== 'trailing12m' && rp.mode !== 'custom';
}

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

// ---------------------------------------------------------------------------
// Stepping (arrow nav)
// ---------------------------------------------------------------------------

function periodToAbsolute(p: { monthIdx: number; year: number }): number {
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
