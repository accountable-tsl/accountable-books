import type { Constraint, ConstraintBase } from '../constraints-types.js';

const singleBankLegBase: ConstraintBase = {
  code: 'single_bank_leg',
  description:
    'Exactly one bank leg required for bank transaction categorizations',
  scope: 'head',
} as const;

export const singleBankLeg: Constraint = {
  ...singleBankLegBase,

  // Only applies when there are bank legs (for bank transaction categorizations)
  applies: (ctx) => {
    const bankLegCount = ctx.entries.filter((e) => e.is_bank_leg).length;
    return bankLegCount > 0;
  },

  validate: (ctx) => {
    const bankLegs = ctx.entries.filter((e) => e.is_bank_leg);
    const bankLegCount = bankLegs.length;

    if (bankLegCount !== 1) {
      return [
        {
          code: singleBankLegBase.code,
          message: `Expected exactly one bank leg, found ${bankLegCount}`,
          scope: singleBankLegBase.scope,
          severity: 'error' as const,
        },
      ];
    }
    return [];
  },
};
