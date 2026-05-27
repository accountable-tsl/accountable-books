import { useMutation, useQuery } from '@tanstack/react-query';

import { getCompanyDetails, updateCompanyDetails } from '../api';

import type { UpdateCompanyVitalsData } from './types';

export const useCompanyDetails = (companyId: string) => {
  return useQuery({
    queryKey: ['companyDetails', companyId],
    queryFn: async () => {
      const response = await getCompanyDetails(companyId);
      if (!response) {
        throw new Error('Company details response is undefined');
      }
      return response;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    gcTime: 1000 * 60 * 60 * 2, // 2 hours
    enabled: !!companyId,
  });
};

export function useUpdateCompanyDetails() {
  return useMutation({
    mutationFn: ({
      companyId,
      data,
    }: {
      companyId: string;
      data: Partial<UpdateCompanyVitalsData>;
    }) => updateCompanyDetails(companyId, data),
  });
}
