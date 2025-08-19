import api from '@/lib/axios';
import { ApiResponse } from '@/shared/types/core';
import { BankAccountWithMeta } from '@/domains/bank-accounts/types';

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
