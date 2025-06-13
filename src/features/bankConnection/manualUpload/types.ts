import Decimal from "decimal.js";
import { BankAccountWithMeta } from "@/features/bankConnection/shared/types";
import { z } from "zod";
import { debitCredit } from "@/shared/types/core";

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
  "file_import",
  "bank_feed",
  "manual_entry",
]);
export type BankTransactionSource = z.infer<typeof bankTransactionSource>;

export const bankTransactionInput = z.object({
  date: z.date(),
  amount: z.number(),
  bankAccountId: z.string().uuid(),
  transactionSide: debitCredit.nullish(),
  description: z.string().nullish(),
  payee: z.string().nullish(),
  reference: z.string().nullish(),
  additionalComments: z.string().nullish(),
});
export type BankTransactionInput = z.infer<typeof bankTransactionInput>;

export const bankTransactionBatchInput = z.object({
  startDate: z.date(),
  endDate: z.date(),
  source: bankTransactionSource,
  bankAccountId: z.string().uuid(),
  bankTransactions: z.array(bankTransactionInput),
});
export type BankTransactionBatchInput = z.infer<
  typeof bankTransactionBatchInput
>;

export const bankTransaction = bankTransactionInput.extend({
  source: bankTransactionSource.optional(),
  bankTransactionBatchId: z.string().uuid().optional(),
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
