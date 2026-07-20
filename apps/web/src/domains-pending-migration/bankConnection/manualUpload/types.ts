import type { BankAccountWithMeta } from '@/modules/banking/accounts/model/types';
import { contactType } from '@/modules/contacts/model/types';
import { debitCredit } from '@/shared/types/core';
import Decimal from 'decimal.js';
import { z } from 'zod';

export type TransactionsStat = {
  totalPositive: number;
  totalNegative: number;
  netChange: number;
  transactionCount: number;
  earliestDate: Date | null;
  latestDate: Date | null;
};
export type FileTransaction = {
  fileName: string;
  transactions: Record<string, unknown>[];
  stats: TransactionsStat;
  bankAccount: BankAccountWithMeta;
};

export const bankTransactionBatch = z.object({});
export const bankTransactionSource = z.enum([
  'file_import',
  'bank_feed',
  'manual_entry',
]);
export type BankTransactionSource = z.infer<typeof bankTransactionSource>;

export const bankTransactionInput = z.object({
  date: z.date(),
  amount: z.number(),
  bankAccountId: z.uuid(),
  transactionSide: debitCredit.nullish(),
  description: z.string().nullish(),
  payee: z.string().nullish(),
  reference: z.string().nullish(),
  additionalComments: z.string().nullish(),
});
export type BankTransactionInput = z.infer<typeof bankTransactionInput>;

const bankTransactionContactResolution = z.object({
  contact_id: z.uuid(),
  contact_type: contactType.nullish(),
  reason: z.string().trim().max(512).optional(),
});

export const bankTransactionBatchInput = z.object({
  source: bankTransactionSource,
  bank_account_id: z.uuid(),
  bank_transactions: z.array(
    z.object({
      transaction_date: z.date(),
      amount: z.number(),
      bank_account_id: z.uuid(),
      description: z.string().nullish(),
      payee: z.string().nullish(),
      reference: z.string().nullish(),
      additional_notes: z.string().nullish(),
      contact_resolution: bankTransactionContactResolution.optional(),
    }),
  ),
});
export type BankTransactionBatchInput = z.infer<
  typeof bankTransactionBatchInput
>;

export const bankTransaction = bankTransactionInput.extend({
  source: bankTransactionSource.optional(),
  bankTransactionBatchId: z.uuid().optional(),
});
export type BankTransaction = z.infer<typeof bankTransaction>;

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
  transactionsCount: number;
  batchTotal: Decimal | string;
  balanceAfter: Decimal | string;
};

export type BankTransactionImportOptions = {
  className?: string;
  toastPosition?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
};

export type BankTransactionImporterProps = {
  onImportSuccess?: (data: any) => void;
  onImportError?: (data: any) => void;
  options?: BankTransactionImportOptions;
};
