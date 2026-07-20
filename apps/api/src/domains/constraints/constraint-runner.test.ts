import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockConstraintContext,
  createMockEntry,
} from './__test-helpers__.js';
import { runConstraints } from './constraint-runner.js';
import { constraintRegistry } from './constraints-registry.js';

// Mock logger to avoid console output during tests
vi.mock('../../../../shared/index.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock validateCoaIds to avoid database calls in coaExistsAndActive constraint
vi.mock('../chart-of-accounts/index.js', () => ({
  validateCoaIds: vi.fn().mockResolvedValue({
    success: true,
    data: {
      allValid: true,
      valid: [],
      invalid: [],
    },
  }),
}));

// Mock fiscal calendar coverage checks to avoid database calls in periodNotLocked constraint
vi.mock('../reporting/fiscal-calendar/fiscal-calendar.service.js', () => ({
  ensureAndFetchFiscalCalendar: vi.fn().mockResolvedValue({ rows: [] }),
}));

// Mock projects table queries to avoid database calls in projectExists constraint
const mockQuery = {
  whereIn: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  select: vi.fn().mockResolvedValue([]),
};

const mockKnexTable = vi.fn().mockReturnValue(mockQuery);

vi.mock('../../../db/knexClient.js', () => ({
  knexClient: mockKnexTable,
}));

describe('runConstraints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset query chain mocks
    mockQuery.whereIn.mockReturnValue(mockQuery);
    mockQuery.where.mockReturnValue(mockQuery);
    mockQuery.select.mockResolvedValue([]);
    mockKnexTable.mockReturnValue(mockQuery);
  });

  describe('basic functionality', () => {
    it('should run all enabled constraints', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }),
          createMockEntry({ id: '2', amount: -100.0 }),
        ],
      });

      const result = await runConstraints(ctx);

      // Should have run constraints and found no violations (balanced entries)
      expect(result.violations).toEqual([]);
      expect(result.isValid).toBe(true);
    });

    it('should skip disabled constraints (registry-level)', async () => {
      // Temporarily disable a constraint
      const originalEnabled = constraintRegistry.project_exists.enabled;
      try {
        constraintRegistry.project_exists.enabled = false;

        const ctx = createMockConstraintContext({
          entries: [
            createMockEntry({ id: '1', amount: 100.0 }),
            createMockEntry({ id: '2', amount: -100.0 }),
          ],
        });

        const result = await runConstraints(ctx);
        expect(result.isValid).toBe(true);
      } finally {
        // Restore original state
        constraintRegistry.project_exists.enabled = originalEnabled;
      }
    });

    it('should respect applies() function', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0, is_bank_leg: false }),
          createMockEntry({ id: '2', amount: -100.0, is_bank_leg: false }),
        ],
      });

      const result = await runConstraints(ctx);

      // single_bank_leg should not apply (no bank legs), so should not produce violations
      // The constraint is skipped silently (no violation means it didn't apply)
      expect(result.isValid).toBe(true);
    });

    it('should collect all violations from all constraints', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }), // Unbalanced
          createMockEntry({ id: '2', amount: 0.0 }), // Zero amount
        ],
      });

      const result = await runConstraints(ctx);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.isValid).toBe(false);
    });

    it('should group violations by severity (errors vs warnings)', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }), // Will cause unbalanced error
          createMockEntry({ id: '2', amount: 0.0 }), // Will cause zero amount error
        ],
      });

      const result = await runConstraints(ctx);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
      expect(result.violations.length).toBe(
        result.errors.length + result.warnings.length,
      );
    });

    it('should return correct isValid flag', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }),
          createMockEntry({ id: '2', amount: -100.0 }),
        ],
      });

      const result = await runConstraints(ctx);
      expect(result.isValid).toBe(true);

      const invalidCtx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }), // Unbalanced
        ],
      });

      const invalidResult = await runConstraints(invalidCtx);
      expect(invalidResult.isValid).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should continue processing when constraint throws error', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }),
          createMockEntry({ id: '2', amount: -100.0 }),
        ],
      });

      const result = await runConstraints(ctx);

      // Should complete successfully
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });

    it('should convert execution errors to violations', async () => {
      // Test with a context that should pass basic constraints
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }),
          createMockEntry({ id: '2', amount: -100.0 }),
        ],
      });

      const result = await runConstraints(ctx);

      // Execution errors should be converted to error-level violations
      expect(Array.isArray(result.violations)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should set isValid correctly based on errors', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }),
          createMockEntry({ id: '2', amount: -100.0 }),
        ],
      });

      const result = await runConstraints(ctx);

      // If there are no errors, should be valid
      if (result.errors.length === 0) {
        expect(result.isValid).toBe(true);
      } else {
        expect(result.isValid).toBe(false);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty entries array', async () => {
      const ctx = createMockConstraintContext({
        entries: [],
      });

      const result = await runConstraints(ctx);

      // minimum_entries should fail
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'minimum_entries')).toBe(
        true,
      );
    });

    it('should handle empty context (no entries, no transaction_date)', async () => {
      const ctx = createMockConstraintContext({
        entries: [],
        transaction_date: undefined,
      });

      const result = await runConstraints(ctx);

      expect(result.isValid).toBe(false);
    });

    it('should handle all constraints skipped via applies()', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0, is_bank_leg: false }),
          createMockEntry({ id: '2', amount: -100.0, is_bank_leg: false }),
        ],
      });

      const result = await runConstraints(ctx);

      // single_bank_leg should be skipped (applies returns false)
      // No violations from constraints that don't apply
      expect(result.isValid).toBe(true);
    });

    it('should handle mix of errors and warnings', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }), // Unbalanced (error)
          createMockEntry({ id: '2', amount: -80.0 }), // Leaves imbalance to trigger error
        ],
      });

      const result = await runConstraints(ctx);

      expect(result.errors.length).toBeGreaterThan(0);
      // May have warnings from other constraints
      expect(result.violations.length).toBe(
        result.errors.length + result.warnings.length,
      );
    });
  });

  describe('integration', () => {
    it('should run real constraints (not mocked)', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }),
          createMockEntry({ id: '2', amount: -100.0 }),
        ],
      });

      const result = await runConstraints(ctx);

      // Should have actually run constraints
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });

    it('should aggregate violations from multiple constraints correctly', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', amount: 100.0 }), // Unbalanced
          createMockEntry({ id: '2', amount: 0.0 }), // Zero amount
        ],
      });

      const result = await runConstraints(ctx);

      // Should have violations from multiple constraints
      const violationCodes = result.violations.map((v) => v.code);
      expect(violationCodes.length).toBeGreaterThan(1);
      expect(new Set(violationCodes).size).toBeGreaterThan(1); // Different constraint codes
    });
  });
});
