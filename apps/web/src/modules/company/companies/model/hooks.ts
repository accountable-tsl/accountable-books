import { useQuery } from '@tanstack/react-query';

import { getCompanyDetails } from '../api';

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
