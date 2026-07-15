import { z } from 'zod';

export const bankAccountFeedRevocationOrigin = z.enum(['client', 'provider']);
export type BankAccountFeedRevocationOrigin = z.infer<
  typeof bankAccountFeedRevocationOrigin
>;

export const newBankAccountFeed = z.object({
  id: z.uuid().optional(),
  company_id: z.uuid(),
  bank_account_id: z.uuid(),
  bank_connection_id: z.uuid(),
  provider_account_id: z.string().trim().min(1).max(256),
  provider_snapshot: z.record(z.string(), z.unknown()).nullish(),
  provider_snapshot_version: z.number().int().min(1).nullish(),
  provider_snapshot_captured_at: z.date().nullish(),
  sync_from_date: z.date().nullish(),
  sync_cursor: z.string().nullish(),
  initial_sync_completed_at: z.date().nullish(),
  last_successful_sync_at: z.date().nullish(),
  state_version: z.number().int().min(1).optional(),
  connected_at: z.date().optional(),
  connected_by_id: z.uuid(),
  revoked_at: z.date().nullish(),
  revoked_by_id: z.uuid().nullish(),
  revocation_origin: bankAccountFeedRevocationOrigin.nullish(),
  revocation_reason: z.string().trim().min(1).max(512).nullish(),
});
export type NewBankAccountFeed = z.infer<typeof newBankAccountFeed>;

export const bankAccountFeed = newBankAccountFeed.extend({
  id: z.uuid(),
  state_version: z.number().int().min(1),
  connected_at: z.date(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type BankAccountFeed = z.infer<typeof bankAccountFeed>;
