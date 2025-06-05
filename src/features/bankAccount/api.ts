import api from "@/lib/axios";
import {
  BankAccountWithMeta,
  newBankAccountInput,
  NewBankAccountInput,
} from "./types";
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

export async function getBankAccounts(companyId: string) {}
