import api from '@/lib/axios';
import type {
  CoaResponse,
  CoaUpdateResponse,
  CreateCoa,
  EditCoaRequest,
  FetchCoaInput,
} from '@/features/coa/types';
import type { ApiResponse } from '@/shared/types/core';

export const fetchChartOfAccounts = async (
  input: FetchCoaInput,
): Promise<ApiResponse<CoaResponse[]>> => {
  const { companyId, accountId, accountCode, active, accountTypeKey, includeDeleted } = input;
  const params = new URLSearchParams();

  if (accountId !== undefined) params.append('id', accountId.toString());
  if (accountCode !== undefined) params.append('code', accountCode);
  if (active !== undefined) params.append('active', active.toString());
  if (accountTypeKey !== undefined) params.append('key', accountTypeKey);
  if (includeDeleted !== undefined) params.append('includeDeleted', includeDeleted.toString());

  const queryString = params.toString();
  const url = `/api/${companyId}/coa${queryString ? '?' + queryString : ''}`;

  const res = await api.get(url);
  return res.data;
};

export const createCoa = async (
  companyId: string,
  data: CreateCoa[],
): Promise<ApiResponse<number | string>> => {
  const response = await api.post(`/api/${companyId}/coa`, data);
  return response.data;
};

// Edit a single COA record
export const editCoa = async (
  companyId: string,
  data: EditCoaRequest,
): Promise<ApiResponse<CoaUpdateResponse>> => {
  const response = await api.patch(`/api/${companyId}/coa/edit`, data);
  return response.data;
};

// Bulk archive COA records
export const archiveCoa = async (
  companyId: string,
  accountIds: string[],
): Promise<ApiResponse<CoaUpdateResponse>> => {
  const data = accountIds.map((id) => ({ id }));
  const response = await api.patch(`/api/${companyId}/coa/archive`, data);
  return response.data;
};

// Bulk unarchive COA records
export const unarchiveCoa = async (
  companyId: string,
  accountIds: string[],
): Promise<ApiResponse<CoaUpdateResponse>> => {
  const data = accountIds.map((id) => ({ id }));

  const response = await api.patch(`/api/${companyId}/coa/unarchive`, data);
  return response.data;
};

// Bulk delete COA records
export const deleteCoa = async (
  companyId: string,
  accountIds: string[],
): Promise<ApiResponse<CoaUpdateResponse>> => {
  const data = accountIds.map((id) => ({ id }));

  const response = await api.delete(`/api/${companyId}/coa`, {
    data,
  });
  return response.data;
};
