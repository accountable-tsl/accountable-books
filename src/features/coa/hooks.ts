import { CoaResponse, FetchCoaInput } from "@/features/coa/types";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { fetchChartOfAccounts } from "@/features/coa/api";
// import { updateAccount } from "./api";
// import { UpdateAccountInput, UpdateAccountResponse } from "./types";

export const useChartOfAccountsQuery = (params: FetchCoaInput) => {
  const companyId = params?.companyId;

  return useQuery<CoaResponse[], Error>({
    queryKey: ["coa", companyId, params],
    queryFn: async () => {
      if (!companyId) throw new Error("Company ID is required");
      const res = await fetchChartOfAccounts(params);
      if (!res.success || res.data === undefined)
        throw new Error(res.message || "Unexpected error");
      return res.data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 6, // 6 hours
    enabled: !!companyId,
    refetchOnWindowFocus: false,
  });
};

// export function useUpdateAccountMutation(companyId: string) {
//   const queryClient = useQueryClient();
//   return useMutation({
//     mutationFn: async ({
//       accountId,
//       data,
//     }: {
//       accountId: string;
//       data: UpdateAccountInput;
//     }) => {
//       return updateAccount({ accountId, companyId, data });
//     },
//     onSuccess: () => {
//       queryClient.invalidateQueries(["chartOfAccounts", companyId]);
//     },
//   });
// }

// TODO: Remember to invalidate on mutations
