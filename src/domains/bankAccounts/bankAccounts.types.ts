import { z } from "zod";
import { dbBaseFields, decimalSchema } from "../../core/validation/schemas";
import { SnakeToCamelCaseObject } from "../../shared/utils/formatting.utils";

export const bankAccountType = z.enum([
  "other",
  "credit_card",
  "debit_card",
  "savings",
  "checkings_current",
  "utility",
]);
export type BankAccountType = z.infer<typeof bankAccountType>;

export const newBankAccount = z.object({
  display_name: z.string().min(1, "Display name is required"),
  account_type: bankAccountType,
  account_number: z.string().min(1, "Account number is required"),
  bank_id: z.string().uuid(),
  currency_id: z.string().uuid(),
  company_id: z.string().uuid(),
  coa_id: z.string().uuid(),
  created_by_id: z.string().uuid(),
});
export type NewBankAccount = z.infer<typeof newBankAccount>;

export const updateBankAccount = newBankAccount.partial();
export type UpdateBankAccount = z.infer<typeof updateBankAccount>;

export const bankAccount = newBankAccount.merge(dbBaseFields);
export type BankAccount = z.infer<typeof bankAccount>;

export const bankAccountResponse = newBankAccount.extend({
  id: z.string().uuid(),
  bankName: z.string().optional(),
  currencyName: z.string().optional(),
  currencySymbol: z.string().optional(),
  currencyCode: z.string().optional(),
  bankAccountCoaName: z.string().optional(),
  bankAccountBalance: decimalSchema.optional(),
  bankLedgerBalance: decimalSchema.optional(),
  autoCategorisedCount: z.number().min(0).optional(),
  uncategorisedCount: z.number().min(0).optional(),
  totalTransactionCount: z.number().min(0).optional(),
});

export type BankAccountResponse = SnakeToCamelCaseObject<
  z.infer<typeof bankAccountResponse>
>;
