import { CoaResponse, FetchCoaInput } from "@/features/chart-of-accounts/types";
import { useQuery } from "@tanstack/react-query";
import { fetchChartOfAccounts } from "@/features/chart-of-accounts/api";

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

// TODO: Remember to invalidate on mutations
