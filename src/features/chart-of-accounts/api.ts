import api from "@/lib/axios";
import { CoaResponse, FetchCoaInput } from "@/features/chart-of-accounts/types";
import { ApiResponse } from "@/shared/types/core";

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
