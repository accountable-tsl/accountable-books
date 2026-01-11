import z from 'zod';

import { dbBaseFields, debitCredit, zDateYMD } from '../../core/types/core.js';
import { txnCategorizationSource } from '../categorization/categorization.types.js';
import { contactType } from '../contacts/index.js';

export const ledgerTransactionSource = z.enum([
  'bank_transaction',
  'manual_journal',
]);
export type LedgerTransactionSource = z.infer<typeof ledgerTransactionSource>;

/**
 * // Note, we do not edit ledger transactions fields, except for contact_id and contact_type which sit there\
 *
 * // Why do they sit there again? I think I made that decision because most transactions come from bank transactions...
 * // and if that's the case, could 1 person be paying for 2 different people?
 * // Possible but unlikely. And if it does happen, then we should have a split transaction
 *
 * // On the other hand, one person could be paying for two projects, and so projects sit on ledger_entries
 *
 * // Therefore, if contact is changed on a ledger entry line in UI, usually that also affects all the other legs
 * // If it's just a transaction with one leg, then the contact is changed on the transaction
 * // If it's a transaction with multiple legs, then we must let user know that this change will affect all the other legs and surface a ui for them to do this
 * // And then we create a new transaction for the different contacts
 *
 *
 * // As I'm writing this, I'm wondering and thinking, it seems this comes with a challenge though...
 * // If one bank transaction can now have multiple transaction heads in the ledger, how do we make sure that the multiple entries all have the same net impact as expected
 * // A $1000 bank transaction line should and cannot have a net impact of anything more or less than this $1000
 *
 * // So should I maintain contact on ledger transaction or should I just move it to ledger entries so each entry can have its own contact and the bank leg maintains the original contact?
 *
 * // 1_0000_000 years later...
 * // Decision:
 * // Keep contact resolved at bank transaction level in ledger transactions
 * // Default, same value applies to ledger entries, and that could be null
 * // But users can change contact on ledger entries, except for bank legs
 */

// Ledger Transaction Types
const baseLedgerTransaction = z.object({
  date: z.union([z.date(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  transaction_source: ledgerTransactionSource,
  categorization_source: txnCategorizationSource,
  /**
   * is_trainable Flag
   *
   * A transaction is trainable (is_trainable = true) ONLY when ALL of the following criteria are met:
   * 1. Non-bank line: The entry is NOT a bank leg (is_bank_leg = false)
   * 2. Semantic role: The account type has label_role === 'semantic'
   * 3. Account type is trainable: The account type has trainable === true
   * 4. User reviewed: human_reviewed === true
   * 5. Enough data gathered: Manual flag (will be backfilled) and a cut off date
   *
   * Current state: All transactions have is_trainable = false (default)
   * Future: Will implement logic to check all criteria above
   */
  is_trainable: z.boolean().default(false).optional(),
  description: z.string().nullish(), // Description of the transaction typically as is from bank
  reference: z.string().nullish(),
  note: z.string().nullish(),

  contact_id: z.uuid().nullish(), // Contact as resolved from bank transaction
  contact_type: contactType.nullish(), // Contact type as resolved from bank transaction

  source_transaction_id: z.uuid().nullish(),
  source_transaction_date: z.date().nullish(),
  source_transaction_amount: z.number().nullish(),
  source_transaction_currency_id: z.uuid(),

  categorization_candidate_id: z.uuid().nullish(), // Which candidate is this transaction based on?

  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const newLedgerTransaction = z.object({
  ...baseLedgerTransaction.shape,
  company_id: z.uuid(),
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().nullish(),
});
export type NewLedgerTransaction = z.infer<typeof newLedgerTransaction>;

export const ledgerTransaction = z.object({
  ...newLedgerTransaction.shape,
  ...dbBaseFields.shape,
});
export type LedgerTransaction = z.infer<typeof ledgerTransaction>;

// Ledger Entry Types

const baseLedgerEntry = z.object({
  id: z.uuid().optional(),
  fs_date: zDateYMD,
  coa_id: z.uuid(),
  coa_name: z.string().nullish(),

  source_currency_id: z.uuid(),
  source_amount: z.number(),

  custom_exchange_rate: z.number().optional(),

  contact_id: z.uuid().nullish(), // Defaults to contact on ledger transaction but can be changed
  contact_type: contactType.nullish(), // Same as contact_id
  contact_name: z.string().nullish(),

  description: z.string().nullable(),
  reference: z.string().nullish(),
  is_monetary: z.boolean().optional(),
  is_bank_leg: z.boolean().optional(),

  fx_transaction_id: z.string().nullish(),

  ledger_transaction_id: z.uuid().optional(),
  project_id: z.uuid().nullish(),
  project_name: z.string().nullish(),

  human_reviewed: z.boolean().default(false).optional(),
  review_notes: z.string().nullish(),

  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const newLedgerEntry = z.object({
  ...baseLedgerEntry.shape,

  ledger_transaction_id: z.uuid(),
  system_exchange_rate: z.number(),
  custom_exchange_rate: z.number(),

  project_id: z.uuid().nullish(),

  is_monetary: z.boolean(),
  is_bank_leg: z.boolean().default(false).optional(),

  is_deleted: z.boolean().default(false).optional(),
  deleted_at: z.date().nullish(),

  created_at: z.date().optional(),
  updated_at: z.date().optional(),

  updated_by_id: z.uuid().nullish(),
  reviewed_by_id: z.uuid().nullish(),
  reviewed_at: z.date().nullish(),
});

export type NewLedgerEntry = z.infer<typeof newLedgerEntry>;

const autoGeneratedLedgerEntryFields = z.object({
  absolute_source_amount: z.number(),
  amount: z.number(),
  absolute_amount: z.number(),
  transaction_side: debitCredit,
  search_text: z.string(),
});

export const ledgerEntry = z.object({
  ...newLedgerEntry.shape,
  ...autoGeneratedLedgerEntryFields.shape,
  ...dbBaseFields.shape,
});
export type LedgerEntry = z.infer<typeof ledgerEntry>;

const ledgerTransactionInput = z.object({
  ...baseLedgerTransaction.shape,
  // contact_name: z.string().nullish(),
});

const ledgerEntryInput = z.object({
  ...baseLedgerEntry.shape,
});
export type LedgerEntryInput = z.infer<typeof ledgerEntryInput>;
export const newLedgerTransactionData = z.object({
  ...ledgerTransactionInput.shape,
  transactions: z.array(ledgerEntryInput).min(2),
});
export type NewLedgerTransactionData = z.infer<typeof newLedgerTransactionData>;

// Updating Ledger Types

// Metadata fields that can be updated in-place at transaction level
export const ledgerTransactionMetadataUpdate = z.object({
  description: z.string().nullish(),
  reference: z.string().nullish(),
  note: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type LedgerTransactionMetadataUpdate = z.infer<
  typeof ledgerTransactionMetadataUpdate
>;

// Metadata fields that can be updated in-place at entry level
export const ledgerEntryMetadataUpdate = z.object({
  description: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  human_reviewed: z.boolean().optional(),
  review_notes: z.string().optional(),
  reviewed_by_id: z.uuid().nullish(),
  reviewed_at: z.date().nullish(),
});
export type LedgerEntryMetadataUpdate = z.infer<
  typeof ledgerEntryMetadataUpdate
>;

// Input type for updateOrCreateLedger
export const updateOrCreateLedgerInput = z.object({
  // For existing ledger transactions, provide ledger_transaction_id
  ledger_transaction_id: z.uuid().optional(),

  // For new transactions or updates, provide partial ledger data
  ...newLedgerTransactionData.partial().shape,

  // Flag to force supersede even if only metadata changed
  force_new_version: z.boolean().optional(),

  custom_exchange_rate: z.number().optional(),
});
export type UpdateOrCreateLedgerInput = z.infer<
  typeof updateOrCreateLedgerInput
>;

// Result type
export const updateOrCreateLedgerResult = z.object({
  operation: z.enum(['created', 'updated_metadata', 'superseded']),
  ledgerTransactionId: z.uuid(),
  oldLedgerTransactionId: z.uuid().optional(), // Only for superseded
  warnings: z.record(z.string(), z.string()).optional(),
  affectedCOAs: z.number().optional(),
  dateRange: z
    .object({
      min: z.string().nullable(),
      max: z.string().nullable(),
    })
    .optional(),
});
export type UpdateOrCreateLedgerResult = z.infer<
  typeof updateOrCreateLedgerResult
>;

// Types for getLedgerTransactionsWithEntries
export type LedgerTransactionWithEntries = LedgerTransaction & {
  entries: LedgerEntry[];
};

export type LedgerTransactionWithEntriesFiltered = Omit<
  LedgerTransaction,
  'created_at' | 'updated_at' | 'is_deleted' | 'deleted_at'
> & {
  entries: Array<
    Omit<
      LedgerEntry,
      | 'created_at'
      | 'updated_at'
      | 'is_deleted'
      | 'deleted_at'
      | 'absolute_source_amount'
      | 'amount'
      | 'absolute_amount'
      | 'transaction_side'
      | 'search_text'
    >
  >;
};
