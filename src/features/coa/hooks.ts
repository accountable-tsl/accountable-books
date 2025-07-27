import {
  CoaResponse,
  EditCoaRequest,
  FetchCoaInput,
} from "@/features/coa/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { editCoa, fetchChartOfAccounts } from "@/features/coa/api";
import { toast } from "sonner";
// import { updateAccount } from "./api";
// import { UpdateAccountInput, UpdateAccountResponse } from "./types";

export const useChartOfAccountsQuery = (params: FetchCoaInput) => {
  const companyId = params?.companyId;

  return useQuery<CoaResponse[], Error>({
    queryKey: ["coa", companyId],
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

export const useEditCoa = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      data,
    }: {
      companyId: string;
      data: EditCoaRequest;
    }) => editCoa(companyId, data),
    onSuccess: (data, variables) => {
      console.log({ data, variables });
      queryClient.invalidateQueries({
        queryKey: ["coa", variables.companyId],
        exact: false,
      });

      if (data.data?.errors && data.data?.errors.length > 0) {
        toast.error(
          `Updated ${data.data?.updatedAccounts.length} accounts. ${data.data.errors.length} failed.`
        );
      } else {
        toast.success("Account updated successfully");
      }
    },
    onError: (error) => {
      toast.error("Failed to update account");
      console.error("Edit COA error:", error);
    },
  });
};
