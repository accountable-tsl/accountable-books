import { type BankTransactionBatchInsert } from '@/features/bank-transactions/manual-upload/types';
import api from '@/lib/axios';
import { isAxiosError } from 'axios';

export async function uploadBankTransactions(companyId: string, data: BankTransactionBatchInsert) {
  try {
    const res = await api.post(`/api/${companyId}/bank-accounts/transactions/import`, data);

    return res.data;
  } catch (err) {
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }

    throw err;
  }
}
