import type { ApiResponse } from '@/shared/types/core';
import api from '@/lib/axios';

export const syncTransactions = async ({
  bankAccountId,
}: {
  bankAccountId: string;
}): Promise<ApiResponse<{ jobId: string }>> => {
  const response = await api.post('/api/banking/sync-transactions', {
    bankAccountId,
  });
  return response.data;
};
