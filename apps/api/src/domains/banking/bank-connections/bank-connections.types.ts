import { z } from 'zod';

export const bankConnectionAuthorizationStatus = z.enum([
  'active',
  'requires_action',
  'revoked',
]);
export type BankConnectionAuthorizationStatus = z.infer<
  typeof bankConnectionAuthorizationStatus
>;

export const bankConnectionRevocationOrigin = z.enum(['client', 'provider']);
export type BankConnectionRevocationOrigin = z.infer<
  typeof bankConnectionRevocationOrigin
>;

export const newBankConnection = z.object({
  id: z.uuid().optional(),
  company_id: z.uuid(),
  provider_id: z.uuid(),
  provider_item_id: z.string().trim().min(1).max(256).nullish(),
  bank_provider_mapping_id: z.uuid().nullish(),
  authorization_status: bankConnectionAuthorizationStatus.optional(),
  authorization_reason_code: z.string().trim().min(1).max(128).nullish(),
  requires_action_at: z.date().nullish(),
  connected_at: z.date().optional(),
  connected_by_id: z.uuid(),
  revoked_at: z.date().nullish(),
  revoked_by_id: z.uuid().nullish(),
  revocation_origin: bankConnectionRevocationOrigin.nullish(),
  revocation_reason: z.string().trim().min(1).max(512).nullish(),
  provider_expires_at: z.date().nullish(),
  provider_snapshot: z.record(z.string(), z.unknown()).nullish(),
  provider_snapshot_version: z.number().int().min(1).nullish(),
  provider_snapshot_captured_at: z.date().nullish(),
  updated_by_id: z.uuid().nullish(),
});
export type NewBankConnection = z.infer<typeof newBankConnection>;

export const bankConnection = newBankConnection.extend({
  id: z.uuid(),
  authorization_status: bankConnectionAuthorizationStatus,
  connected_at: z.date(),
  updated_at: z.date(),
});
export type BankConnection = z.infer<typeof bankConnection>;
