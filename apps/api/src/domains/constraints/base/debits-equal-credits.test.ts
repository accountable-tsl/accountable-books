import { describe, expect, it } from 'vitest';

import {
  createMockConstraintContext,
  createMockEntry,
} from '../__test-helpers__.js';
import { debitsEqualCredits } from './debits-equal-credits.js';

describe('debitsEqualCredits constraint', () => {
  describe('valid cases', () => {
    it('should pass when debits equal credits (sum is zero)', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }),
          createMockEntry({ id: '2', amount: -100.0 }),
        ],
      });

      const result = await debitsEqualCredits.validate(ctx);
      expect(result).toEqual([]);
    });

    it('should pass with many entries that balance', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 50.0 }),
          createMockEntry({ id: '2', amount: 75.0 }),
          createMockEntry({ id: '3', amount: 25.0 }),
          createMockEntry({ id: '4', amount: -100.0 }),
          createMockEntry({ id: '5', amount: -50.0 }),
        ],
      });

      const result = await debitsEqualCredits.validate(ctx);
      expect(result).toEqual([]);
    });

    it('should pass with very small rounding differences within tolerance', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }),
          createMockEntry({ id: '2', amount: -100.0000001 }),
        ],
      });

      const result = await debitsEqualCredits.validate(ctx);
      expect(result).toEqual([]);
    });

    it('should pass with large amounts', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 1_000_000.0 }),
          createMockEntry({ id: '2', amount: -1_000_000.0 }),
        ],
      });

      const result = await debitsEqualCredits.validate(ctx);
      expect(result).toEqual([]);
    });
  });

  describe('invalid cases', () => {
    it('should fail when debits exceed credits (positive difference)', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }),
          createMockEntry({ id: '2', amount: -50.0 }),
        ],
      });

      const result = await debitsEqualCredits.validate(ctx);
      expect(result).toHaveLength(1);
      expect(result[0]?.code).toBe('unbalanced_entries');
      expect(result[0]?.severity).toBe('error');
      expect(result[0]?.message).toContain('off by: 50.00');
    });

    it('should fail when credits exceed debits (negative difference)', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 50.0 }),
          createMockEntry({ id: '2', amount: -100.0 }),
        ],
      });

      const result = await debitsEqualCredits.validate(ctx);
      expect(result).toHaveLength(1);
      expect(result[0]?.code).toBe('unbalanced_entries');
      expect(result[0]?.severity).toBe('error');
      expect(result[0]?.message).toContain('off by: -50.00');
    });

    it('should fail with single entry', async () => {
      const ctx = createMockConstraintContext({
        entries: [createMockEntry({ id: '1', amount: 100.0 })],
      });

      const result = await debitsEqualCredits.validate(ctx);
      expect(result).toHaveLength(1);
      expect(result[0]?.code).toBe('unbalanced_entries');
      expect(result[0]?.severity).toBe('error');
    });
  });
});
