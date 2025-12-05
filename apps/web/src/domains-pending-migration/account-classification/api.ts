import type { AccountMeta } from '@/domains-pending-migration/account-classification/types';
import api from '@/lib/axios';

export const getAccountMeta = async (): Promise<AccountMeta> => {
  const response = await api.get('/api/accounts/classification/metadata');

  return response.data.data;
};
