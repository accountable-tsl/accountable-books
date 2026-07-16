import { z } from 'zod';

/** Read projection — never stored on bank_accounts or accepted as write input. */
export const bankAccountConnectionStatusSchema = z.enum([
  'connected',
  'revoked',
  'error',
  'not_connected',
]);
export type BankAccountConnectionStatus = z.infer<
  typeof bankAccountConnectionStatusSchema
>;

export const bankAccountTypeSchema = z.enum([
  'other',
  'credit_card',
  'debit_card',
  'savings',
  'checkings_current',
  'utility',
]);
export type BankAccountType = z.infer<typeof bankAccountTypeSchema>;

export const bankHistoricalImportStatusSchema = z.enum([
  'collecting',
  'available',
  'selected',
  'unavailable',
  'failed',
]);
export type BankHistoricalImportStatus = z.infer<
  typeof bankHistoricalImportStatusSchema
>;

export const bankHistoricalImportSchema = z.object({
  status: bankHistoricalImportStatusSchema,
  earliestTransactionDate: z.string().nullable(),
  latestTransactionDate: z.string().nullable(),
  transactionCount: z.number().int().min(0),
  selectedFromDate: z.string().nullable(),
});
export type BankHistoricalImport = z.infer<typeof bankHistoricalImportSchema>;

export const selectBankHistoryImportInputSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type SelectBankHistoryImportInput = z.infer<
  typeof selectBankHistoryImportInputSchema
>;

export const bankAccountWithMetaSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  accountType: bankAccountTypeSchema,
  mask: z.string(),
  balance: z.number().optional(),
  businessOrPersonal: z.enum(['business', 'personal']),

  bankId: z.uuid(),
  bankName: z.string(),
  bankLogo: z.string().nullish(),

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
  /** @deprecated Use bankConnectionId. Kept for response compatibility. */
  connectionCredentialId: z.string().nullish(),
  bankConnectionStatus: bankAccountConnectionStatusSchema.nullish(),
  bankAccountFeedId: z.string().nullish(),
  providerBankAccountId: z.string().nullish(),
  providerKey: z.string().nullish(),
  providerName: z.string().nullish(),
  providerLogo: z.string().nullish(),
  lastSyncAt: z.iso.datetime().nullish(),
  historicalImport: bankHistoricalImportSchema.nullable(),

  statementBalance: z.string(),
  ledgerBalance: z.string(),
  uncategorizedTxCount: z.number().min(0),
  needsReviewTxCount: z.number().min(0),
  providerRemovedReviewCount: z.number().min(0),
  latestExchangeRate: z.string().nullish(),
});
export type BankAccountWithMeta = z.infer<typeof bankAccountWithMetaSchema>;
