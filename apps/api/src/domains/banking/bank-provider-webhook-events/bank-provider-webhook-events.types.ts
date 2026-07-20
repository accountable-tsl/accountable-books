import { z } from 'zod';

export const bankProviderWebhookEventStatus = z.enum([
  'pending',
  'completed',
  'quarantined',
]);
export type BankProviderWebhookEventStatus = z.infer<
  typeof bankProviderWebhookEventStatus
>;

export const newBankProviderWebhookEvent = z.object({
  id: z.uuid().optional(),
  provider_key: z.string().trim().min(1).max(64),
  provider_item_id: z.string().trim().min(1).max(256).nullish(),
  event_type: z.string().trim().min(1).max(128),
  event_code: z.string().trim().min(1).max(128),
  dedupe_key: z.string().trim().min(1).max(128),
  payload: z.record(z.string(), z.unknown()),
  status: bankProviderWebhookEventStatus.optional(),
  bank_connection_id: z.uuid().nullish(),
});
export type NewBankProviderWebhookEvent = z.infer<
  typeof newBankProviderWebhookEvent
>;

export const bankProviderWebhookEvent = z.object({
  id: z.uuid(),
  provider_key: z.string(),
  provider_item_id: z.string().nullable(),
  event_type: z.string(),
  event_code: z.string(),
  dedupe_key: z.string(),
  payload: z.record(z.string(), z.unknown()).nullable(),
  status: bankProviderWebhookEventStatus,
  received_at: z.date(),
  processed_at: z.date().nullable(),
  quarantine_reason: z.string().nullable(),
  last_error: z.string().nullable(),
  bank_connection_id: z.uuid().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type BankProviderWebhookEvent = z.infer<typeof bankProviderWebhookEvent>;
