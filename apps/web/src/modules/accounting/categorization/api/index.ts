import type { ApiResponse } from '@/shared/types/core';
import type { LedgerIntent } from '@accountable-books/contracts/schema';
import api from '@/lib/axios';

import type {
  CategorizationStatsResponse,
  GetCategorizationStatsParams,
  GetCategorizationTransactionsParams,
  GetCategorizationTransactionsResponse,
  SendCategorizationIntentResponse,
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
    bankAccountIds,
    searchQuery,
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

  if (status?.length) {
    status.forEach((s) => queryParams.append('status', s));
  }
  if (bankAccountIds?.length) {
    bankAccountIds.forEach((id) => queryParams.append('bankAccountIds', id));
  }
  if (searchQuery) {
    queryParams.append('searchQuery', searchQuery);
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

/**
 * Fetch categorization statistics from API
 */
export async function fetchCategorizationStats(
  params: GetCategorizationStatsParams,
): Promise<CategorizationStatsResponse> {
  const { companyId, bankAccountIds, dateFrom, dateTo } = params;

  const queryParams = new URLSearchParams();

  if (bankAccountIds?.length) {
    bankAccountIds.forEach((id) => queryParams.append('bankAccountIds', id));
  }
  if (dateFrom) {
    queryParams.append('dateFrom', dateFrom);
  }
  if (dateTo) {
    queryParams.append('dateTo', dateTo);
  }

  const response = await api.get<{
    success: boolean;
    data: CategorizationStatsResponse;
    message?: string;
  }>(`/api/${companyId}/categorization/stats?${queryParams.toString()}`);

  if (!response.data.success || !response.data.data) {
    throw new Error(
      response.data.message || 'Failed to fetch categorization stats',
    );
  }

  return response.data.data;
}

/**
 * Send categorization intent to backend
 * Posts user edits directly to ledger
 */
export async function sendCategorizationIntent(
  companyId: string,
  intent: LedgerIntent[],
): Promise<ApiResponse<SendCategorizationIntentResponse>> {
  const response = await api.post<
    ApiResponse<SendCategorizationIntentResponse>
  >(`/api/${companyId}/categorization/intents`, intent);

  if (!response.data.success) {
    throw new Error(
      response.data.message || 'Failed to send categorization intent',
    );
  }

  return response.data;
}
