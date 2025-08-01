import {
  addNewContacts,
  fetchContacts,
} from "@/features/contacts/contacts-api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { newContact, NewContact } from "@/features/contacts/contacts-types";
import { toast } from "sonner";

const CACHE_TIMES = {
  STALE: 1000 * 60 * 30, // 30mins
  GC: 1000 * 60 * 60 * 3, // 3 hours
};

const CACHE_KEY = (companyId: string) => ["contacts", companyId];

export function useContacts(companyId: string) {
  return useQuery({
    queryKey: CACHE_KEY(companyId),
    queryFn: () => fetchContacts(companyId),
    enabled: !!companyId,
    staleTime: CACHE_TIMES.STALE,
    gcTime: CACHE_TIMES.GC,
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

    onSuccess: (response, variables) => {
      queryClient.invalidateQueries({
        queryKey: CACHE_KEY(variables.companyId),
        exact: false,
      });

      const { success, message } = response;
      if (success) {
        toast.success(message || "Contact created successfully");
      }
    },

    onError: (error: any) => toast.error(`Failed to create contact`),
  });
};
