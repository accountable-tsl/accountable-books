import {
  AddBankTransactionsResponse,
  BankTransactionBatchInput,
} from "@/features/bankTransactions/types";
import api from "@/lib/axios";
import { ApiResponse } from "@/shared/types/core";

export const addNewBankTransactions = async (
  companyId: string,
  data: BankTransactionBatchInput
): Promise<ApiResponse<AddBankTransactionsResponse>> => {
  const response = await api.post(
    `/api/${companyId}/bank-accounts/transactions/import`,
    data
  );
  return response.data;
};
