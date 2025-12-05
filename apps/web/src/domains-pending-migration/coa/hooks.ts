import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';

import {
  archiveCoa,
  createCoa,
  deleteCoa,
  editCoa,
  fetchChartOfAccounts,
  unarchiveCoa,
} from '@/domains-pending-migration/coa/api';
import {
  type CoaResponse,
  type CoaUpdateResponse,
  type CreateCoa,
  createCoaSchema,
  type EditCoaRequest,
  type FetchCoaInput,
} from '@/domains-pending-migration/coa/types';

type MUTATING_ACTION = 'create' | 'update' | 'delete' | 'archive' | 'unarchive';

const CACHE_TIMES = {
  STALE_TIME: 1000 * 60 * 60 * 1, // 1 hour
  GC_TIME: 1000 * 60 * 60 * 6, // 6 hours
} as const;

const handleMutationSuccess = (
  response: { data?: CoaUpdateResponse | null },
  action: string,
  companyId: string,
  queryClient: ReturnType<typeof useQueryClient>,
) => {
  queryClient.invalidateQueries({
    queryKey: ['coa', companyId],
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
};

export const useChartOfAccountsQuery = (params: FetchCoaInput) => {
  const companyId = params?.companyId;
  const includeDeleted = params?.includeDeleted ?? false;

  return useQuery<CoaResponse[], Error>({
    queryKey: ['coa', companyId, { includeDeleted }],
    queryFn: async () => {
      if (!companyId) throw new Error('Company ID is required');
      const res = await fetchChartOfAccounts(params);
      if (!res.success || res.data === undefined)
        throw new Error(res.message || 'Unexpected error');
      return res.data;
    },
    staleTime: includeDeleted ? 0 : CACHE_TIMES.STALE_TIME,
    gcTime: includeDeleted ? 0 : CACHE_TIMES.GC_TIME,
    enabled: !!companyId,
  });
};

export const useCompanyCoa = (companyId: string, includeDeleted = true) => {
  const { data, isLoading, isError } = useChartOfAccountsQuery({
    companyId,
    includeDeleted,
  });

  const coaCodes = useMemo(
    () => new Set(data?.map((coa) => coa.code) || []),
    [data],
  );
  const coaNames = useMemo(
    () => new Set(data?.map((coa) => coa.name) || []),
    [data],
  );

  // Lowercased sets for comparison only
  const lowerCoaCodes = useMemo(
    () => new Set(data?.map((coa) => coa.code?.toLowerCase()) || []),
    [data],
  );
  const lowerCoaNames = useMemo(
    () => new Set(data?.map((coa) => coa.name?.toLowerCase()) || []),
    [data],
  );

  return {
    isDuplicateCode: (code: string) => lowerCoaCodes.has(code.toLowerCase()),
    isDuplicateName: (name: string) => lowerCoaNames.has(name.toLowerCase()),

    coaCodes,
    coaNames,
    isLoading,
    isError,
  };
};

export const useCreateCoa = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      data: receivedData,
    }: {
      companyId: string;
      data: CreateCoa[];
    }) => {
      const data = createCoaSchema.array().parse(receivedData);
      return createCoa(companyId, data);
    },
    onSuccess: (response, variables) => {
      // Invalidate cache
      queryClient.invalidateQueries({
        queryKey: ['coa', variables.companyId],
        exact: false,
      });

      const { success, message } = response;
      if (success) {
        toast.success(message || 'Account created successfully');
      }
    },
    onError: (error) => handleMutationError('create', error),
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
        'Updated',
        variables.companyId,
        queryClient,
      );
    },
    onError: (error) => handleMutationError('update', error),
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
        'Archived',
        variables.companyId,
        queryClient,
      );
    },
    onError: (error) => handleMutationError('archive', error),
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
        'Restored',
        variables.companyId,
        queryClient,
      );
    },
    onError: (error) => handleMutationError('restore', error),
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
        'Deleted',
        variables.companyId,
        queryClient,
      );
    },
    onError: (error) => handleMutationError('delete', error),
  });
};
