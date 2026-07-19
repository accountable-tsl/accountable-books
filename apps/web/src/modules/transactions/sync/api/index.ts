import type { ApiResponse } from '@/shared/types/core';
import api from '@/lib/axios';

export const syncTransactions = async ({
  companyId,
  bankAccountId,
}: {
  companyId: string;
  bankAccountId: string;
}): Promise<ApiResponse<{ jobId: string }>> => {
  const response = await api.post('/api/banking/sync-transactions', {
    companyId,
    bankAccountId,
  });
  return response.data;
};
