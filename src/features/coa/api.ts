import api from "@/lib/axios";
import { CoaResponse, FetchCoaInput } from "@/features/coa/types";
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

// export async function updateAccount({
//   accountId,
//   companyId,
//   data,
// }: {
//   accountId: string;
//   companyId: string;
//   data: UpdateAccountInput;
// }): Promise<UpdateAccountResponse> {
//   try {
//     const response = await api.patch(
//       `/api/companies/${companyId}/coa/${accountId}`,
//       data
//     );
//     return {
//       success: true,
//       data: response.data,
//     };
//   } catch (error: any) {
//     return {
//       success: false,
//       message:
//         error?.response?.data?.message ||
//         error.message ||
//         "Failed to update account.",
//     };
//   }
// }
