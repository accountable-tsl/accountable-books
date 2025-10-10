import api from '@/lib/axios';
import type { ApiResponse } from '@/shared/types/core';

export const syncTransactions = async ({
  credentialId,
}: {
  credentialId: string;
}): Promise<ApiResponse<{ jobId: string }>> => {
  const response = await api.post('/api/banking/sync-transactions', {
    credentialId,
  });
  return response.data;
};
