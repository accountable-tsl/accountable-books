import { useQuery } from '@tanstack/react-query';

import { fetchCategorizationTransactions } from '../api';
import { groupTransactionsByBankTxnId } from '../lib/transform';
import type {
  GetCategorizationTransactionsParams,
  GroupedTransaction,
} from './types';

/**
 * Hook to fetch and group categorization transactions
 * Pure domain hook - no UI concerns, no toasts
 */
export function useCategorizationTransactions(
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

export type UseCategorizationTransactionsResult = ReturnType<
  typeof useCategorizationTransactions
>;

export type GroupedTransactionsData = {
  transactions: GroupedTransaction[];
  total: number;
  limit: number;
  offset: number;
};
