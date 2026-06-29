import { z } from 'zod';

import { dbBaseFields, zDate } from '../../core/types/core.js';
import { createCamelCaseSchema } from '../../shared/utils/formatting.utils.js';
import { contactType } from '../contacts/index.js';

import type { SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';
import type { ContactType } from '../contacts/index.js';

// ENUMS
export const bankTransactionSource = z.enum([
  'file_import',
  'bank_feed',
  'manual_entry',
]);
export type BankTransactionSource = z.infer<typeof bankTransactionSource>;
export const bankTransactionBatchStatus = z.enum(['active', 'reversed']);
export type BankTransactionBatchStatus = z.infer<
  typeof bankTransactionBatchStatus
>;
export const bankTransactionDeletionSource = z.enum([
  'user_action',
  'batch_reversal',
  'provider_sync',
]);

// BANK TRANSACTIONS
export const bankTransactionInput = z.object({
  transaction_date: zDate,
  transaction_at: z.date().optional(),
  amount: z.number(),
  bank_account_id: z.uuid().optional(),
  description: z.string().nullish(),
  payee: z.string().nullish(),
  reference: z.string().nullish(),
  additional_notes: z.string().nullish(),
  source_payload: z.record(z.string(), z.unknown()).optional(),
  idempotency_key: z.string().trim().min(1).max(256).optional(),
});
export type BankTransactionInput = z.infer<typeof bankTransactionInput>;

export const bankTransactionInputCamel =
  createCamelCaseSchema(bankTransactionInput);
export type BankTransactionInputCamel = SnakeToCamelCaseObject<
  z.infer<typeof bankTransactionInputCamel>
>;

export const newBankTransaction = bankTransactionInput.extend({
  transaction_at: z.date(),
  bank_account_id: z.uuid(),
  company_id: z.uuid(),
  system_exchange_rate: z.number(),
  bank_transaction_batch_id: z.uuid(),
  idempotency_key: z.string().trim().min(1).max(256),
  source_payload: z.record(z.string(), z.unknown()),
  ledger_transaction_id: z.uuid().nullish(),
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().nullish(),
});
export type NewBankTransaction = z.infer<typeof newBankTransaction>;

export const bankTransaction = z.object({
  ...newBankTransaction.shape,
  ...dbBaseFields.shape,
  deleted_by_id: z.uuid().nullish(),
  deletion_origin: bankTransactionDeletionSource.nullish(),
  deletion_reason: z.string().max(512).nullish(),
  absolute_amount: z.number(),
  search_text: z.string(),
});
export type BankTransaction = z.infer<typeof bankTransaction>;

// BANK TRANSACTION BATCHES
export const bankTransactionBatchInput = z
  .object({
    source: bankTransactionSource,
    bank_account_id: z.uuid(),
    bank_transactions: z.array(bankTransactionInput).min(1),
    // fingerprint: z.string(),
    // opening_balance: z.number().optional(), // Balance before the first transaction
    // closing_balance: z.number().optional(), // Balance after the last transaction
    source_metadata: z.record(z.string(), z.unknown()).optional().default({}),
    connection_credential_id: z.uuid().nullish(),
  })
  .superRefine((batch, ctx) => {
    const hasCredential = batch.connection_credential_id != null;
    if ((batch.source === 'bank_feed') !== hasCredential) {
      ctx.addIssue({
        code: 'custom',
        path: ['connection_credential_id'],
        message:
          'connection_credential_id is required only for bank feed batches',
      });
    }

    if (batch.source === 'bank_feed') {
      batch.bank_transactions.forEach((transaction, index) => {
        if (!transaction.idempotency_key) {
          ctx.addIssue({
            code: 'custom',
            path: ['bank_transactions', index, 'idempotency_key'],
            message: 'idempotency_key is required for bank feed transactions',
          });
        }
      });
    }
  });
export type BankTransactionBatchInput = z.infer<
  typeof bankTransactionBatchInput
>;

export const bankTransactionBatchInputCamel = createCamelCaseSchema(
  bankTransactionBatchInput,
);
export type BankTransactionBatchInputCamel =
  SnakeToCamelCaseObject<BankTransactionBatchInput>;

export const newBankTransactionBatches = z.object({
  bank_account_id: z.uuid(),
  company_id: z.uuid(),
  connection_credential_id: z.uuid().nullish(),
  start_date: zDate,
  end_date: zDate,
  source: bankTransactionSource,
  fingerprint: z.string().trim().min(1).max(256),
  import_row_count: z.number().int().positive(),
  source_metadata: z.record(z.string(), z.unknown()).default({}),
  status: bankTransactionBatchStatus.optional().default('active'),
  created_by_id: z.uuid(),
});
export type NewBankTransactionBatches = z.infer<
  typeof newBankTransactionBatches
>;

export const bankTransactionBatches = newBankTransactionBatches.extend({
  id: z.uuid(),
  status: bankTransactionBatchStatus,
  reversed_by_id: z.uuid().nullish(),
  reversed_at: z.date().nullish(),
  reversal_reason: z.string().max(512).nullish(),
  created_at: z.date(),
});
export type BankTransactionBatches = z.infer<typeof bankTransactionBatches>;

export const reverseBankTransactionBatchInput = z.object({
  reason: z.string().trim().min(1).max(512),
});
export type ReverseBankTransactionBatchInput = z.infer<
  typeof reverseBankTransactionBatchInput
>;

// ADD NEW BANK TRANSACTIONS
export type AddBankTransactionsResponse = {
  batch: {
    id: string;
    bankAccountId: string;
    startDate: Date;
    endDate: Date;
    source: BankTransactionSource;
    balanceBefore: string;
    balanceAfter: string;
  };
  inserted?: number;
  skippedDuplicates?: number;
  transactionsCount: number;
  batchTotal?: number | string;
  balanceAfter?: number | string;
  balanceWarning?: {
    message: string;
    calculatedBalance: string;
    runningBalance: string;
  };
};

// FETCH BANK TRANSACTIONS
export const bankTransactionsFilters = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  bankAccountIds: z.array(z.uuid()).optional(),
  // categorizationStatus: categorizationStatus.optional(),
  isDeleted: z.boolean().optional(),
  searchQuery: z.string().optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  currentPage: z.number().optional(),
  pageSize: z.number().optional(),
  offset: z.number().optional(),
});
export type BankTransactionFilters = z.infer<typeof bankTransactionsFilters>;

export const deleteBankTransactionsInput = z.object({
  bankTransactionIds: z.array(z.uuid()).min(1),
  reason: z.string().trim().min(1).max(256).optional(),
});
export type DeleteBankTransactionsInput = z.infer<
  typeof deleteBankTransactionsInput
>;

// Types for getBankTransactionsByIds
export type BankTransactionWithFilteredFields = Omit<
  BankTransaction,
  | 'created_at'
  | 'updated_at'
  | 'is_deleted'
  | 'deleted_at'
  | 'absolute_amount'
  | 'search_text'
> & {
  bank_account_coa_id: string;
  bank_account_currency_id: string;
  resolved_contact_id?: string | null;
  resolved_contact_type?: ContactType | null;
};
