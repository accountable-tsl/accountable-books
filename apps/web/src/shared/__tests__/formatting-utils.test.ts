import { describe, expect, it } from 'vitest';

import { formatAmountCompact } from '../utils/formatting-utils';

import type { CompactAmountUnit } from '../utils/formatting-utils';

describe('formatAmountCompact', () => {
  describe('default fullUntil: billion', () => {
    it('shows full number below 1 billion', () => {
      expect(formatAmountCompact(0)).toBe('0.00');
      expect(formatAmountCompact(999)).toBe('999.00');
      expect(formatAmountCompact(500_000_000)).toBe('500,000,000.00');
      expect(formatAmountCompact(999_999_999)).toBe('999,999,999.00');
    });

    it('abbreviates at or above 1 billion', () => {
      expect(formatAmountCompact(1_000_000_000)).toBe('1.00B');
      expect(formatAmountCompact(2.5e9)).toBe('2.50B');
      expect(formatAmountCompact(1_000_000_000_000)).toBe('1.00T');
      expect(formatAmountCompact(1.5e12)).toBe('1.50T');
    });
  });

  describe('fullUntil: million', () => {
    const opts = { fullUntil: 'million' as CompactAmountUnit };

    it('shows full number below 1 million', () => {
      expect(formatAmountCompact(999_999, opts)).toBe('999,999.00');
      expect(formatAmountCompact(0, opts)).toBe('0.00');
    });

    it('abbreviates at or above 1 million', () => {
      expect(formatAmountCompact(1_000_000, opts)).toBe('1.00M');
      expect(formatAmountCompact(250_000_000, opts)).toBe('250.00M');
      expect(formatAmountCompact(1_000_000_000, opts)).toBe('1.00B');
      expect(formatAmountCompact(1_000_000_000_000, opts)).toBe('1.00T');
    });
  });

  describe('fullUntil: thousand', () => {
    const opts = { fullUntil: 'thousand' as CompactAmountUnit };

    it('shows full number below 1 thousand', () => {
      expect(formatAmountCompact(999, opts)).toBe('999.00');
      expect(formatAmountCompact(0, opts)).toBe('0.00');
    });

    it('abbreviates at or above 1 thousand', () => {
      expect(formatAmountCompact(1_000, opts)).toBe('1.00K');
      expect(formatAmountCompact(1_500, opts)).toBe('1.50K');
      expect(formatAmountCompact(1_000_000, opts)).toBe('1.00M');
      expect(formatAmountCompact(1_000_000_000, opts)).toBe('1.00B');
      expect(formatAmountCompact(1_000_000_000_000, opts)).toBe('1.00T');
    });
  });

  describe('fullUntil: trillion', () => {
    const opts = { fullUntil: 'trillion' as CompactAmountUnit };

    it('shows full number below 1 trillion', () => {
      expect(formatAmountCompact(999_999_999_999, opts)).toBe(
        '999,999,999,999.00',
      );
      expect(formatAmountCompact(1_000_000_000, opts)).toBe('1,000,000,000.00');
    });

    it('abbreviates at or above 1 trillion', () => {
      expect(formatAmountCompact(1_000_000_000_000, opts)).toBe('1.00T');
      expect(formatAmountCompact(2.5e12, opts)).toBe('2.50T');
    });
  });

  describe('negative values', () => {
    it('preserves sign for full format', () => {
      expect(formatAmountCompact(-500_000_000)).toBe('-500,000,000.00');
    });

    it('preserves sign for abbreviated format', () => {
      expect(formatAmountCompact(-1_000_000_000)).toBe('-1.00B');
      expect(formatAmountCompact(-2.5e9)).toBe('-2.50B');
      expect(formatAmountCompact(-1_000_000, { fullUntil: 'million' })).toBe(
        '-1.00M',
      );
    });
  });

  describe('options', () => {
    it('respects decimals', () => {
      expect(formatAmountCompact(1.234e9, { decimals: 0 })).toBe('1B');
      expect(formatAmountCompact(1.234e9, { decimals: 1 })).toBe('1.2B');
      expect(formatAmountCompact(1.234e9, { decimals: 3 })).toBe('1.234B');
    });

    it('respects locale for full-format output', () => {
      // en-US uses comma as thousands separator
      expect(formatAmountCompact(1_000_000, { fullUntil: 'billion' })).toBe(
        '1,000,000.00',
      );
      // de-DE uses period for thousands and comma for decimals
      expect(
        formatAmountCompact(1_000_000, {
          fullUntil: 'billion',
          locale: 'de-DE',
        }),
      ).toBe('1.000.000,00');
    });

    it('abbreviated format does not depend on locale (fixed suffix)', () => {
      expect(
        formatAmountCompact(1e9, { fullUntil: 'billion', locale: 'de-DE' }),
      ).toBe('1.00B');
    });
  });

  describe('edge cases', () => {
    it('handles zero', () => {
      expect(formatAmountCompact(0)).toBe('0.00');
      expect(formatAmountCompact(0, { fullUntil: 'thousand' })).toBe('0.00');
    });

    it('handles exact threshold values', () => {
      expect(formatAmountCompact(1e3, { fullUntil: 'thousand' })).toBe('1.00K');
      expect(formatAmountCompact(1e6, { fullUntil: 'million' })).toBe('1.00M');
      expect(formatAmountCompact(1e9)).toBe('1.00B');
      expect(formatAmountCompact(1e12, { fullUntil: 'trillion' })).toBe(
        '1.00T',
      );
    });

    it('chooses largest applicable unit when above threshold', () => {
      expect(formatAmountCompact(1.2e12)).toBe('1.20T');
      expect(formatAmountCompact(1.2e9)).toBe('1.20B');
      expect(formatAmountCompact(1.2e6, { fullUntil: 'million' })).toBe(
        '1.20M',
      );
    });
  });
});
