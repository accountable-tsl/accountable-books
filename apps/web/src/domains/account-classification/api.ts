import api from '@/lib/axios';
import { AccountMeta } from '@/domains/account-classification/types';

export const getAccountMeta = async (): Promise<AccountMeta> => {
  const response = await api.get('/api/accounts/classification/metadata');

  return response.data.data;
};
