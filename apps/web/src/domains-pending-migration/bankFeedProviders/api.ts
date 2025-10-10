import api from '@/lib/axios';
import type { BankFeedProvider } from '@/domains-pending-migration/bankFeedProviders/types';
import type { ApiResponse } from '@/shared/types/core';

export const fetchBankFeedProviders = async ({
  providerIds,
  providerKeys,
}: {
  providerIds?: string[];
  providerKeys?: string[];
}): Promise<ApiResponse<BankFeedProvider[]>> => {
  const params = new URLSearchParams();
  if (providerIds?.length) params.append('providerIds', providerIds.join(','));
  if (providerKeys?.length)
    params.append('providerKeys', providerKeys.join(','));

  const res = await api.get(`/api/bank-feed-providers?${params.toString()}`);
  return res.data;
};
