import type { LedgerIntent } from '@accountable-books/contracts/schema';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@tanstack/react-query';

import {
  fetchCategorizationTransactions,
  sendCategorizationIntent,
} from '../api';
import {
  groupCategorizationTransactions,
  groupTransactionsByBankTxnId,
} from '../lib/transform';

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
      params.bankAccountIds,
      params.searchQuery,
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
// export function useCategorizationTransactions(
//   params: GetCategorizationTransactionsParams,
// ) {
//   return useQuery({
//     queryKey: [
//       'categorization-transactions',
//       params.companyId,
//       params.dateFrom,
//       params.dateTo,
//       params.status,
//       params.limit,
//       params.offset,
//     ],
//     queryFn: async () => {
//       const response = await fetchCategorizationTransactions(params);
//       const grouped = groupCategorizationTransactions(response.transactions);
//       return {
//         transactions: grouped,
//         total: response.total,
//         limit: response.limit,
//         offset: response.offset,
//       };
//     },
//     enabled: !!params.companyId && !!params.dateFrom && !!params.dateTo,
//   });
// }

/**
 * Hook to fetch and group categorization transactions for the categorization engine.
 * This is a local version that keeps the React Query logic co-located with the intent emitter.
 * Other parts of the app can use the version in @/modules/accounting/categorization/model/hooks.
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
      const grouped = groupCategorizationTransactions(response.transactions);
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

export type GroupedTransactionsPage = GroupedTransactionsData;

export function useInfiniteCategorizationTransactions(
  params: Omit<GetCategorizationTransactionsParams, 'offset'>,
) {
  return useInfiniteQuery({
    queryKey: [
      'categorization-transactions',
      params.companyId,
      params.dateFrom,
      params.dateTo,
      params.status,
      params.bankAccountIds,
      params.searchQuery,
      params.limit,
    ],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await fetchCategorizationTransactions({
        ...params,
        offset: pageParam,
      });
      const grouped = groupCategorizationTransactions(response.transactions);
      return {
        transactions: grouped,
        total: response.total,
        limit: response.limit,
        offset: response.offset,
      };
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    enabled: !!params.companyId && !!params.dateFrom && !!params.dateTo,
  });
}

/**
 * Hook to send categorization intent
 */
export function useSendCategorizationIntent() {
  return useMutation({
    mutationFn: ({
      companyId,
      intent,
    }: {
      companyId: string;
      intent: LedgerIntent[];
    }) => sendCategorizationIntent(companyId, intent),
    // Note: Cache updates are handled in sendPendingChanges within usePendingChangesEmitter
    // to enable intelligent merging with pending changes. No invalidation needed here.
  });
}
