import api from '@/lib/axios';

import type {
  GetCategorizationTransactionsParams,
  GetCategorizationTransactionsResponse,
} from '../model/types';

/**
 * Fetch categorization transactions from API
 */
export async function fetchCategorizationTransactions(
  params: GetCategorizationTransactionsParams,
): Promise<GetCategorizationTransactionsResponse> {
  const {
    companyId,
    dateFrom,
    dateTo,
    status,
    limit = 100,
    offset = 0,
  } = params;

  // Format dates as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const queryParams = new URLSearchParams({
    dateFrom: formatDate(dateFrom),
    dateTo: formatDate(dateTo),
    limit: limit.toString(),
    offset: offset.toString(),
  });

  if (status) {
    queryParams.append('status', status);
  }

  const response = await api.get<{
    success: boolean;
    data: GetCategorizationTransactionsResponse;
    message?: string;
  }>(`/api/${companyId}/categorization/transactions?${queryParams.toString()}`);

  if (!response.data.success || !response.data.data) {
    throw new Error(
      response.data.message || 'Failed to fetch categorization transactions',
    );
  }

  // Transform date strings to Date objects
  const transactions = response.data.data.transactions.map((txn) => ({
    ...txn,
    date: new Date(txn.date),
    fs_date: new Date(txn.fs_date),
  }));

  return {
    ...response.data.data,
    transactions,
  };
}
