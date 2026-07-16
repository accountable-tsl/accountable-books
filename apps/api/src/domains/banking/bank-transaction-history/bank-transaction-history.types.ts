import { z } from 'zod';

export const bankTransactionHistoryImportStatus = z.enum([
  'collecting',
  'available',
  'selected',
  'unavailable',
  'failed',
]);
export type BankTransactionHistoryImportStatus = z.infer<
  typeof bankTransactionHistoryImportStatus
>;

export const newBankTransactionHistoryImport = z.object({
  id: z.uuid().optional(),
  bank_account_feed_id: z.uuid(),
  company_id: z.uuid(),
  status: bankTransactionHistoryImportStatus.optional(),
});
export type NewBankTransactionHistoryImport = z.infer<
  typeof newBankTransactionHistoryImport
>;

export const bankTransactionHistoryImport = z.object({
  id: z.uuid(),
  bank_account_feed_id: z.uuid(),
  company_id: z.uuid(),
  status: bankTransactionHistoryImportStatus,
  earliest_transaction_date: z.date().nullable(),
  latest_transaction_date: z.date().nullable(),
  transaction_count: z.number().int().min(0),
  selected_from_date: z.date().nullable(),
  selected_at: z.date().nullable(),
  selected_by_id: z.uuid().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type BankTransactionHistoryImport = z.infer<
  typeof bankTransactionHistoryImport
>;

export const newBankTransactionHistoryCandidate = z.object({
  id: z.uuid().optional(),
  bank_account_feed_id: z.uuid(),
  company_id: z.uuid(),
  provider_transaction_id: z.string().trim().min(1).max(256),
  transaction_date: z.date(),
  transaction_at: z.date(),
  amount: z.number().refine((value) => value !== 0, {
    message: 'amount must be non-zero',
  }),
  description: z.string().trim().min(1).nullish(),
  payee: z.string().trim().min(1).nullish(),
  additional_notes: z.string().trim().min(1).nullish(),
  provider_evidence: z.record(z.string(), z.unknown()),
  provider_evidence_schema_version: z.number().int().min(1),
  observed_at: z.date(),
  supersedes_bank_transaction_id: z.uuid().nullable().optional(),
});
export type NewBankTransactionHistoryCandidate = z.infer<
  typeof newBankTransactionHistoryCandidate
>;

export const bankTransactionHistoryCandidate =
  newBankTransactionHistoryCandidate.extend({
    id: z.uuid(),
    created_at: z.date(),
    updated_at: z.date(),
  });
export type BankTransactionHistoryCandidate = z.infer<
  typeof bankTransactionHistoryCandidate
>;
