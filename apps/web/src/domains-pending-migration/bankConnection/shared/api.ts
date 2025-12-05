import type {
  AddBankTransactionsResponse,
  BankTransactionBatchInput,
} from '@/domains-pending-migration/bankConnection/manualUpload/types';
import api from '@/lib/axios';
import type { BankAccountForApi } from '@/modules/banking/accounts';
import type { ApiResponse } from '@/shared/types/core';

export const addNewBankTransactions = async (
  companyId: string,
  data: BankTransactionBatchInput,
): Promise<ApiResponse<AddBankTransactionsResponse>> => {
  const response = await api.post(
    `/api/${companyId}/bank-accounts/transactions/import`,
    data,
  );
  return response.data;
};

export interface CreateBankAccountRes {
  coaId: string;
  bankAccountId: string;
  wasUpdated: boolean;
  bankAccountName: string;
  currencyCode: string;
  bankName: string;
}
export async function createNewBankAccount({
  companyId,
  data,
}: {
  companyId: string;
  data: BankAccountForApi;
  userId?: string;
}): Promise<ApiResponse<CreateBankAccountRes>> {
  const response = await api.post(`/api/${companyId}/bank-accounts`, data);
  return response.data;
}
