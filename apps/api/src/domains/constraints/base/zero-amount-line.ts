import type { Constraint, ConstraintBase } from '../constraints-types.js';

const zeroAmountLineBase: ConstraintBase = {
  code: 'zero_amount_line',
  description: 'No entry can have zero amount',
  scope: 'entry',
} as const;

export const zeroAmountLine: Constraint = {
  ...zeroAmountLineBase,

  validate: (ctx) => {
    const violations = ctx.entries
      .filter((e) => Math.abs(e.amount) < 1e-6)
      .map((e) => ({
        code: zeroAmountLineBase.code,
        message: `Entry ${e.id} has zero amount`,
        scope: zeroAmountLineBase.scope,
        severity: 'error' as const,
      }));

    return violations;
  },
};
