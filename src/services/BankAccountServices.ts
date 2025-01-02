import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

type newBankAccountParams = {
  bankId: string | number;
  displayName: string;
  bankAccountType: string;
  bankAccountNo: string;
  currencyId: string | number;
};

export const createBankAccount = async (
  companyId: any,
  data: newBankAccountParams
) => {
  const response = await axios.post(
    `${backendUrl}/api/${companyId}/bank-accounts`,
    data
  );
  return response.data;
};

export const getBankAccounts = async (companyId: string) => {
  const response = await axios.get(
    `${backendUrl}/api/${companyId}/bank-accounts`
  );
  return response.data;
};

export const getBankAccountById = async (
  companyId: string,
  bankAccountId: string
) => {
  const response = await axios.get(
    `${backendUrl}/api/${companyId}/bank-accounts/${bankAccountId}`
  );
  return response.data;
};
