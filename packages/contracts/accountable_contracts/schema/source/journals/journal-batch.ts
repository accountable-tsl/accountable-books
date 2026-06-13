import { z } from 'zod';

import { debitCredit } from '../common/enums.js';
import { txnFileBase } from '../objects/txn-files.js';

// =============================================================================
// Enums
// =============================================================================

export const journalBatchStatus = z.enum([
  'draft',
  'posted',
  'voided',
  'reversed',
]);
export type JournalBatchStatus = z.infer<typeof journalBatchStatus>;

export const journalBatchSource = z.enum([
  'one_off',
  'generated_from_template',
]);
export type JournalBatchSource = z.infer<typeof journalBatchSource>;
// =============================================================================
// Journal Entry Schemas
// =============================================================================

export const journalEntryInput = z.object({
  description: z.string().max(512).nullish(),
  side: debitCredit,
  amount: z.number().refine(
    (n) => {
      const parts = n.toString().split('.');
      return parts.length === 1 || parts[1].length <= 2;
    },
    { message: 'Amount cannot have more than 2 decimal places' },
  ),
  coaId: z.uuid(),
  projectId: z.uuid().nullish(),
});
export type JournalEntryInput = z.infer<typeof journalEntryInput>;

// =============================================================================
// Journal Batch Input Schema
// =============================================================================

export const journalBatchInput = z.object({
  id: z.uuid().optional(),
  userReference: z.string().max(256).nullish(),
  date: z.string(), // ISO date string YYYY-MM-DD
  title: z.string().min(1).max(512),
  description: z.string().max(2048).optional(),
  contactId: z.uuid().nullish(),
  currencyId: z.uuid().nullish(),
  exchangeRate: z.number().positive().nullish(),
  status: z.enum(['draft', 'posted']).optional(),
  autoReversalDate: z.string().nullish(),
  note: z.string().max(2048).nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  entries: z.array(journalEntryInput).min(2),
  // Files follow the transaction file base schema (persisted/attached by journals command).
  files: z.array(txnFileBase).optional(),
});
export type JournalBatchInput = z.infer<typeof journalBatchInput>;

// =============================================================================
// Batch Operation Schemas
// =============================================================================

export const postDraftJournalsBatchBody = z.object({
  journalIds: z.array(z.uuid()).min(1).max(200),
  mode: z.enum(['partial', 'all_or_nothing']).default('partial'),
});
export type PostDraftJournalsBatchBody = z.infer<
  typeof postDraftJournalsBatchBody
>;

export const voidDraftJournalsBatchBody = z.object({
  journalIds: z.array(z.uuid()).min(1).max(200),
  voidReason: z.string().min(1).max(2048).nullable().optional(),
  mode: z.enum(['partial', 'all_or_nothing']).default('partial'),
});
export type VoidDraftJournalsBatchBody = z.infer<
  typeof voidDraftJournalsBatchBody
>;

export const copyJournalBody = z.object({
  includeFiles: z.boolean().optional().default(false),
});
export type CopyJournalBody = z.infer<typeof copyJournalBody>;

export const reverseJournalBody = z.object({
  reversalReason: z.string().max(2048).optional(),
  reversalDate: z.string().optional(),
});
export type ReverseJournalBody = z.infer<typeof reverseJournalBody>;

export const voidJournalBody = z.object({
  voidReason: z.string().max(2048).optional(),
});
export type VoidJournalBody = z.infer<typeof voidJournalBody>;
