import type { Constraint, ConstraintBase } from '../constraints-types.js';

const validExchangeRatesBase: ConstraintBase = {
  code: 'valid_exchange_rates',
  description: 'Exchange rates must be positive numbers',
  scope: 'entry',
} as const;

export const validExchangeRates: Constraint = {
  ...validExchangeRatesBase,

  validate: (ctx) => {
    const violations: Array<{
      code: typeof validExchangeRatesBase.code;
      message: string;
      scope: typeof validExchangeRatesBase.scope;
      severity: 'error';
    }> = [];

    for (const entry of ctx.entries) {
      if (entry.system_exchange_rate !== undefined) {
        if (
          entry.system_exchange_rate <= 0 ||
          !Number.isFinite(entry.system_exchange_rate)
        ) {
          violations.push({
            code: validExchangeRatesBase.code,
            message: `Entry ${entry.id} has invalid system_exchange_rate: ${entry.system_exchange_rate}`,
            scope: validExchangeRatesBase.scope,
            severity: 'error',
          });
        }
      }

      if (entry.custom_exchange_rate !== undefined) {
        if (
          entry.custom_exchange_rate <= 0 ||
          !Number.isFinite(entry.custom_exchange_rate)
        ) {
          violations.push({
            code: validExchangeRatesBase.code,
            message: `Entry ${entry.id} has invalid custom_exchange_rate: ${entry.custom_exchange_rate}`,
            scope: validExchangeRatesBase.scope,
            severity: 'error',
          });
        }
      }
    }

    return violations;
  },
};
