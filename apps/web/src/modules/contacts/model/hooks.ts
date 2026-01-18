import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { addNewContacts, fetchContacts } from '../api';
import type { GetContactsParams, NewContact } from './types';
import { newContact } from './types';

const CACHE_TIMES = {
  STALE: 1000 * 60 * 15, // 15 mins
  GC: 1000 * 60 * 60 * 1, // 1 hours
};

const getContactsCacheKey = (input: GetContactsParams) => {
  const { companyId, ...rest } = input;

  const normalized = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, [...value].sort()]; // sort copy of array
      }
      return [key, value];
    }),
  );

  return ['contacts', input.companyId, normalized];
};

export function useContacts(input: GetContactsParams) {
  const { companyId, limit, page } = input;
  return useQuery({
    queryKey: getContactsCacheKey(input),
    queryFn: () => fetchContacts(input),
    enabled: !!companyId && !!limit && !!page,
    staleTime: CACHE_TIMES.STALE,
    gcTime: CACHE_TIMES.GC,
  });
}

export function useContactsInfinite(params: Omit<GetContactsParams, 'page'>) {
  const { companyId, limit = 30, ...rest } = params;

  return useInfiniteQuery({
    queryKey: ['contacts', companyId, 'infinite', { ...rest, limit }],
    queryFn: ({ pageParam }) =>
      fetchContacts({ ...params, page: pageParam as number }),
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
}

export const useCreateContacts = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      data: input,
    }: {
      companyId: string;
      data: NewContact[];
    }) => {
      const data = newContact.array().parse(input);
      return addNewContacts({ companyId, data });
    },
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['contacts', variables.companyId],
        exact: false,
      });
    },
  });
};
