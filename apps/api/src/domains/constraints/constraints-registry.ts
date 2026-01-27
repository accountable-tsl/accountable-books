/**
 * Constraints Registry
 *
 * Central registry of all accounting constraints with enable/disable support.
 *
 * @example Basic Usage
 * ```typescript
 * import { getEnabledConstraints } from './constraints-registry';
 *
 * const constraints = getEnabledConstraints();
 * for (const constraint of constraints) {
 *   const violations = await constraint.validate(context);
 *   // Handle violations
 * }
 * ```
 *
 * @example Managing Constraints
 * ```typescript
 * import { setConstraintEnabled, canDisableConstraint } from './constraints-registry';
 *
 * // Check if constraint can be disabled
 * if (canDisableConstraint('period_not_locked')) {
 *   // Temporarily disable for data migration
 *   setConstraintEnabled('period_not_locked', false);
 * }
 * ```
 */

import { coaExistsAndActive } from './base/coa-exists.js';
import { debitsEqualCredits } from './base/debits-equal-credits.js';
import { minimumEntries } from './base/minimum-entries.js';
import { periodNotLocked } from './base/period-not-locked.js';
import { projectExists } from './base/project-exists.js';
import { singleBankLeg } from './base/single-bank-leg.js';
import { validExchangeRates } from './base/valid-exchange-rates.js';
import { zeroAmountLine } from './base/zero-amount-line.js';

import type { Constraint, ConstraintCode } from './constraints-types.js';

export interface ConstraintRegistryEntry {
  constraint: Constraint;
  enabled: boolean;
  canDisable: boolean;
}

/**
 * Registry of all available constraints with their configuration.
 * Constraints can be enabled/disabled and some can be relaxed (canDisable: true).
 */
export const constraintRegistry: Record<
  ConstraintCode,
  ConstraintRegistryEntry
> = {
  // Critical constraints - cannot be disabled
  unbalanced_entries: {
    constraint: debitsEqualCredits,
    enabled: true,
    canDisable: false,
  },
  invalid_account: {
    constraint: coaExistsAndActive,
    enabled: true,
    canDisable: false,
  },
  zero_amount_line: {
    constraint: zeroAmountLine,
    enabled: true,
    canDisable: false,
  },
  minimum_entries: {
    constraint: minimumEntries,
    enabled: true,
    canDisable: false,
  },

  // Important constraints - can be relaxed/disabled
  period_not_locked: {
    constraint: periodNotLocked,
    enabled: true,
    canDisable: true,
  },
  single_bank_leg: {
    constraint: singleBankLeg,
    enabled: true,
    canDisable: true,
  },
  valid_exchange_rates: {
    constraint: validExchangeRates,
    enabled: false,
    canDisable: true,
  },

  // Optional constraints - can be disabled
  project_exists: {
    constraint: projectExists,
    enabled: false,
    canDisable: true,
  },
};

/**
 * Get all enabled constraints from the registry
 */
export function getEnabledConstraints(): Constraint[] {
  return Object.values(constraintRegistry)
    .filter((entry) => entry.enabled)
    .map((entry) => entry.constraint);
}

/**
 * Get a specific constraint by code
 */
export function getConstraint(code: ConstraintCode): Constraint | undefined {
  return constraintRegistry[code]?.constraint;
}

/**
 * Check if a constraint can be disabled
 */
export function canDisableConstraint(code: ConstraintCode): boolean {
  return constraintRegistry[code]?.canDisable ?? false;
}

/**
 * Enable or disable a constraint (only if canDisable is true)
 */
export function setConstraintEnabled(
  code: ConstraintCode,
  enabled: boolean,
): { success: boolean; message: string } {
  const entry = constraintRegistry[code];
  if (!entry) {
    return { success: false, message: `Constraint ${code} not found` };
  }

  if (!enabled && !entry.canDisable) {
    return {
      success: false,
      message: `Constraint ${code} cannot be disabled`,
    };
  }

  entry.enabled = enabled;
  return {
    success: true,
    message: `Constraint ${code} ${enabled ? 'enabled' : 'disabled'}`,
  };
}

/**
 * Format constraint code for human-readable display
 */
export function formatConstraintCode(code: ConstraintCode): string {
  const entry = constraintRegistry[code];
  if (entry) {
    return entry.constraint.description || code;
  }
  // Fallback: convert snake_case to Title Case
  return code
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
