import { debitCredit } from '@/shared/types/core';
import z from 'zod';

export const bankTransactionSource = z.enum([
  'file_import',
  'bank_feed',
  'manual_entry',
]);
export type BankTransactionSource = z.infer<typeof bankTransactionSource>;

export type FieldValue =
  | 'date'
  | 'amount'
  | 'payee'
  | 'description'
  | 'reference'
  | 'additionalComments';

export const rawRowSchema = z.object({
  date: z.union([z.string(), z.number(), z.date()]),
  amount: z.union([z.string(), z.number()]).transform(Number),
  description: z.string().nullish(),
  payee: z.string().nullish(),
  reference: z.string().nullish(),
  additionalComments: z.string().nullish(),
});

export const parsedBankTxn = rawRowSchema.extend({
  date: z.date(),
  amount: z.number(),
  // bankAccountId: z.string(),
  formattedDate: z.string(),
  transactionSide: debitCredit,
  moneyIn: z.union([z.string(), z.number()]),
  moneyOut: z.union([z.string(), z.number()]),
});
export type ParsedBankTxn = z.infer<typeof parsedBankTxn>;

export const bankTransactionInsertSchema = z.object({
  date: z.date(),
  amount: z.number(),
  bank_account_id: z.uuid(),
  // transactionSide: debitCredit.nullish(),
  description: z.string().nullish(),
  payee: z.string().nullish(),
  reference: z.string().nullish(),
  additionalComments: z.string().nullish(),
  rawData: z.any().nullish(),
});
export type BankTransactionInsert = z.infer<typeof bankTransactionInsertSchema>;

const bankTransactionBatchInsertSchema = z.object({
  source: bankTransactionSource,
  bank_account_id: z.uuid(),
  bank_transactions: z.array(bankTransactionInsertSchema),
  metadata: z.any().nullish(),
});
export type BankTransactionBatchInsert = z.infer<
  typeof bankTransactionBatchInsertSchema
>;

export type ErrorRow = {
  rowIndex: number;
  originalRow: Record<string, any>;
  errorMessages: string[];
};

export type TransformResult = {
  transactions: ParsedBankTxn[];
  inserts: BankTransactionInsert[];
  // dateRange: DateRangeResult | null;
  errors: ErrorRow[];
  totalMoneyIn: number;
  totalMoneyOut: number;
};
