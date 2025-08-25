import type { BankAccountWithMeta, NewBankAccountInput } from '@/domains/bank-accounts/types';
import type {
  AddBankTransactionsResponse,
  BankTransactionBatchInput,
} from '@/features/bankConnection/manualUpload/types';
import api from '@/lib/axios';
import type { ApiResponse } from '@/shared/types/core';

export const addNewBankTransactions = async (
  companyId: string,
  data: BankTransactionBatchInput,
): Promise<ApiResponse<AddBankTransactionsResponse>> => {
  const response = await api.post(`/api/${companyId}/bank-accounts/transactions/import`, data);
  return response.data;
};

export async function createNewBankAccount({
  companyId,
  data,
}: {
  companyId: string;
  data: NewBankAccountInput;
  userId?: string;
}): Promise<ApiResponse<BankAccountWithMeta>> {
  const response = await api.post(`/api/${companyId}/bank-accounts`, data);
  return response.data;
}
