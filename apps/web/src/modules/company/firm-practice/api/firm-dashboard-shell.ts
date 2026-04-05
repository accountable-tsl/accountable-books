import { MOCK_FIRM_DASHBOARD_SHELL } from '../lib/mock-firm-dashboard-shell';

import type { FirmDashboardShellSnapshot } from '../model/types';

export function firmDashboardShellQueryKey() {
  return ['firmDashboardShell'] as const;
}

export async function fetchFirmDashboardShell(): Promise<FirmDashboardShellSnapshot> {
  return MOCK_FIRM_DASHBOARD_SHELL;
}
