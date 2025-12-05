import type { Constraint, ConstraintBase } from '../constraints-types.js';

const minimumEntriesBase: ConstraintBase = {
  code: 'minimum_entries',
  description: 'At least 2 entries required for double-entry bookkeeping',
  scope: 'head',
} as const;

export const minimumEntries: Constraint = {
  ...minimumEntriesBase,

  validate: (ctx) => {
    if (ctx.entries.length < 2) {
      return [
        {
          code: minimumEntriesBase.code,
          message: `${minimumEntriesBase.description} (found: ${ctx.entries.length})`,
          scope: minimumEntriesBase.scope,
          severity: 'error' as const,
        },
      ];
    }
    return [];
  },
};
