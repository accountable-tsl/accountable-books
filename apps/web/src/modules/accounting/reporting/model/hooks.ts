import type { QueryClient } from '@tanstack/react-query';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
  fetchBalanceSheet,
  fetchIncomeStatement,
  fetchStatementLineAccountTransactions,
  fetchStatementLineDetails,
} from '../api';

import type {
  ApiPeriod,
  FetchBalanceSheetParams,
  FetchIncomeStatementParams,
  FetchStatementLineAccountTransactionsParams,
  FetchStatementLineDetailsParams,
} from './types';

const reportingKeys = {
  all: ['reporting'] as const,
  company: (companyId: string) => [...reportingKeys.all, companyId] as const,
  incomeStatement: (companyId: string, period: ApiPeriod) =>
    [...reportingKeys.company(companyId), 'income-statement', period] as const,
  balanceSheet: (companyId: string, period: ApiPeriod) =>
    [...reportingKeys.company(companyId), 'balance-sheet', period] as const,
  statementLineDetails: (
    companyId: string,
    statementType: 'income' | 'balance',
    lineId: string,
    period: ApiPeriod,
  ) =>
    [
      ...reportingKeys.company(companyId),
      'statement-line-details',
      statementType,
      lineId,
      period,
    ] as const,
  statementLineAccountTransactions: (
    companyId: string,
    statementType: 'income' | 'balance',
    lineId: string,
    accountId: string,
    period: ApiPeriod,
  ) =>
    [
      ...reportingKeys.company(companyId),
      'statement-line-account-transactions',
      statementType,
      lineId,
      accountId,
      period,
    ] as const,
};

const STALE_MS = 1000 * 60 * 5;

export function useIncomeStatement(params: FetchIncomeStatementParams) {
  return useQuery({
    queryKey: reportingKeys.incomeStatement(params.companyId, params.period),
    queryFn: () => fetchIncomeStatement(params),
    enabled: !!params.companyId,
    staleTime: STALE_MS,
  });
}

export function useBalanceSheet(params: FetchBalanceSheetParams) {
  return useQuery({
    queryKey: reportingKeys.balanceSheet(params.companyId, params.period),
    queryFn: () => fetchBalanceSheet(params),
    enabled: !!params.companyId,
    staleTime: STALE_MS,
  });
}

export function useStatementLineDetails(
  params: FetchStatementLineDetailsParams,
) {
  return useQuery({
    queryKey: reportingKeys.statementLineDetails(
      params.companyId,
      params.statementType,
      params.lineId,
      params.period,
    ),
    queryFn: () => fetchStatementLineDetails(params),
    enabled:
      !!params.companyId &&
      !!params.lineId &&
      (params.statementType === 'income' || params.statementType === 'balance'),
    staleTime: STALE_MS,
  });
}

export function useStatementLineTransactions(
  params: Omit<FetchStatementLineAccountTransactionsParams, 'cursor'>,
) {
  return useInfiniteQuery({
    queryKey: reportingKeys.statementLineAccountTransactions(
      params.companyId,
      params.statementType,
      params.lineId,
      params.accountId,
      params.period,
    ),
    queryFn: async ({ pageParam }) => {
      const result = await fetchStatementLineAccountTransactions({
        ...params,
        cursor: pageParam as string | undefined,
      });
      return result;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled:
      !!params.companyId &&
      !!params.lineId &&
      !!params.accountId &&
      (params.statementType === 'income' || params.statementType === 'balance'),
    staleTime: STALE_MS,
  });
}

export function invalidateReporting(
  queryClient: QueryClient,
  companyId: string,
) {
  queryClient.invalidateQueries({
    queryKey: reportingKeys.company(companyId),
  });
}
