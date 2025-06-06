import api from "@/lib/axios";
import { BankAccountWithMeta, NewBankAccountInput } from "./types";
import { ApiResponse } from "@/types/types";

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

export async function getBankAccountsForCompany(
  companyId: string
): Promise<ApiResponse<BankAccountWithMeta[]>> {
  const response = await api.get(`/api/${companyId}/bank-accounts`);
  return response.data;
}
