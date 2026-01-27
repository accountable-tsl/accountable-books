import { getCompanyDetails } from '@/domains-pending-migration/company/api';
import { queryClient } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';

const invalidateCache = (companyId: string) => {
  queryClient.invalidateQueries({ queryKey: ['companyDetails', companyId] });
};
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
    staleTime: 1000 * 60 * 0, // 10 minutes
    gcTime: 1000 * 60 * 60 * 0, // 2 hours
    enabled: !!companyId,
  });
};
