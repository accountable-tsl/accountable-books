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

export const newBankAccountInput = z.object({
  id: z.string().uuid().optional(),
  display_name: z.string().min(1, "Display name is required"),
  account_type: bankAccountType,
  account_number: z.string().optional(),
  account_code: z.string().optional(),
  bank_id: z.string().uuid(),
  currency_id: z.string().uuid(),

  // company_id: z.string().uuid(),
  // coa_id: z.string().uuid(),
  // created_by_id: z.string().uuid(),
});
export type NewBankAccountInput = SnakeToCamelCaseObject<
  z.infer<typeof newBankAccountInput>
>;

export const newBankAccount = newBankAccountInput.extend({
  company_id: z.string().uuid(),
  coa_id: z.string().uuid(),
  created_by_id: z.string().uuid(),
  updated_by_id: z.string().uuid().optional(),
});

export type NewBankAccount = z.infer<typeof newBankAccount>;

export const updateBankAccount = newBankAccount.partial();
export type UpdateBankAccount = z.infer<typeof updateBankAccount>;

export const bankAccount = newBankAccount.merge(dbBaseFields);
export type BankAccount = z.infer<typeof bankAccount>;

export const bankAccountWithMeta = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  accountType: bankAccountType,
  accountNumber: z.string(),

  bankId: z.string().uuid(),
  bankName: z.string(),
  bankLogo: z.string().optional(),

  currencyId: z.string().uuid(),
  currencyName: z.string(),
  currencySymbol: z.string(),
  currencyCode: z.string(),

  companyId: z.string().uuid(),
  reportingCurrencyId: z.string().uuid(),
  reportingCurrencyName: z.string(),
  reportingCurrencySymbol: z.string(),
  reportingCurrencyCode: z.string(),

  coaId: z.string().uuid(),
  coaName: z.string(),
  coaCode: z.string().optional(),
  coaTypeKey: z.string().optional(),
  coaTypeLabel: z.string().optional(),
});
export type BankAccountWithMeta = z.infer<typeof bankAccountWithMeta>;

export const bankAccountWithBalancesAndStats = bankAccountWithMeta.extend({
  nativeBalance: decimalSchema,
  reportingBalanceFromBankTx: decimalSchema,
  reportingBalanceFromLedger: decimalSchema,
  transactionCount: z.number().min(0),
  categorizedCount: z.number().min(0),
  autoCategorizedCount: z.number().min(0),
  uncategorizedCount: z.number().min(0),
});
export type BankAccountWithBalancesAndStats = z.infer<
  typeof bankAccountWithBalancesAndStats
>;

export const bankAccountsMeta = z.object({
  totalAccounts: z.number().min(0),
  totalNativeBalance: decimalSchema,
  totalReportingFromBankTx: decimalSchema,
  totalReportingFromLedger: decimalSchema,
  totalTransactions: z.number().min(0),
  totalCategorizedCount: z.number().min(0),
  totalAutoCategorizedCount: z.number().min(0),
  totalUncategorizedCount: z.number().min(0),
});

export const companyBankingSnapshot = z.object({
  bankAccounts: z.array(bankAccountWithBalancesAndStats),
  totals: bankAccountsMeta,
});

export type CompanyBankingSnapshot = z.infer<typeof companyBankingSnapshot>;
