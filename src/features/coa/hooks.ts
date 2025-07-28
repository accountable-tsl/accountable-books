import {
  CoaResponse,
  CoaUpdateResponse,
  EditCoaRequest,
  FetchCoaInput,
} from "@/features/coa/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  archiveCoa,
  deleteCoa,
  editCoa,
  fetchChartOfAccounts,
  unarchiveCoa,
} from "@/features/coa/api";
import { toast } from "sonner";

const CACHE_TIMES = {
  STALE_TIME: 1000 * 60 * 60 * 0, // 1 hour
  GC_TIME: 1000 * 60 * 60 * 6 * 0, // 6 hours
} as const;

const handleMutationSuccess = (
  response: { data?: CoaUpdateResponse },
  action: string,
  companyId: string,
  queryClient: ReturnType<typeof useQueryClient>
) => {
  queryClient.invalidateQueries({
    queryKey: ["coa", companyId],
    exact: false,
  });

  const { updatedAccounts = [], errors = [] } = response.data || {};
  const successCount = updatedAccounts.length;
  const errorCount = errors.length;

  if (errorCount > 0) {
    toast.error(`${action} ${successCount} accounts. ${errorCount} failed.`);
  } else {
    const message =
      errorCount === 0 && successCount === 1
        ? `Account ${action.toLowerCase()} successfully`
        : `Successfully ${action.toLowerCase()} ${successCount} accounts`;
    toast.success(message);
  }
};

const handleMutationError = (action: string, error: unknown) => {
  toast.error(`Failed to ${action.toLowerCase()} accounts`);
  console.error(`${action} COA error:`, error);
};

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
    staleTime: CACHE_TIMES.STALE_TIME,
    gcTime: CACHE_TIMES.GC_TIME,
    enabled: !!companyId,
    refetchOnWindowFocus: false,
  });
};

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
    onSuccess: (response, variables) => {
      handleMutationSuccess(
        response,
        "Updated",
        variables.companyId,
        queryClient
      );
    },
    onError: (error) => handleMutationError("update", error),
  });
};

export const useArchiveCoa = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      accountIds,
    }: {
      companyId: string;
      accountIds: string[];
    }) => archiveCoa(companyId, accountIds),
    onSuccess: (response, variables) => {
      handleMutationSuccess(
        response,
        "Archived",
        variables.companyId,
        queryClient
      );
    },
    onError: (error) => handleMutationError("archive", error),
  });
};

export const useUnarchiveCoa = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      accountIds,
    }: {
      companyId: string;
      accountIds: string[];
    }) => unarchiveCoa(companyId, accountIds),
    onSuccess: (response, variables) => {
      handleMutationSuccess(
        response,
        "Restored",
        variables.companyId,
        queryClient
      );
    },
    onError: (error) => handleMutationError("restore", error),
  });
};

export const useDeleteCoa = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      accountIds,
    }: {
      companyId: string;
      accountIds: string[];
    }) => deleteCoa(companyId, accountIds),
    onSuccess: (response, variables) => {
      handleMutationSuccess(
        response,
        "Deleted",
        variables.companyId,
        queryClient
      );
    },
    onError: (error) => handleMutationError("delete", error),
  });
};
