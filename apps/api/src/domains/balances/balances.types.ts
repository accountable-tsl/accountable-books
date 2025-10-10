import type { Decimal } from 'decimal.js';

/**
 * Balance domain types
 */

export interface CompanyContext {
  companyId: string;
  defaultTimezone: string;
  reportingCurrencyId: string;
}

export interface BalanceSnapshot {
  balance: string | Decimal;
  asOfTime: Date;
  day?: string; // YYYY-MM-DD format
}

export interface DailyBalance {
  day: string; // YYYY-MM-DD format
  balance: string | Decimal;
  transactionCount?: number;
}

export interface BalanceRecalcResult {
  daysProcessed: number;
  snapshotsCreated: number;
  snapshotsUpdated: number;
  finalBalance: string;
  lastProcessedDate: string;
}

// GL-specific types
export interface GLBalanceRecalcParams {
  companyId: string;
  coaId: string;
  recalcFrom: string; // ISO date string
  triggeredBy: 'ledger_entry' | 'backfill' | 'soft_delete' | 'manual';
}

export interface GLCurrentBalance {
  companyId: string;
  coaId: string;
  asOfTime: Date;
  reportingCurrencyBalance: string | Decimal;
}

export interface GLDailySnapshot {
  companyId: string;
  coaId: string;
  day: string; // YYYY-MM-DD format
  reportingCurrencyBalance: string | Decimal;
}

// Bank-specific types
export interface BankBalanceRecalcParams {
  companyId: string;
  bankAccountId: string;
  recalcFrom: string; // ISO date string
  triggeredBy: 'transaction' | 'sync' | 'csv_upload' | 'soft_delete' | 'manual';
}

export interface BankCurrentBalance {
  companyId: string;
  bankAccountId: string;
  asOfTime: Date;
  nativeBalance: string | Decimal;
}

export interface BankDailySnapshot {
  companyId: string;
  bankAccountId: string;
  day: string; // YYYY-MM-DD format
  nativeBalance: string | Decimal;
}

// Ledger entry type for GL calculations
export interface LedgerEntryForBalance {
  id: string;
  ledgerTransactionId: string;
  ledgerTransactionDate: Date | string;
  localDay: string; // Pre-calculated local day in company timezone (YYYY-MM-DD)
  amount: string | Decimal; // Already in reporting currency
  createdAt: Date;
  isDeleted: boolean;
}

// Bank transaction type for bank balance calculations
export interface BankTransactionForBalance {
  id: string;
  txnAt: Date | string;
  localDay: string; // Pre-calculated local day in company timezone (YYYY-MM-DD)
  amount: string | Decimal; // In native currency
  createdAt: Date;
  isDeleted: boolean;
}
