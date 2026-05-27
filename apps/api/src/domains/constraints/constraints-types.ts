import type { Knex } from 'knex';
import z from 'zod';

export const constraintCode = z.enum([
  'unbalanced_entries',
  'invalid_account',
  'period_not_locked',
  'zero_amount_line',
  'minimum_entries',
  'single_bank_leg',
  'project_exists',
  'valid_exchange_rates',
]);
export const constraintScope = z.enum(['entry', 'head']);
export const constraintSeverity = z.enum(['warning', 'error']);

const entryObj = z.object({
  id: z.string().optional(),
  amount: z.number(),
  coa_id: z.string(),
  fs_date: z.string().optional(), // YYYY-MM-DD format
  project_id: z.uuid().nullable().optional(),
  is_bank_leg: z.boolean().optional(),
  system_exchange_rate: z.number().optional(),
  custom_exchange_rate: z.number().optional(),
});
const constraintContext = z.object({
  companyUUID: z.string(),
  entries: z.array(entryObj),
  transaction_date: z.string().optional(), // YYYY-MM-DD format
});

export const constraintBase = z.object({
  code: constraintCode,
  description: z.string(),
  scope: constraintScope,
});
export type ConstraintBase = z.infer<typeof constraintBase>;

const constraintResult = z.object({
  ...constraintBase.omit({ description: true }).shape,
  message: z.string(),
  severity: constraintSeverity,
});

export const constraint = z.object({
  ...constraintBase.shape,

  applies: z
    .function({
      input: [constraintContext],
      output: z.boolean(),
    })
    .optional(),

  validate: z.function({
    input: [constraintContext],
  }),
});

// Define the proper TypeScript types
export type ConstraintResult = z.infer<typeof constraintResult>;
export type ConstraintContext = z.infer<typeof constraintContext> & {
  trx?: Knex.Transaction;
};
export type ConstraintCode = z.infer<typeof constraintCode>;
export type ConstraintScope = z.infer<typeof constraintScope>;
export type ConstraintSeverity = z.infer<typeof constraintSeverity>;

export type Constraint = {
  code: ConstraintCode;
  description: string;
  scope: ConstraintScope;
  applies?: (ctx: ConstraintContext) => boolean;
  validate: (
    ctx: ConstraintContext,
  ) => ConstraintResult[] | Promise<ConstraintResult[]>;
};
