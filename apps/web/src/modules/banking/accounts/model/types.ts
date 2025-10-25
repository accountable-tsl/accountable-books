import type { CreateBankAccountRes } from '@/domains-pending-migration/bankConnection/shared/api';
import { coaSource } from '@/domains-pending-migration/coa/types';
import { zDate } from '@/shared/types/core';
import { z } from 'zod';

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
  'checkings_current',
  'savings',
  'utility',
  'credit_card',
  'debit_card',
  'other',
]);
export type BankAccountType = z.infer<typeof bankAccountType>;

export const bankOpeningBalanceOrigin = z.enum(['user_entered']);
export const bankOpeningBalanceRole = z.enum([
  'baseline',
  'checkpoint',
  'archived',
]);

export const newBankAccountInput = z.object({
  displayName: z
    .string()
    .min(1, 'Account name is required')
    .regex(/.*[^0-9].*/, 'Account name cannot be just numbers'),
  bankId: z.uuid('Please select a valid bank'),
  currencyId: z.uuid('Please select a valid currency'),
  accountType: bankAccountType.optional(),
  accountNumber: z.string().min(1, 'Account number is required'),
  accountCode: z.string().optional(),
  source: coaSource.prefault('user').optional(),
  openingBalance: z.number().optional(),
  openingBalanceDate: z.string().optional(),
  accountMetadata: z.record(z.string(), z.any()).optional(),
});

const openingBalance = z.object({
  amount: z.number(),
  date: zDate,
  origin: bankOpeningBalanceOrigin,
  role: bankOpeningBalanceRole,
  metadata: z.object({
    captureChannel: z.enum(['user_account_creation', 'ui']).optional(),
    captureInitiator: z.enum(['user']),
    note: z.string().max(1024).optional(),
  }),
});
const bankAccountForApi = newBankAccountInput
  .omit({ openingBalance: true, openingBalanceDate: true })
  .extend({
    openingBalance: openingBalance.optional(),
  });
export type NewBankAccountInput = z.infer<typeof newBankAccountInput>;
export type BankAccountForApi = z.infer<typeof bankAccountForApi>;

export interface AddBankAccountProps {
  onSuccess?: (data?: CreateBankAccountRes) => void;
  onCancel?: () => void;
}

export type AddBankAccountDialogProps = AddBankAccountProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overlayClassName?: string;
  showHeader?: boolean;
};

export const bankAccountWithMeta = z.object({
  id: z.uuid(),
  displayName: z.string(),
  accountType: bankAccountType,
  mask: z.string(),
  balance: z.number().optional(),

  bankId: z.uuid(),
  bankName: z.string(),
  bankLogo: z.string().optional(),

  currencyId: z.uuid(),
  currencyName: z.string(),
  currencySymbol: z.string(),
  currencyCode: z.string(),

  companyId: z.uuid(),
  reportingCurrencyId: z.uuid(),
  reportingCurrencyName: z.string(),
  reportingCurrencySymbol: z.string(),
  reportingCurrencyCode: z.string(),

  coaId: z.uuid(),
  coaName: z.string(),
  coaCode: z.string().optional(),
  coaTypeKey: z.string().optional(),
  coaTypeLabel: z.string().optional(),
  connectionCredentialId: z.string().optional(),
  lastSyncAt: z.date().optional(),
});
export type BankAccountWithMeta = z.infer<typeof bankAccountWithMeta>;

export const bankAccountConnectionStatus = z.enum([
  'connected',
  'revoked',
  'error',
  'not_connected',
]);
export type BankAccountConnectionStatus = z.infer<
  typeof bankAccountConnectionStatus
>;

export const businessOrPersonalAccount = z.enum(['business', 'personal']);
export type BusinessOrPersonalAccount = z.infer<
  typeof businessOrPersonalAccount
>;

export const updateBankAccount = z
  .object({
    id: z.uuid(),
    displayName: z.string(),
    accountType: bankAccountType,
    businessOrPersonal: businessOrPersonalAccount,
    connectionStatus: bankAccountConnectionStatus,
    notes: z.string(),
  })
  .partial();
export type UpdateBankAccount = z.infer<typeof updateBankAccount>;

export interface MinimalBankAccountDetails {
  id: string;
  displayName: string;
  mask: string;
  businessOrPersonal: BusinessOrPersonalAccount;
  currencyCode: string;
  bankName: string;
}
