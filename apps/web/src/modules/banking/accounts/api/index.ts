import api from '@/lib/axios';
import type { ApiResponse } from '@/shared/types/core';
import type {
  BankAccountWithMeta,
  UpdateBankAccount,
  MinimalBankAccountDetails,
} from '../model/types';

// export const createBankAccount = async (
//   companyId: string,
//   data: newBankAccountParams
// ) => {
//   const response = await api.post(
//     `${backendUrl}/api/${companyId}/bank-accounts`,
//     data
//   );
//   return response.data;
// };

// export const getBankAccounts = async (companyId: string) => {
//   const response = await api.get(`/api/${companyId}/bank-accounts`);
//   return response.data;
// };

// export const getBankAccountById = async (
//   companyId: string,
//   bankAccountId: string
// ) => {
//   const response = await axios.get(
//     `${backendUrl}/api/${companyId}/bank-accounts/${bankAccountId}`
//   );
//   return response.data;
// };

export async function getBankAccountsForCompany(
  companyId: string,
): Promise<ApiResponse<BankAccountWithMeta[]>> {
  const response = await api.get(`/api/${companyId}/bank-accounts`);
  return response.data;
}

export async function updateBankAccounts(
  companyId: string,
  data: UpdateBankAccount[],
): Promise<ApiResponse<number>> {
  const response = await api.patch(`/api/${companyId}/bank-accounts`, data);
  return response.data;
}

export async function getMinimalBankAccountDetails({
  bankAccountIds,
  companyId,
}: {
  bankAccountIds?: string[];
  companyId: string;
}): Promise<ApiResponse<MinimalBankAccountDetails[]>> {
  const params = new URLSearchParams();
  if (bankAccountIds && bankAccountIds.length > 0) {
    bankAccountIds.forEach((id) => params.append('bankAccountIds', id));
  }

  const response = await api.get(
    `/api/${companyId}/bank-accounts/minimal?${params.toString()}`,
  );
  return response.data;
}
