import { z } from 'zod';

export const bankTransactionFeedEntryObservationType = z.enum([
  'added',
  'modified',
  'removed',
]);
export type BankTransactionFeedEntryObservationType = z.infer<
  typeof bankTransactionFeedEntryObservationType
>;

export const newBankTransactionFeedEntry = z.object({
  id: z.uuid().optional(),
  bank_account_feed_id: z.uuid(),
  company_id: z.uuid(),
  provider_transaction_id: z.string().trim().min(1).max(256),
  bank_transaction_id: z.uuid(),
  observation_type: bankTransactionFeedEntryObservationType,
  provider_evidence: z.record(z.string(), z.unknown()),
  provider_evidence_schema_version: z.number().int().min(1),
  observed_at: z.date(),
  adopted_from_feed_entry_id: z.uuid().nullish(),
  replacement_unmatched: z.boolean().optional(),
});
export type NewBankTransactionFeedEntry = z.infer<
  typeof newBankTransactionFeedEntry
>;

export const bankTransactionFeedEntry = newBankTransactionFeedEntry.extend({
  id: z.uuid(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type BankTransactionFeedEntry = z.infer<typeof bankTransactionFeedEntry>;
