import { beforeEach, describe, expect, it } from 'vitest';

import {
  canDisableConstraint,
  constraintRegistry,
  formatConstraintCode,
  getConstraint,
  getEnabledConstraints,
  setConstraintEnabled,
} from './constraints-registry.js';

describe('constraintRegistry', () => {
  // Reset registry state before each test
  beforeEach(() => {
    // Re-enable all constraints that might have been disabled
    for (const code of Object.keys(constraintRegistry)) {
      const entry = constraintRegistry[code as keyof typeof constraintRegistry];
      if (entry && entry.canDisable) {
        entry.enabled = true;
      }
    }
  });

  describe('registry structure', () => {
    it('should export all 8 constraints', () => {
      const constraintCodes = Object.keys(constraintRegistry);
      expect(constraintCodes).toHaveLength(8);
      expect(constraintCodes).toEqual(
        expect.arrayContaining([
          'unbalanced_entries',
          'invalid_account',
          'zero_amount_line',
          'minimum_entries',
          'period_not_locked',
          'single_bank_leg',
          'project_exists',
          'valid_exchange_rates',
        ]),
      );
    });

    it('should mark critical constraints as non-disablable', () => {
      const criticalConstraints = [
        'unbalanced_entries',
        'invalid_account',
        'zero_amount_line',
        'minimum_entries',
      ];

      for (const code of criticalConstraints) {
        const entry =
          constraintRegistry[code as keyof typeof constraintRegistry];
        expect(entry?.canDisable).toBe(false);
        expect(entry?.enabled).toBe(true);
      }
    });

    it('should mark relaxable constraints as disablable', () => {
      const relaxableConstraints = [
        'period_not_locked',
        'single_bank_leg',
        'valid_exchange_rates',
        'project_exists',
      ];

      for (const code of relaxableConstraints) {
        const entry =
          constraintRegistry[code as keyof typeof constraintRegistry];
        expect(entry?.canDisable).toBe(true);
        expect(entry?.enabled).toBe(true);
      }
    });
  });

  describe('getEnabledConstraints', () => {
    it('should return all enabled constraints by default', () => {
      const enabled = getEnabledConstraints();
      expect(enabled).toHaveLength(8);
    });

    it('should exclude disabled constraints', () => {
      // Disable a relaxable constraint
      setConstraintEnabled('period_not_locked', false);

      const enabled = getEnabledConstraints();
      expect(enabled).toHaveLength(7);

      const codes = enabled.map((c) => c.code);
      expect(codes).not.toContain('period_not_locked');
    });
  });

  describe('getConstraint', () => {
    it('should return constraint by code', () => {
      const constraint = getConstraint('unbalanced_entries');
      expect(constraint).toBeDefined();
      expect(constraint?.code).toBe('unbalanced_entries');
    });

    it('should return undefined for non-existent constraint', () => {
      const constraint = getConstraint('non_existent' as any);
      expect(constraint).toBeUndefined();
    });
  });

  describe('canDisableConstraint', () => {
    it('should return false for critical constraints', () => {
      expect(canDisableConstraint('unbalanced_entries')).toBe(false);
      expect(canDisableConstraint('invalid_account')).toBe(false);
      expect(canDisableConstraint('zero_amount_line')).toBe(false);
      expect(canDisableConstraint('minimum_entries')).toBe(false);
    });

    it('should return true for relaxable constraints', () => {
      expect(canDisableConstraint('period_not_locked')).toBe(true);
      expect(canDisableConstraint('single_bank_leg')).toBe(true);
      expect(canDisableConstraint('valid_exchange_rates')).toBe(true);
      expect(canDisableConstraint('project_exists')).toBe(true);
    });

    it('should return false for non-existent constraint', () => {
      expect(canDisableConstraint('non_existent' as any)).toBe(false);
    });
  });

  describe('setConstraintEnabled', () => {
    it('should prevent disabling critical constraints', () => {
      const result = setConstraintEnabled('unbalanced_entries', false);
      expect(result.success).toBe(false);
      expect(result.message).toContain('cannot be disabled');

      // Verify constraint is still enabled
      expect(constraintRegistry.unbalanced_entries.enabled).toBe(true);
    });

    it('should allow disabling relaxable constraints', () => {
      const result = setConstraintEnabled('period_not_locked', false);
      expect(result.success).toBe(true);
      expect(result.message).toContain('disabled');

      // Verify constraint is disabled
      expect(constraintRegistry.period_not_locked.enabled).toBe(false);
    });

    it('should allow re-enabling relaxable constraints', () => {
      // First disable
      setConstraintEnabled('single_bank_leg', false);
      expect(constraintRegistry.single_bank_leg.enabled).toBe(false);

      // Then re-enable
      const result = setConstraintEnabled('single_bank_leg', true);
      expect(result.success).toBe(true);
      expect(result.message).toContain('enabled');
      expect(constraintRegistry.single_bank_leg.enabled).toBe(true);
    });

    it('should return error for non-existent constraint', () => {
      const result = setConstraintEnabled('non_existent' as any, false);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('formatConstraintCode', () => {
    it('should format constraint codes to human-readable strings', () => {
      expect(formatConstraintCode('unbalanced_entries')).toBe(
        'Sum of signed amounts must be zero. Debits must equal credits',
      );
      expect(formatConstraintCode('invalid_account')).toBe(
        'Account must exist, and be active (not archived)',
      );
      expect(formatConstraintCode('zero_amount_line')).toBe(
        'No entry can have zero amount',
      );
    });

    it('should fallback to Title Case for non-existent constraints', () => {
      const result = formatConstraintCode('custom_constraint' as any);
      expect(result).toBe('Custom Constraint');
    });

    it('should handle single-word constraint codes', () => {
      const result = formatConstraintCode('test' as any);
      expect(result).toBe('Test');
    });
  });
});
