import { coaSource } from "@/features/coa/types";
import { z } from "zod";

export interface BankAccount {
  id: string;
  bankId?: string;
  bank?: Bank;
  displayName: string;
  bankAccountType?: BankAccountType;
  bankAccountNo?: string;
  bankBalance: string | number;
  lastReconciled?: Date | string | null;
  currencyId?: string;
  currency?: Currency;
  companyId?: string;
  company?: Company;
  coaId?: string | null;
  accountInCoa?: Coa | null;
  transactionBatches?: BankTransactionBatch[];
  autoCategorisedCount?: number | string;
  uncategorisedCount?: number | string;
  totalTransactionCount?: number | string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BankAccounts = BankAccount[];

export const bankAccountType = z.enum([
  "checkings_current",
  "savings",
  "utility",
  "credit_card",
  "debit_card",
  "other",
]);
export type BankAccountType = z.infer<typeof bankAccountType>;

export const newBankAccountInput = z.object({
  displayName: z
    .string()
    .min(1, "Account name is required")
    .regex(/.*[^0-9].*/, "Account name cannot be just numbers"),
  bankId: z.string().uuid("Please select a valid bank"),
  currencyId: z.string().uuid("Please select a valid currency"),
  accountType: bankAccountType.optional(),
  accountNumber: z.string().min(1, "Account number is required"),
  accountCode: z.string().optional(),
  source: coaSource.default("user").optional(),
});
export type NewBankAccountInput = z.infer<typeof newBankAccountInput>;

export interface AddBankAccountProps {
  onSuccess?: (data?: BankAccountWithMeta) => void;
  onCancel?: () => void;
}

export type AddBankAccountDialogProps = AddBankAccountProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overlayClassName?: string;
  showHeader?: boolean;
};

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
