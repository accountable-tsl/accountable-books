import { z } from 'zod';
import { dbStandardFields } from '../../../core/types/core.js';

export const bankOpeningBalanceOrigin = z.enum([
  'user_entered', // Manually set by the user
  'system_calculated', // Inferred by the system or calculated
  'system_snapshot',
]);

export const bankOpeningBalanceRole = z.enum([
  'baseline',
  'checkpoint',
  'archived',
]);
export type BankOpeningBalanceRole = z.infer<typeof bankOpeningBalanceRole>;

export const bankObMetadata = z
  .object({
    // WHERE it came from (query-friendly)
    capture_channel: z
      .enum([
        'user_account_creation', // user created the bank account
        'connection', // fetched at bank connect
        'ui', // edited in the app later
        'api', // set via API
        'import', // csv/import pipeline
        'recalc_job', // set by a background job
      ])
      .optional(),

    // WHO initiated it (good for audit)
    capture_initiator: z.enum(['user', 'system']).optional(),

    derivation: z
      .object({
        method: z
          .enum([
            'backfill', // inferred from historical transactions
            'projection', // forward projection (rare, but future-proof)
            'recalc', // recomputed during a recalculation pass
          ])
          .optional(),
        // tie-back to a daily snapshot if applicable
        snapshotDay: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .optional(),

    // Linkage for replace actions
    supersedes_opening_balance_id: z.uuid().optional(),
    journal: z
      .object({
        reversed_journal_batch_id: z.uuid().optional(),
      })
      .optional(),

    note: z.string().max(1024).optional(),
  })
  .strict();

export type BankOpeningBalanceOrigin = z.infer<typeof bankOpeningBalanceOrigin>;
export const bankOpeningBalanceParams = z.object({
  bank_account_id: z.uuid(),
  amount: z.number(),
  coverage_start: z.date(),
  coverage_end: z.date(),
  origin: bankOpeningBalanceOrigin,
  role: bankOpeningBalanceRole.optional(),
  journal_batch_id: z.uuid().nullish(),
  metadata: bankObMetadata.optional(),
});

export type BankOpeningBalanceParams = z.infer<typeof bankOpeningBalanceParams>;

export const newBankOpeningBalance = z.object({
  ...bankOpeningBalanceParams.shape,
  role: bankOpeningBalanceRole,
  as_of_date: z.date(),
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().nullish(),
  ...dbStandardFields.shape,
});

const bankAccountOpeningBalances = newBankOpeningBalance.extend({
  id: z.uuid(),
});
export type BankAccountOpeningBalances = z.infer<
  typeof bankAccountOpeningBalances
>;
