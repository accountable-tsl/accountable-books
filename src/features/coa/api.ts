import api from "@/lib/axios";
import {
  CoaResponse,
  CoaUpdateResponse,
  EditCoaRequest,
  FetchCoaInput,
} from "@/features/coa/types";
import { ApiResponse } from "@/shared/types/core";
// import { UpdateAccountInput, UpdateAccountResponse } from "./types";

export const fetchChartOfAccounts = async (
  input: FetchCoaInput
): Promise<ApiResponse<CoaResponse[]>> => {
  const { companyId, accountId, accountCode, active, accountTypeKey } = input;
  const params = new URLSearchParams();

  if (accountId !== undefined) params.append("id", accountId.toString());
  if (accountCode !== undefined) params.append("code", accountCode);
  if (active !== undefined) params.append("active", active.toString());
  if (accountTypeKey !== undefined) params.append("key", accountTypeKey);

  const queryString = params.toString();
  const url = `/api/${companyId}/coa${queryString ? "?" + queryString : ""}`;

  const res = await api.get(url);
  return res.data;
};

// Edit a single COA record
export const editCoa = async (
  companyId: string,
  data: EditCoaRequest
): Promise<ApiResponse<CoaUpdateResponse>> => {
  const response = await api.patch(`/api/${companyId}/coa/edit`, data);
  return response.data;
};

// Bulk archive COA records
export const archiveCoa = async (
  companyId: string,
  accountIds: string[]
): Promise<ApiResponse<CoaUpdateResponse>> => {
  const response = await api.patch(`/api/${companyId}/coa/archive`, accountIds);
  return response.data;
};

// Bulk unarchive COA records
export const unarchiveCoa = async (
  companyId: string,
  accountIds: string[]
): Promise<ApiResponse<CoaUpdateResponse>> => {
  const response = await api.patch(
    `/api/${companyId}/coa/unarchive`,
    accountIds
  );
  return response.data;
};

// Bulk delete COA records
export const deleteCoa = async (
  companyId: string,
  accountIds: string[]
): Promise<ApiResponse<CoaUpdateResponse>> => {
  const response = await api.delete(`/api/${companyId}/coa`, {
    data: accountIds,
  });
  return response.data;
};
