import z from 'zod';
import { debitCredit } from '../../core/types/core.js';
import {
  createCamelCaseSchema,
  type SnakeToCamelCaseObject,
} from '../../shared/utils/formatting.utils.js';

export const journalTransactionData = z.object({
  description: z.string(),
  side: debitCredit,
  amount: z.number(),
  coa_id: z.uuid(),
  project_id: z.uuid().nullish(),
  project_name: z.string().nullish(),
});
export type JournalTransactionData = z.infer<typeof journalTransactionData>;

const newJournalEntry = z.object({
  ...journalTransactionData.shape,
  journal_batch_id: z.uuid(),
  ledger_entry_id: z.uuid().nullish(),
  ledger_entry_fs_date: z.date().nullish(),
  // project_id
  created_at: z.date(),
  updated_at: z.date(),
  is_deleted: z.boolean().default(false),
  deleted_at: z.date().nullish(),
});
export type NewJournalEntry = z.infer<typeof newJournalEntry>;

export const journalEntry = z.object({
  ...newJournalEntry.shape,
  id: z.uuid(),
});
export type JournalEntry = z.infer<typeof journalEntry>;

const journalBatchStatus = z.enum(['draft', 'posted', 'voided']);
const journalBatchDataSchema = z.object({
  id: z.uuid().optional(),
  date: z.date(),
  transactions: journalTransactionData.array(),
  title: z.string(),
  description: z.string().nullish(),
  status: journalBatchStatus,
  note: z.string().nullish(),
  generated_from_template_id: z.uuid().nullish(),
  auto_reversal_date: z.date().nullish(),
  reversed_journal_id: z.uuid().nullish(),
  reversal_reason: z.string().nullish(),
  code: z.string().nullish(),
  contact_id: z.uuid().nullish(),
  currency_code: z.string().max(3).nullish(),
  currency_id: z.uuid().nullish(),
  exchange_rate: z.number().optional(),
  is_recurring: z.boolean().nullish(),
  recurring_template_id: z.uuid().nullish(),
});
export const journalBatchData = createCamelCaseSchema(journalBatchDataSchema);
export type JournalBatchData = SnakeToCamelCaseObject<
  z.infer<typeof journalBatchData>
>;

const newJournalBatch = journalBatchDataSchema
  .omit({ transactions: true, currency_code: true })
  .extend({
    ledger_transaction_id: z.uuid(),
    sequence_number: z.number().optional(), // Raw sequence numnber (increment per company when creating journal. KISS)
    company_id: z.uuid(),
    currency_id: z.uuid(),
    created_by_id: z.uuid(),
    updated_by_id: z.uuid().nullish(),
    reversed_by_id: z.uuid().nullish(),
    reversed_at: z.date().nullish(),
    created_at: z.date(),
    updated_at: z.date(),
    is_deleted: z.boolean().default(false),
    deleted_at: z.date().nullish(),
  });
export type NewJournalBatch = z.infer<typeof newJournalBatch>;
export type JournalBatch = z.infer<typeof newJournalBatch>;
