import { describe, expect, it } from 'vitest';

import {
  buildMonthKey,
  getActiveCompRecord,
  getCompStartPolicy,
  getNextMonthKey,
  getPreviousMonthKey,
  hasFinalizedOverlap,
  needsFutureStartConfirm,
} from './comp-history-utils';

describe('comp history utils', () => {
  it('buildMonthKey normalizes month input', () => {
    expect(buildMonthKey('2', '2026')).toBe('2026-02');
    expect(buildMonthKey('13', '2026')).toBeUndefined();
  });

  it('finds active record by period and falls back to current', () => {
    const history = [
      { fromMonth: '2026-01', toMonth: '2026-03', isCurrent: false },
      { fromMonth: '2026-04', toMonth: undefined, isCurrent: true },
    ];
    expect(getActiveCompRecord(history, '2026-02')).toEqual(history[0]);
    expect(getActiveCompRecord(history, '2027-01')).toEqual(history[1]);
  });

  it('computes next start for ended record', () => {
    const policy = getCompStartPolicy({
      activeRecord: { fromMonth: '2026-01', toMonth: '2026-03' },
      periodKey: '2026-02',
    });
    expect(policy.nextStartKey).toBe('2026-04');
    expect(policy.autoEndKey).toBeUndefined();
    expect(policy.startLocked).toBe(true);
  });

  it('computes auto-end for open-ended record', () => {
    const policy = getCompStartPolicy({
      activeRecord: { fromMonth: '2026-01' },
      periodKey: '2026-02',
    });
    expect(policy.nextStartKey).toBe('2026-02');
    expect(policy.autoEndKey).toBe('2026-01');
  });

  it('moves start to next month when open-ended starts after run', () => {
    const policy = getCompStartPolicy({
      activeRecord: { fromMonth: '2026-03' },
      periodKey: '2026-02',
    });
    expect(policy.nextStartKey).toBe('2026-03');
    expect(policy.autoEndKey).toBe('2026-02');
  });

  it('checks finalized overlap in range', () => {
    const finalized = ['2026-01', '2026-03'];
    expect(hasFinalizedOverlap('2026-02', '2026-04', finalized)).toBe(true);
    expect(hasFinalizedOverlap('2027-01', undefined, finalized)).toBe(false);
  });

  it('requires confirmation when start is after run period', () => {
    expect(needsFutureStartConfirm('2026-04', '2026-03', false)).toBe(true);
    expect(needsFutureStartConfirm('2026-04', '2026-03', true)).toBe(false);
  });

  it('handles next/previous month helpers', () => {
    expect(getNextMonthKey('2026-12')).toBe('2027-01');
    expect(getPreviousMonthKey('2026-01')).toBe('2025-12');
  });
});
