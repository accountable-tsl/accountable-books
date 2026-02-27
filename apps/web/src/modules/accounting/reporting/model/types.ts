import type {
  BalanceSheetResponse,
  IncomeStatementResponse,
  StatementLineAccountTransactionsResponse,
  StatementLineDetailResponse,
} from '@accountable-books/contracts/schema';

/** Period shape sent to reporting API. */
export type ApiPeriod = {
  periodType: 'monthly' | 'quarterly' | 'yearly';
  fiscalYear: number;
  periodNumber: number;
  startDate: string;
  endDate: string;
};

export type FetchIncomeStatementParams = {
  companyId: string;
  period: ApiPeriod;
  framework?: 'ifrs' | 'us_gaap' | null;
};

export type FetchBalanceSheetParams = {
  companyId: string;
  period: ApiPeriod;
  framework?: 'ifrs' | 'us_gaap' | null;
};

export type FetchStatementLineDetailsParams = {
  companyId: string;
  statementType: 'income' | 'balance';
  lineId: string;
  period: ApiPeriod;
};

export type FetchStatementLineAccountTransactionsParams = {
  companyId: string;
  statementType: 'income' | 'balance';
  lineId: string;
  accountId: string;
  period: ApiPeriod;
  cursor?: string;
  limit?: number;
};

export type {
  IncomeStatementResponse,
  BalanceSheetResponse,
  StatementLineDetailResponse,
  StatementLineAccountTransactionsResponse,
};
