import api from '@/lib/axios';
import type { AccountMeta } from '@/domains-pending-migration/account-classification/types';

export const getAccountMeta = async (): Promise<AccountMeta> => {
  const response = await api.get('/api/accounts/classification/metadata');

  return response.data.data;
};
