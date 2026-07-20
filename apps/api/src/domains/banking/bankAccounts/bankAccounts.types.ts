import {
  bankAccountConnectionStatusSchema,
  bankAccountTypeSchema,
  bankAccountWithMetaSchema,
  businessOrPersonalAccountSchema,
} from '@accountable-books/contracts/schema';
import { z } from 'zod';

import { dbBaseFields, zDate } from '../../../core/types/core.js';
import { createCamelCaseSchema } from '../../../shared/utils/formatting.utils.js';
import {
  bankObMetadata,
  bankOpeningBalanceOrigin,
  bankOpeningBalanceRole,
} from '../../balances/opening-balance/opening-balance.types.js';
import {
  coaCodeInput,
  coaNameInput,
  coaSource,
} from '../../chart-of-accounts/coa.types.js';

import type { SnakeToCamelCaseObject } from '../../../shared/utils/formatting.utils.js';

export const bankAccountType = bankAccountTypeSchema;
export type BankAccountType = z.infer<typeof bankAccountType>;

export const businessOrPersonalAccount = businessOrPersonalAccountSchema;
export type BusinessOrPersonalAccount = z.infer<
  typeof businessOrPersonalAccount
>;

/** Read projection over feed/connection facts — never stored on bank_accounts. */
export const bankAccountConnectionStatus = bankAccountConnectionStatusSchema;
export type BankAccountConnectionStatus = z.infer<
  typeof bankAccountConnectionStatus
>;

const openingBalanceInput = z.object({
  amount: z.number(),
  date: zDate,
  origin: bankOpeningBalanceOrigin,
  role: bankOpeningBalanceRole.optional(),
  metadata: bankObMetadata.optional(),
});

const manualBankAccountInput = z.object({
  id: z.uuid().optional(),
  display_name: z.string().trim().min(1, 'Display name is required'),
  official_name: z.string().trim().min(1).nullish(),
  account_number: z
    .string()
    .min(1, 'Account number is required')
    .max(50, 'Account number is too long'),
  account_type: bankAccountType.nullish(),
  business_or_personal: businessOrPersonalAccount.optional(),
  bank_id: z.uuid(),
  currency_code: z
    .string()
    .length(3, 'Currency code must be exactly 3 characters')
    .optional(),
  currency_id: z.uuid().optional(),
  coa_code: coaCodeInput,
  coa_name: coaNameInput.nullish(),
  coa_description: z.string().max(512, 'Coa description is too long').nullish(),
  source: coaSource.optional(),
  opening_balance: openingBalanceInput.optional(),
});

export const manualBankAccountInputCamel = createCamelCaseSchema(
  manualBankAccountInput,
);
export type ManualBankAccountInput = SnakeToCamelCaseObject<
  z.infer<typeof manualBankAccountInput>
>;

// Mask-only rows cannot rematch by fingerprint on a later connect.
const bankAccountConnectInput = z.object({
  display_name: z.string().trim().min(1, 'Display name is required'),
  official_name: z.string().trim().min(1).nullish(),
  account_number: z
    .string()
    .min(1, 'Account number is required')
    .max(50, 'Account number is too long')
    .optional(),
  account_number_mask: z.string().trim().min(1).max(16).nullish(),
  account_type: bankAccountType.nullish(),
  currency_code: z
    .string()
    .length(3, 'Currency code must be exactly 3 characters')
    .optional(),
  bank_id: z.uuid(),
  business_or_personal: businessOrPersonalAccount.optional(),
  opening_balance: openingBalanceInput.optional(),
});

export const bankAccountWithConnectionInput = createCamelCaseSchema(
  bankAccountConnectInput,
);
export type BankAccountWithConnectionInput = SnakeToCamelCaseObject<
  z.infer<typeof bankAccountConnectInput>
>;

export const newBankAccountInput = manualBankAccountInput.extend({
  account_number: z.string().min(1).max(50).optional(),
  account_number_mask: z.string().trim().min(1).max(16).nullish(),
});
export type NewBankAccountInput = z.infer<typeof newBankAccountInput>;

export const newBankAccount = z.object({
  id: z.uuid().optional(),
  display_name: z.string().trim().min(1),
  official_name: z.string().trim().min(1).nullish(),
  account_number_mask: z.string().trim().min(1).nullish(),
  account_number_fingerprint: z.string().trim().min(1).nullish(),
  account_number_fingerprint_version: z.number().int().min(1).nullish(),
  account_type: bankAccountType.nullish(),
  business_or_personal: businessOrPersonalAccount.nullish(),
  bank_id: z.uuid(),
  currency_id: z.uuid(),
  company_id: z.uuid(),
  coa_id: z.uuid(),
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().nullish(),
});
export type NewBankAccount = z.infer<typeof newBankAccount>;

export const bankAccount = z.object({
  ...newBankAccount.shape,
  ...dbBaseFields.shape,
});
export type BankAccount = z.infer<typeof bankAccount>;

export const bankAccountWithMeta = bankAccountWithMetaSchema;
export type BankAccountWithMeta = z.infer<typeof bankAccountWithMeta>;

export const bankAccountWithBalancesAndStats = bankAccountWithMeta.extend({
  nativeBalance: z.number(),
  reportingBalanceFromBankTx: z.number(),
  reportingBalanceFromLedger: z.number(),
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
  totalNativeBalance: z.number(),
  totalReportingFromBankTx: z.number(),
  totalReportingFromLedger: z.number(),
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

export const updateBankAccount = z
  .object({
    id: z.uuid(),
    displayName: z.string(),
    accountType: bankAccountType,
    businessOrPersonal: businessOrPersonalAccount,
  })
  .partial();
export type UpdateBankAccount = z.infer<typeof updateBankAccount>;
