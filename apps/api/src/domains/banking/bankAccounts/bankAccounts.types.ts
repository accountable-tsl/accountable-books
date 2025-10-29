import { z } from 'zod';
import { dbBaseFields, zDate } from '../../../core/types/core.js';
import {
  createCamelCaseSchema,
  type SnakeToCamelCaseObject,
} from '../../../shared/utils/formatting.utils.js';
import { coaSource } from '../../chartOfAccounts/coa.types.js';
import {
  bankObMetadata,
  bankOpeningBalanceOrigin,
  bankOpeningBalanceRole,
} from '../../balances/openingBalance/openingBalance.types.js';

export const bankAccountType = z.enum([
  'other',
  'credit_card',
  'debit_card',
  'savings',
  'checkings_current',
  'utility',
]);
export type BankAccountType = z.infer<typeof bankAccountType>;

export const businessOrPersonalAccount = z.enum(['business', 'personal']);
export type BusinessOrPersonalAccount = z.infer<
  typeof businessOrPersonalAccount
>;

export const bankAccountConnectionStatus = z.enum([
  'connected',
  'revoked',
  'error',
  'not_connected',
]);
export type BankAccountConnectionStatus = z.infer<
  typeof bankAccountConnectionStatus
>;

const manualBankAccountInput = z.object({
  id: z.uuid().optional(),
  display_name: z.string().min(1, 'Display name is required'),
  account_name: z.string().nullish(),
  account_number: z
    .string()
    .min(1, 'Account number is required')
    .max(50, 'Account number is too long'),
  account_number_mask: z.string().nullish(),
  account_type: bankAccountType.nullish(),
  account_metadata: z.any().nullish(),
  business_or_personal: businessOrPersonalAccount.optional(),
  connection_status: bankAccountConnectionStatus
    .extract(['not_connected'])
    .optional(), // must be not_connected, but allow frontend to omit it
  notes: z.string().nullish(),
  bank_id: z.uuid(),
  // Allow either currency_code or currencyId for frontend compatibility
  currency_code: z
    .string()
    .length(3, 'Currency code must be exactly 3 characters')
    .optional(),
  currency_id: z.uuid().optional(),
  coa_code: z.string().optional(),
  coa_name: z.string().max(256, 'Coa name is too long').nullish(),
  coa_description: z
    .string()
    .max(1024, 'Coa description is too long')
    .nullish(),
  source: coaSource.optional(),
  opening_balance: z
    .object({
      amount: z.number(),
      date: zDate,
      origin: bankOpeningBalanceOrigin,
      role: bankOpeningBalanceRole.optional(),
      metadata: bankObMetadata.optional(),
    })
    .optional(),
});

export const manualBankAccountInputCamel = createCamelCaseSchema(
  manualBankAccountInput,
);
export type ManualBankAccountInput = SnakeToCamelCaseObject<
  z.infer<typeof manualBankAccountInput>
>;
// company, coa, etc, to be added later

const connectionSpecificFields = z.object({
  provider_id: z.uuid(),
  provider_bank_account_id: z.string(),
  connection_credential_id: z.uuid(),
  connection_status: bankAccountConnectionStatus.extract(['connected']),
  last_sync_at: z.date().nullish(),
  sync_error: z.string().nullish(),
});

const merged = z.object({
  ...manualBankAccountInput.shape,
  ...connectionSpecificFields.shape,
});

export const bankAccountWithConnectionInput = createCamelCaseSchema(merged);
export type BankAccountWithConnectionInput = SnakeToCamelCaseObject<
  z.infer<typeof bankAccountWithConnectionInput>
>;

export const newBankAccountInput = z
  .object({
    ...manualBankAccountInput.shape,
    ...connectionSpecificFields.partial().shape,
  })
  .omit({
    connection_status: true,
  })
  .extend({
    connection_status: bankAccountConnectionStatus,
  });

export type NewBankAccountInput = z.infer<typeof newBankAccountInput>;

export const newBankAccount = newBankAccountInput
  .omit({
    currency_code: true,
    coa_name: true,
    coa_description: true,
    source: true,
    opening_balance: true,
  })
  .extend({
    company_id: z.uuid(),
    currency_id: z.uuid(),
    coa_id: z.uuid(),
    created_by_id: z.uuid(),
    updated_by_id: z.uuid().optional(),
  });
export type NewBankAccount = z.infer<typeof newBankAccount>;

export const bankAccount = z.object({
  ...newBankAccount.shape,
  ...dbBaseFields.shape,
});
export type BankAccount = z.infer<typeof bankAccount>;

export const bankAccountWithMeta = z.object({
  id: z.uuid(),
  displayName: z.string(),
  accountType: bankAccountType,
  // accountNumber: z.string(),
  mask: z.string(),

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
  coaCode: z.string().nullish(),
  coaTypeKey: z.string().nullish(),
  coaTypeLabel: z.string().nullish(),

  bankConnectionId: z.string().nullish(),
  bankConnectionStatus: bankAccountConnectionStatus.nullish(),
  providerBankAccountId: z.string().nullish(),
  providerKey: z.string().nullish(),
  providerName: z.string().nullish(),
  providerLogo: z.string().nullish(),
  connectionCredentialId: z.string().nullish(),
  lastSyncAt: z.date().nullish(),
  statementBalance: z.string(),
  ledgerBalance: z.string(),
  uncategorizedTxCount: z.number().min(0),
  needsReviewTxCount: z.number().min(0),
  latestExchangeRate: z.string().nullish(),
});
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
    connectionStatus: bankAccountConnectionStatus,
    notes: z.string(),
  })
  .partial();
export type UpdateBankAccount = z.infer<typeof updateBankAccount>;
