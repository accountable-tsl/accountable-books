import { useQuery } from '@tanstack/react-query';

import { fetchBankFeedProviders } from './api';

export const useBankFeedProviders = ({
  providerIds,
  providerKeys,
}: {
  providerIds?: string[];
  providerKeys?: string[];
}) => {
  return useQuery({
    queryKey: ['bankFeedProviders', { providerIds, providerKeys }],
    queryFn: () => fetchBankFeedProviders({ providerIds, providerKeys }),
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60 * 6, // 6 hours
  });
};
