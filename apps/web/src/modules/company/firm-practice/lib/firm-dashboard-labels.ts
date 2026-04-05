import type { FirmViewerRole } from '../model/types';

export function getFirmTransactionStatsLabel(
  viewerRole: FirmViewerRole,
  firmUserCount: number,
): string {
  const isFreelancer = firmUserCount === 1;
  if (isFreelancer || viewerRole === 'staff') return 'Transactions';
  if (viewerRole === 'manager') return 'Team transactions';
  return 'Firm transactions';
}

export function firmShowsTeamFeatures(
  viewerRole: FirmViewerRole,
  firmUserCount: number,
): boolean {
  if (firmUserCount === 1) return false;
  return viewerRole === 'manager' || viewerRole === 'admin';
}
