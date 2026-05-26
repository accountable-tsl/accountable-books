import api from '@/lib/axios';
import qs from 'qs';

import type {
  AccountingTxnFilters,
  ApiResponse,
  BankTransactionBatch,
  BankTransactionFilters,
  CatEngineTransaction,
} from '../types/core';

export const postBankTransactions = async (
  companyId: string | number,
  data: BankTransactionBatch,
): Promise<ApiResponse> => {
  const response = await api.post(
    `/api/${companyId}/bank-accounts/transactions/import`,
    data,
  );
  return response.data.response;
};

export const retrieveTransactions = async (
  companyId: string | number,
  filters: BankTransactionFilters,
) => {
  const response = await api.get(`/api/${companyId}/transactions`, {
    params: filters,
    paramsSerializer: (params) => {
      return qs.stringify(params, { arrayFormat: 'repeat' }); // Serialize without `[]`
    },
  });

  return response.data;
};

export const categoriseTransactions = async (
  companyId: string,
  transactions: CatEngineTransaction[],
) => {
  const response = await api.post(
    `/api/${companyId}/transactions/categorise`,
    transactions,
  );

  return response.data;
};

export const fetchGenLedgerEntries = async (
  companyId: string,
  filters: AccountingTxnFilters,
): Promise<ApiResponse> => {
  const response = await api.post(`/api/${companyId}/t`, filters);

  return response.data;
};
