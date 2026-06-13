import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  addNewProjects,
  deleteProject,
  fetchProjects,
  updateProjects,
} from '../api';

import type { FetchProjectsParams, NewProject, UpdateProject } from './types';

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

export const useFetchProjects = (input: FetchProjectsParams) => {
  return useQuery({
    queryKey: getProjectsCacheKey(input),
    queryFn: () => fetchProjects(input),
    enabled: !!input.companyId && !!input.limit && !!input.page,
    staleTime: CACHE_TIMES.STALE,
    gcTime: CACHE_TIMES.GC,
  });
};

export const useProjectsInfinite = (
  params: Omit<FetchProjectsParams, 'page'>,
) => {
  const { companyId, limit = 30, ...rest } = params;

  return useInfiniteQuery({
    queryKey: ['projects', companyId, 'infinite', { ...rest, limit }],
    queryFn: ({ pageParam }) =>
      fetchProjects({ ...params, page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const pagination = lastPage.data?.pagination;
      return pagination?.hasNext ? pagination.currentPage + 1 : undefined;
    },
    enabled: !!companyId && !!limit,
    staleTime: CACHE_TIMES.STALE,
    gcTime: CACHE_TIMES.GC,
    placeholderData: (previousData) => previousData,
  });
};

export const useCreateProjects = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      data,
    }: {
      companyId: string;
      data: NewProject[];
    }) => {
      return addNewProjects({ companyId, data });
    },
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', variables.companyId],
        exact: false,
      });
    },
  });
};

export const useUpdateProjects = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      data,
    }: {
      companyId: string;
      data: UpdateProject[];
    }) => {
      return updateProjects({ companyId, data });
    },
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', variables.companyId],
        exact: false,
      });
    },
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      projectId,
    }: {
      companyId: string;
      projectId: string;
    }) => {
      return deleteProject({ companyId, projectId });
    },
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', variables.companyId],
        exact: false,
      });
    },
  });
};
