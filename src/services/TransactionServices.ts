import axios from "axios";
import qs from "qs";
import {
  AccountingTxnFilters,
  BankTransactionBatch,
  BankTransactionFilters,
  CatEngineTransaction,
  ServerResponseFormat,
} from "../types/types";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const postBankTransactions = async (
  companyId: string | number,
  data: BankTransactionBatch
): Promise<ServerResponseFormat> => {
  const response = await axios.post(
    `${backendUrl}/api/${companyId}/bank-accounts/transactions/import`,
    data
  );
  return response.data.response;
};

export const retrieveTransactions = async (
  companyId: string | number,
  filters: BankTransactionFilters
) => {
  const response = await axios.get(
    `${backendUrl}/api/${companyId}/transactions`,
    {
      params: filters,
      paramsSerializer: (params) => {
        return qs.stringify(params, { arrayFormat: "repeat" }); // Serialize without `[]`
      },
    }
  );

  return response.data;
};

export const categoriseTransactions = async (
  companyId: string,
  transactions: CatEngineTransaction[]
) => {
  const response = await axios.post(
    `${backendUrl}/api/${companyId}/transactions/categorise`,
    transactions
  );

  return response.data;
};

export const fetchGenLedgerEntries = async (
  companyId: string,
  filters: AccountingTxnFilters
): Promise<ServerResponseFormat> => {
  const response = await axios.post(
    `${backendUrl}/api/${companyId}/t`,
    filters
  );

  return response.data;
};
