import { FetchProjectsParams, NewProject } from '@/features/projects/projects-types';
import { queryClient } from '@/lib/queryClient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addNewProjects, fetchProjects } from '@/features/projects/projects-api';
import { toast } from 'sonner';

const CACHE_TIMES = {
  STALE: 1000 * 60 * 30, // 30mins
  GC: 1000 * 60 * 60 * 3, // 3 hours
};
const getProjectsCacheKey = (input: FetchProjectsParams) => {
  const { companyId, ...rest } = input;

  const normalized = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, [...value].sort()]; // sort copy of array
      }
      return [key, value];
    }),
  );

  return ['projects', input.companyId, normalized];
};

const invalidateProjectsCache = (companyId: string) => {
  queryClient.invalidateQueries({
    queryKey: ['projects', companyId],
    exact: false,
  });
};
export const useFetchProjects = (input: FetchProjectsParams) => {
  return useQuery({
    queryKey: getProjectsCacheKey(input),
    queryFn: () => fetchProjects(input),
    enabled: !!input.companyId && !!input.limit && !!input.page,
    staleTime: CACHE_TIMES.STALE,
    gcTime: CACHE_TIMES.GC,
  });
};

export const useCreateProjects = () => {
  return useMutation({
    mutationFn: ({ companyId, data }: { companyId: string; data: NewProject[] }) => {
      return addNewProjects({ companyId, data });
    },
    onSuccess: (response, variables) => {
      invalidateProjectsCache(variables.companyId);

      const { success, message } = response;
      if (success) {
        toast.success(message || 'Project created successfully');
      }
    },

    onError: (error: unknown) => toast.error(`Failed to create project`),
  });
};
