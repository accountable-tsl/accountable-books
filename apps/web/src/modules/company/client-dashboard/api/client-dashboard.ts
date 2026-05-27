import { MOCK_CLIENT_DASHBOARD_OVERVIEW } from '../lib/mock-client-dashboard-overview';

import type { ClientDashboardOverviewResponse } from '../model/types';

export function clientDashboardOverviewQueryKey() {
  return ['clientDashboardOverview'] as const;
}

export async function fetchClientDashboardOverview(): Promise<ClientDashboardOverviewResponse> {
  return MOCK_CLIENT_DASHBOARD_OVERVIEW;
}
