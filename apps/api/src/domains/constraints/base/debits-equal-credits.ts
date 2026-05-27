import type { Constraint, ConstraintBase } from '../constraints-types.js';

const debitsEqualCreditsBase: ConstraintBase = {
  code: 'unbalanced_entries',
  description: 'Sum of signed amounts must be zero. Debits must equal credits',
  scope: 'entry',
} as const;

export const debitsEqualCredits: Constraint = {
  ...debitsEqualCreditsBase,

  validate: (ctx) => {
    const total = ctx.entries.reduce((sum, e) => sum + e.amount, 0);
    if (Math.abs(total) > 1e-6) {
      return [
        {
          code: debitsEqualCreditsBase.code,
          message: `${debitsEqualCreditsBase.description} (off by: ${total.toFixed(2)})`,
          scope: 'entry',
          severity: 'error',
        },
      ];
    }
    return [];
  },
};
