import { addNewContacts, fetchContacts } from '@/features/contacts/contacts-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GetContactsParams, newContact, NewContact } from '@/features/contacts/contacts-types';
import { toast } from 'sonner';

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

const invalidateContactsCache = (companyId: string) => {
  const queryClient = useQueryClient();
  queryClient.invalidateQueries({
    queryKey: ['contacts', companyId],
    exact: false,
  });
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

export const useCreateContacts = () => {
  return useMutation({
    mutationFn: ({ companyId, data: input }: { companyId: string; data: NewContact[] }) => {
      const data = newContact.array().parse(input);
      return addNewContacts({ companyId, data });
    },

    onSuccess: (response, variables) => {
      invalidateContactsCache(variables.companyId);

      const { success, message } = response;
      if (success) {
        toast.success(message || 'Contact created successfully');
      }
    },

    onError: (error: any) => toast.error(`Failed to create contact`),
  });
};
