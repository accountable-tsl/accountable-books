import { useQuery } from '@tanstack/react-query';

import {
  clientDashboardOverviewQueryKey,
  fetchClientDashboardOverview,
} from '../api';

export function useClientDashboardOverview() {
  return useQuery({
    queryKey: clientDashboardOverviewQueryKey(),
    queryFn: fetchClientDashboardOverview,
    staleTime: 60_000,
  });
}
