import { describe, expect, it } from 'vitest';

import {
  advanceRunDate,
  computeNextAlignedRunDate,
} from '../recurring-templates.schedule.js';

describe('recurring templates schedule', () => {
  it('daily aligns to today when start is in the past', () => {
    const runDate = computeNextAlignedRunDate({
      startYMD: '2024-01-01',
      frequency: 'daily',
      todayYMD: '2024-01-10',
    });
    expect(runDate).toBe('2024-01-10');
  });

  it('uses today when startDateYMD is today', () => {
    const runDate = computeNextAlignedRunDate({
      startYMD: '2024-01-10',
      frequency: 'daily',
      todayYMD: '2024-01-10',
    });
    expect(runDate).toBe('2024-01-10');
  });

  it('weekly aligns to the next matching weekday', () => {
    const runDate = computeNextAlignedRunDate({
      startYMD: '2024-01-01', // Monday
      frequency: 'weekly',
      todayYMD: '2024-01-03', // Wednesday
    });
    expect(runDate).toBe('2024-01-08'); // next Monday
  });

  it('monthly clamps to month-end for short months', () => {
    const runDate = computeNextAlignedRunDate({
      startYMD: '2024-01-31',
      frequency: 'monthly',
      todayYMD: '2024-02-15',
    });
    expect(runDate).toBe('2024-02-29');
  });

  it('yearly clamps Feb 29 to Feb 28 on non-leap years', () => {
    const runDate = computeNextAlignedRunDate({
      startYMD: '2024-02-29',
      frequency: 'yearly',
      todayYMD: '2025-02-01',
    });
    expect(runDate).toBe('2025-02-28');
  });

  it('advanceRunDate increments by frequency', () => {
    expect(advanceRunDate({ fromYMD: '2024-01-01', frequency: 'daily' })).toBe(
      '2024-01-02',
    );
    expect(advanceRunDate({ fromYMD: '2024-01-01', frequency: 'weekly' })).toBe(
      '2024-01-08',
    );
    expect(
      advanceRunDate({ fromYMD: '2024-01-31', frequency: 'monthly' }),
    ).toBe('2024-02-29');
    expect(advanceRunDate({ fromYMD: '2024-02-29', frequency: 'yearly' })).toBe(
      '2025-02-28',
    );
  });
});
