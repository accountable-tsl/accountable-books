import type { Knex } from 'knex';

import { logger } from '../../shared/index.js';
import { constraintRegistry } from './constraints-registry.js';
import type {
  ConstraintContext,
  ConstraintResult,
} from './constraints-types.js';

export interface ConstraintValidationResult {
  isValid: boolean; // false if any errors exist
  violations: ConstraintResult[];
  errors: ConstraintResult[]; // severity === 'error'
  warnings: ConstraintResult[]; // severity === 'warning'
}

/**
 * Run all enabled constraints against the provided context.
 *
 * @param ctx - The constraint context containing company UUID, entries, and optional transaction date
 * @param trx - Optional database transaction to use for constraint queries
 * @returns Promise resolving to validation results with all violations collected
 */
export async function runConstraints(
  ctx: ConstraintContext,
  trx?: Knex.Transaction,
): Promise<ConstraintValidationResult> {
  // Add transaction to context so constraints can use it
  // Preserve any existing trx in ctx if the parameter is not provided
  const contextWithTrx: ConstraintContext = {
    ...ctx,
    trx: trx ?? ctx.trx,
  };

  // Get all enabled constraints from registry
  const enabledConstraints = Object.values(constraintRegistry)
    .filter((entry) => entry.enabled)
    .map((entry) => entry.constraint);

  logger.debug(
    {
      companyUUID: ctx.companyUUID,
      entriesCount: ctx.entries.length,
      enabledConstraintsCount: enabledConstraints.length,
      hasTransaction: !!trx,
    },
    'Running constraints validation',
  );

  const violations: ConstraintResult[] = [];

  // Run each constraint
  for (const constraint of enabledConstraints) {
    try {
      // Check if constraint applies to this context
      if (constraint.applies && !constraint.applies(contextWithTrx)) {
        logger.debug(
          { constraintCode: constraint.code },
          `Constraint ${constraint.code} does not apply to context`,
        );
        continue;
      }

      // Run the constraint validation
      const constraintViolations = await constraint.validate(contextWithTrx);

      if (constraintViolations.length > 0) {
        violations.push(...constraintViolations);
        logger.debug(
          {
            constraintCode: constraint.code,
            violationsCount: constraintViolations.length,
          },
          `Constraint ${constraint.code} found ${constraintViolations.length} violation(s)`,
        );
      }
    } catch (error) {
      // Log error and create error-level violation, then continue processing other constraints
      const err = error instanceof Error ? error : new Error(String(error));
      violations.push({
        code: constraint.code,
        scope: constraint.scope,
        severity: 'error',
        message: `Constraint execution failed: ${err.message}`,
      });
      logger.error(
        {
          constraintCode: constraint.code,
          error: err.message,
          stack: err.stack,
        },
        `Constraint ${constraint.code} threw an error during validation`,
      );
    }
  }

  // Group violations by severity
  const errors = violations.filter((v) => v.severity === 'error');
  const warnings = violations.filter((v) => v.severity === 'warning');

  // Result is invalid if there are any errors
  const isValid = errors.length === 0;

  logger.debug(
    {
      companyUUID: ctx.companyUUID,
      isValid,
      totalViolations: violations.length,
      errorsCount: errors.length,
      warningsCount: warnings.length,
    },
    'Constraints validation completed',
  );

  return {
    isValid,
    violations,
    errors,
    warnings,
  };
}
