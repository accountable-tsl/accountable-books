import { z } from 'zod';

export const bankTransactionSyncRunTrigger = z.enum([
  'initial_connection',
  'webhook',
  'scheduler',
  'manual',
]);
export type BankTransactionSyncRunTrigger = z.infer<
  typeof bankTransactionSyncRunTrigger
>;

export const bankTransactionSyncRunMode = z.enum(['initial', 'incremental']);
export type BankTransactionSyncRunMode = z.infer<
  typeof bankTransactionSyncRunMode
>;

export const bankTransactionSyncRunOutcome = z.enum([
  'running',
  'succeeded',
  'failed',
  'skipped',
  'stale',
]);
export type BankTransactionSyncRunOutcome = z.infer<
  typeof bankTransactionSyncRunOutcome
>;

export const newBankTransactionSyncRun = z.object({
  id: z.uuid().optional(),
  bank_account_feed_id: z.uuid(),
  company_id: z.uuid(),
  trigger: bankTransactionSyncRunTrigger,
  trace_id: z.string().trim().min(1).max(128).nullish(),
  sync_mode: bankTransactionSyncRunMode,
  started_at: z.date().optional(),
  completed_at: z.date().nullish(),
  outcome: bankTransactionSyncRunOutcome.optional(),
  retryable: z.boolean().nullish(),
  failure_classification: z.string().trim().min(1).max(128).nullish(),
  provider_error_code: z.string().trim().min(1).max(128).nullish(),
  diagnostic_summary: z.string().trim().min(1).max(2048).nullish(),
  page_count: z.number().int().min(0).nullish(),
  added_count: z.number().int().min(0).nullish(),
  modified_count: z.number().int().min(0).nullish(),
  removed_count: z.number().int().min(0).nullish(),
  observed_state_version: z.number().int().min(1),
});
export type NewBankTransactionSyncRun = z.infer<
  typeof newBankTransactionSyncRun
>;

export const bankTransactionSyncRun = newBankTransactionSyncRun.extend({
  id: z.uuid(),
  started_at: z.date(),
  outcome: bankTransactionSyncRunOutcome,
  updated_at: z.date(),
});
export type BankTransactionSyncRun = z.infer<typeof bankTransactionSyncRun>;
