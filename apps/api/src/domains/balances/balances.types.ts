import { z } from 'zod';

/**
 * Balance domain types
 */

export interface CompanyContext {
  companyId: string;
  defaultTimezone: string;
  reportingCurrencyId: string;
}

export interface BalanceSnapshot {
  balance: number;
  asOfTime: Date;
  day?: string; // YYYY-MM-DD format
}

export interface DailyBalance {
  day: string; // YYYY-MM-DD format
  opening_balance: number;
  day_debits: number;
  day_credits: number;
  closing_balance: number;
  transaction_count: number;
}

export interface BalanceRecalcResult {
  daysProcessed: number;
  snapshotsCreated: number;
  finalBalance: number;
  lastProcessedDate: string;
}

// // GL-specific types
// export interface GLBalanceRecalcParams {
//   companyId: string;
//   coaId: string;
//   recalcFrom: string; // ISO date string
//   recalcTo?: string; // Optional ISO date string to limit recalculation range
//   triggeredBy: 'ledger_entry' | 'backfill' | 'soft_delete' | 'manual';
// }

export interface GLCurrentBalanceView {
  companyId: string;
  coaId: string;
  asOfDate: string;
  calculatedAt: Date;
  reportingCurrencyBalance: number;
}

export interface GLDailySnapshot {
  companyId: string;
  coaId: string;
  day: string; // YYYY-MM-DD format
  reportingCurrencyBalance: number;
}

// // Bank-specific types
// export interface BankBalanceRecalcParams {
//   companyId: string;
//   bankAccountId: string;
//   recalcFrom: Date;
//   recalcTo?: Date;
//   triggeredBy:
//     | 'transaction'
//     | 'sync'
//     | 'csv_upload'
//     | 'soft_delete'
//     | 'manual'
//     | 'opening_balance_calculated'
//     | 'conversion_set';
//   userId?: string; // Optional: User ID for checkpoint attribution
// }

export interface BankCurrentBalance {
  companyId: string;
  bankAccountId: string;
  asOfTime: Date;
  nativeBalance: number;
}

export interface BankDailySnapshot {
  companyId: string;
  bankAccountId: string;
  day: string; // YYYY-MM-DD format
  closingBalance: number;
}

// Ledger entry type for GL calculations
export interface LedgerEntryForBalance {
  id: string;
  ledgerTransactionId: string;
  ledgerTransactionDate: Date | string;
  localDay: string; // Pre-calculated local day in company timezone (YYYY-MM-DD)
  amount: number; // Already in reporting currency
  createdAt: Date;
  isDeleted: boolean;
}

// Bank transaction type for bank balance calculations
export interface BankTransactionForBalance {
  id: string;
  txnAt: Date | string;
  localDay: string; // Pre-calculated local day in company timezone (YYYY-MM-DD)
  amount: number; // In native currency
  createdAt: Date;
  isDeleted: boolean;
}

// Validation schemas
export const bankBalanceRecalcParamsSchema = z.object({
  companyId: z.uuid(),
  bankAccountId: z.uuid(),
  recalcFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  recalcTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
    .optional(),
  triggeredBy: z.enum([
    'transaction',
    'sync',
    'csv_upload',
    'soft_delete',
    'manual',
    'opening_balance_calculated',
    'conversion_set',
  ]),
  userId: z.uuid().optional(),
});
export type BankBalanceRecalcParams = z.infer<
  typeof bankBalanceRecalcParamsSchema
>;

export const glBalanceRecalcParamsSchema = z.object({
  companyId: z.uuid(),
  coaId: z.uuid(),
  recalcFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  recalcTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
    .optional(),
  triggeredBy: z.enum([
    'ledger_entry',
    'backfill',
    'soft_delete',
    'supersession',
    'manual',
  ]),
});
export type GLBalanceRecalcParams = z.infer<typeof glBalanceRecalcParamsSchema>;

export interface GLDailyBalanceSnapshot {
  company_id: string;
  coa_id: string;
  day: string;
  opening_balance: string; // DECIMAL stored as string
  day_debits: string;
  day_credits: string;
  closing_balance: string;
  transaction_count: number;
  calculated_at: Date;
  created_at: Date;
}

export interface NewGLDailyBalanceSnapshot {
  company_id: string;
  coa_id: string;
  day: string;
  opening_balance: string | number;
  day_debits: string | number;
  day_credits: string | number;
  closing_balance: string | number;
  transaction_count: number;
  calculated_at?: Date;
}

export interface BankDailyBalanceSnapshot {
  company_id: string;
  bank_account_id: string;
  day: string;
  opening_balance: string;
  day_debits: string;
  day_credits: string;
  closing_balance: string;
  transaction_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface NewBankDailyBalanceSnapshot {
  company_id: string;
  bank_account_id: string;
  day: string;
  opening_balance: string | number;
  day_debits: string | number;
  day_credits: string | number;
  closing_balance: string | number;
  transaction_count: number;
}

export interface GLPeriodBalance {
  company_id: string;
  coa_id: string;
  fiscal_calendar_id: string;
  opening_balance: string;
  period_debits: string;
  period_credits: string;
  closing_balance: string;
  transaction_count: number;
  calculated_at: Date;
  created_at: Date;
}

export interface NewGLPeriodBalance {
  company_id: string;
  coa_id: string;
  fiscal_calendar_id: string;
  opening_balance: string | number;
  period_debits: string | number;
  period_credits: string | number;
  closing_balance: string | number;
  transaction_count: number;
  calculated_at?: Date;
}

export interface GLCurrentBalance {
  company_id: string;
  coa_id: string;
  as_of_date: string;
  reporting_currency_balance: string;
  calculated_at: Date;
  created_at: Date;
}

export interface NewGLCurrentBalance {
  company_id: string;
  coa_id: string;
  as_of_date: string;
  reporting_currency_balance: string | number;
  calculated_at?: Date;
}

export interface BankCurrentBalance {
  company_id: string;
  bank_account_id: string;
  native_balance: string;
  as_of_time: Date;
}

export interface NewBankCurrentBalance {
  company_id: string;
  bank_account_id: string;
  native_balance: string | number;
  as_of_time?: Date;
}

export interface TrialBalanceAccount {
  coaId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  openingBalance: string;
  periodDebits: string;
  periodCredits: string;
  closingBalance: string;
}

export interface TrialBalanceTotals {
  openingDebit: string;
  openingCredit: string;
  periodDebits: string;
  periodCredits: string;
  closingDebit: string;
  closingCredit: string;
}

export interface TrialBalanceResponse {
  period: {
    year: number;
    period: number;
    type: string;
    startDate: string;
    endDate: string;
  };
  accounts: TrialBalanceAccount[];
  totals: TrialBalanceTotals;
}
