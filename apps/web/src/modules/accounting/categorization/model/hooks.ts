import { useMutation, useQuery } from '@tanstack/react-query';

import {
  fetchCategorizationTransactions,
  sendCategorizationIntent,
} from '../api';
import {
  groupCategorizationTransactions,
  groupTransactionsByBankTxnId,
} from '../lib/transform';
import type { Intent, IntentActionType } from './intent-types';
import type {
  GetCategorizationTransactionsParams,
  GroupedTransaction,
} from './types';

/**
 * Hook to fetch and group categorization transactions
 * Pure domain hook - no UI concerns, no toasts
 */
export function useCategorizationTransactionsOld(
  params: GetCategorizationTransactionsParams,
) {
  return useQuery({
    queryKey: [
      'categorization-transactions',
      params.companyId,
      params.dateFrom,
      params.dateTo,
      params.status,
      params.limit,
      params.offset,
    ],
    queryFn: async () => {
      const response = await fetchCategorizationTransactions(params);
      const grouped = groupTransactionsByBankTxnId(response.transactions);
      return {
        transactions: grouped,
        total: response.total,
        limit: response.limit,
        offset: response.offset,
      };
    },
    enabled: !!params.companyId && !!params.dateFrom && !!params.dateTo,
  });
}
export function useCategorizationTransactions(
  params: GetCategorizationTransactionsParams,
  exchangeRateOverrides?: Map<string, number>,
) {
  return useQuery({
    queryKey: [
      'categorization-transactions',
      params.companyId,
      params.dateFrom,
      params.dateTo,
      params.status,
      params.limit,
      params.offset,
      // Include overrides in query key - convert to sorted array for stable key
      exchangeRateOverrides
        ? Array.from(exchangeRateOverrides.entries()).sort()
        : undefined,
    ],
    queryFn: async () => {
      const response = await fetchCategorizationTransactions(params);
      const grouped = groupCategorizationTransactions(
        response.transactions,
        exchangeRateOverrides,
      );
      return {
        transactions: grouped,
        total: response.total,
        limit: response.limit,
        offset: response.offset,
      };
    },
    enabled: !!params.companyId && !!params.dateFrom && !!params.dateTo,
  });
}

export type UseCategorizationTransactionsResult = ReturnType<
  typeof useCategorizationTransactions
>;

export type GroupedTransactionsData = {
  transactions: GroupedTransaction[];
  total: number;
  limit: number;
  offset: number;
};

/**
 * Hook to send categorization intent
 * Pure domain hook - no UI concerns, no toasts
 */
export function useSendCategorizationIntent() {
  return useMutation({
    mutationFn: ({
      companyId,
      intent,
    }: {
      companyId: string;
      intent: Intent<IntentActionType>[];
    }) => sendCategorizationIntent(companyId, intent),
  });
}
