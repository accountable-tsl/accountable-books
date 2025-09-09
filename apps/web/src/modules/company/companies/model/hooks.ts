import { QueryClient, useQuery } from '@tanstack/react-query';
import { getCompanyDetails } from '../api';

const invalidateCache = (queryClient: QueryClient, companyId: string) => {
  queryClient.invalidateQueries({ queryKey: ['companyDetails', companyId] });
};
export const useCompanyDetails = (companyId: string) => {
  return useQuery({
    queryKey: ['companyDetails', companyId],
    queryFn: () => getCompanyDetails(companyId),
    staleTime: 1000 * 60 * 0, // 10 minutes
    gcTime: 1000 * 60 * 60 * 0, // 2 hours
    enabled: !!companyId,
  });
};
