import { validateCoaIds } from '../../chart-of-accounts/index.js';
import type { Constraint, ConstraintBase } from '../constraints-types.js';

const coaExistsAndActiveBase: ConstraintBase = {
  code: 'invalid_account',
  description: 'Account must exist, and be active (not archived)',
  scope: 'entry',
} as const;

export const coaExistsAndActive: Constraint = {
  ...coaExistsAndActiveBase,

  validate: async (ctx) => {
    const coaIds = ctx.entries.map((e) => e.coa_id);
    const uniqueCoaIds = Array.from(new Set(coaIds));

    if (uniqueCoaIds.length === 0) {
      return [];
    }
    const x = await validateCoaIds({
      coaIds: uniqueCoaIds,
      companyId: ctx.companyUUID,
      trx: ctx.trx,
    });

    // Handle validation failure (e.g., database error)
    if (!x.success) {
      const baseMessage = 'Failed to validate accounts';
      return [
        {
          code: coaExistsAndActiveBase.code,
          message: x.message ? `${baseMessage}: ${x.message}` : baseMessage,
          scope: coaExistsAndActiveBase.scope,
          severity: 'error' as const,
        },
      ];
    }

    // Handle invalid accounts - check if data exists and allValid is false
    if (
      x.data &&
      !x.data.allValid &&
      x.data.invalid &&
      x.data.invalid.length > 0
    ) {
      return x.data.invalid.map((coa) => ({
        code: coaExistsAndActiveBase.code,
        message: `Account ${coa.id} - ${coa.status}`,
        scope: coaExistsAndActiveBase.scope,
        severity: 'error' as const,
      }));
    }

    return [];
  },
};
