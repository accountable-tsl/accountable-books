import { MOCK_FIRM_COMPANY_ID } from './practice-fixture-ids';

import type { FirmDashboardShellSnapshot } from '../model/types';

export const MOCK_FIRM_DASHBOARD_SHELL: FirmDashboardShellSnapshot = {
  firmCompanyId: MOCK_FIRM_COMPANY_ID,
  heroGreetingLine: 'Good morning, Sarah',
  heroSubline:
    "You've handled 142 transactions this week. Keep up the momentum.",
  viewerRole: 'manager',
  inviteClientRolesAllowed: ['admin', 'manager'],
  firmUserCount: 4,
  weeklyActivity: [
    { day: 'Mon', transactions: 72 },
    { day: 'Tue', transactions: 85 },
    { day: 'Wed', transactions: 61 },
    { day: 'Thu', transactions: 94 },
    { day: 'Fri', transactions: 64 },
    { day: 'Sat', transactions: 0 },
    { day: 'Sun', transactions: 0 },
  ],
  firmPerformanceStats: {
    transactionsToday: 64,
    transactionsWeek: 312,
    transactionsMonth: 1247,
    transactionsTodayPrev: 56,
    transactionsWeekPrev: 289,
    transactionsMonthPrev: 1104,
  },
};
