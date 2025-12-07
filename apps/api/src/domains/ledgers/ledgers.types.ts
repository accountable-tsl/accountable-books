import z from 'zod';

import { dbBaseFields, zDateYMD } from '../../core/types/core.js';
import { debitCredit } from '../../core/types/core.js';
import { txnCategorizationSource } from '../categorization/categorization.types.js';
import { contactType } from '../contacts/index.js';

export const ledgerTransactionSource = z.enum([
  'bank_transaction',
  'manual_journal',
]);
export type LedgerTransactionSource = z.infer<typeof ledgerTransactionSource>;

/**
 * Note, we do not edit ledger transactions fields, except for contact_id and contact_type which sit there\
 *
 * Why do they sit there again? I think I made that decision because most transactions come from bank transactions...
 * and if that's the case, could 1 person be paying for 2 different people?
 * Possible but unlikely. And if it does happen, then we should have a split transaction
 *
 * On the other hand, one person could be paying for two projects, and so projects sit on ledger_entries
 *
 * Therefore, if contact is changed on a ledger entry line in UI, usually that also affects all the other legs
 * If it's just a transaction with one leg, then the contact is changed on the transaction
 * If it's a transaction with multiple legs, then we must let user know that this change will affect all the other legs and surface a ui for them to do this
 * And then we create a new transaction for the different contacts
 *
 *
 * As I'm writing this, I'm wondering and thinking, it seems this comes with a challenge though...
 * If one bank transaction can now have multiple transaction heads in the ledger, how do we make sure that the multiple entries all have the same net impact as expected
 * A $1000 bank transaction line should and cannot have a net impact of anything more or less than this $1000
 *
 * So should I maintain contact on ledger transaction or should I just move it to ledger entries so each entry can have its own contact and the bank leg maintains the original contact?
 *
 * 1_0000_000 years later...
 * Decision:
 * Keep contact resolved at bank transaction level in ledger transactions
 * Default, same value applies to ledger entries, and that could be null
 * But users can change contact on ledger entries, except for bank legs
 */

const ACCOUNTING_FIELDS = [];
const NON_ACCOUNTING_FIELDS = [];

// Ledger Transaction Types
const baseLedgerTransaction = z.object({
  date: z.union([z.date(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  transaction_source: ledgerTransactionSource,
  categorization_source: txnCategorizationSource,
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

  human_reviewed: z.boolean().default(false).optional(),
  review_notes: z.string().optional(),
});

export const newLedgerTransaction = z.object({
  ...baseLedgerTransaction.shape,
  company_id: z.uuid(),
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().nullish(),
  reviewed_by_id: z.uuid().nullish(),
});
export type NewLedgerTransaction = z.infer<typeof newLedgerTransaction>;

export const ledgerTransaction = z.object({
  ...newLedgerTransaction.shape,
  ...dbBaseFields.shape,
});
export type LedgerTransaction = z.infer<typeof ledgerTransaction>;

// Ledger Entry Types

const baseLedgerEntry = z.object({
  fs_date: zDateYMD,
  coa_id: z.uuid(),

  source_currency_id: z.uuid(),
  source_amount: z.number(),

  custom_exchange_rate: z.number().optional(),

  contact_id: z.uuid().nullish(), // Defaults to contact on ledger transaction but can be changed
  contact_type: contactType.nullish(), // Same as contact_id

  description: z.string().nullable(),
  is_monetary: z.boolean().optional(),
  is_bank_leg: z.boolean().optional(),

  fx_transaction_id: z.string().nullish(),

  ledger_transaction_id: z.uuid().optional(),
  project_id: z.uuid().nullish(),

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
