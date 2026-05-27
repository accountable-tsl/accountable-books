import {
  countOpenTasksByClient,
  MOCK_FIRM_TASK_QUEUE_ITEMS,
} from './mock-firm-task-queue';
import { MOCK_CLIENT_COMPANY_ID, MOCK_USER_ID } from './practice-fixture-ids';

import type { FirmClientSummary, FirmTaskQueueItem } from '../model/types';

type FirmClientSeed = {
  id: string;
  name: string;
  shortCode?: string;
  industry?: string;
  assignee?: FirmClientSummary['assignee'];
  transactionStats?: FirmClientSummary['transactionStats'];
  isNew?: boolean;
};

function tasksForClient(
  clientId: string,
  all: FirmTaskQueueItem[],
): FirmTaskQueueItem[] {
  return all.filter((t) => t.clientCompanyId === clientId);
}

function deriveClientStatus(
  clientTasks: FirmTaskQueueItem[],
  isNew: boolean,
): FirmClientSummary['status'] {
  if (isNew) return 'new';
  if (clientTasks.length === 0) return 'healthy';
  if (clientTasks.some((t) => t.isOverdue)) return 'overdue';
  if (clientTasks.some((t) => t.actionabilityState !== 'actionable_now')) {
    return 'need_attention';
  }
  return 'healthy';
}

function deriveLastActivityLabel(clientTasks: FirmTaskQueueItem[]): string {
  if (clientTasks.length === 0) return 'No open tasks in queue';
  if (clientTasks.some((t) => t.actionabilityState === 'blocked_by_client')) {
    return 'Waiting on client (queue)';
  }
  if (clientTasks.some((t) => t.isOverdue)) {
    return 'Overdue work in queue';
  }
  if (
    clientTasks.some((t) => t.actionabilityState === 'blocked_by_dependency')
  ) {
    return 'Blocked by prerequisites';
  }
  return `${clientTasks.length} open in queue`;
}

function buildMockFirmClients(): FirmClientSummary[] {
  const openByClient = countOpenTasksByClient(MOCK_FIRM_TASK_QUEUE_ITEMS);

  const base: FirmClientSeed[] = [
    {
      id: MOCK_CLIENT_COMPANY_ID.acme,
      name: 'Acme Retail Ltd',
      shortCode: 'ACME',
      industry: 'Retail',
      assignee: {
        userId: MOCK_USER_ID.sarah,
        name: 'Sarah Chen',
        initials: 'SC',
      },
      transactionStats: {
        today: 18,
        week: 84,
        month: 342,
        todayPrev: 15,
        weekPrev: 78,
        monthPrev: 310,
      },
    },
    {
      id: MOCK_CLIENT_COMPANY_ID.hbv,
      name: 'HBV Ltd',
      shortCode: 'HBV',
      industry: 'Manufacturing',
      assignee: {
        userId: MOCK_USER_ID.james,
        name: 'James Obi',
        initials: 'JO',
      },
      transactionStats: {
        today: 0,
        week: 3,
        month: 45,
        todayPrev: 8,
        weekPrev: 52,
        monthPrev: 198,
      },
    },
    {
      id: MOCK_CLIENT_COMPANY_ID.summit,
      name: 'Summit Consulting',
      shortCode: 'SUMMIT',
      industry: 'Professional services',
      assignee: {
        userId: MOCK_USER_ID.sarah,
        name: 'Sarah Chen',
        initials: 'SC',
      },
      transactionStats: {
        today: 6,
        week: 31,
        month: 118,
        todayPrev: 5,
        weekPrev: 28,
        monthPrev: 105,
      },
    },
    {
      id: MOCK_CLIENT_COMPANY_ID.greenfield,
      name: 'Greenfield Foods',
      shortCode: 'GRNF',
      industry: 'Food & beverage',
      assignee: {
        userId: MOCK_USER_ID.james,
        name: 'James Obi',
        initials: 'JO',
      },
      transactionStats: {
        today: 2,
        week: 14,
        month: 89,
        todayPrev: 7,
        weekPrev: 35,
        monthPrev: 142,
      },
    },
    {
      id: MOCK_CLIENT_COMPANY_ID.techflow,
      name: 'TechFlow Inc',
      shortCode: 'TECH',
      industry: 'Technology',
      assignee: {
        userId: MOCK_USER_ID.maria,
        name: 'Maria Santos',
        initials: 'MS',
      },
      transactionStats: {
        today: 11,
        week: 52,
        month: 203,
        todayPrev: 9,
        weekPrev: 47,
        monthPrev: 189,
      },
    },
    {
      id: MOCK_CLIENT_COMPANY_ID.meridian,
      name: 'Meridian Properties',
      shortCode: 'MRDN',
      industry: 'Real estate',
      assignee: {
        userId: MOCK_USER_ID.maria,
        name: 'Maria Santos',
        initials: 'MS',
      },
      transactionStats: {
        today: 1,
        week: 8,
        month: 56,
        todayPrev: 4,
        weekPrev: 22,
        monthPrev: 78,
      },
    },
    {
      id: MOCK_CLIENT_COMPANY_ID.pioneer,
      name: 'Pioneer Logistics',
      shortCode: 'PNR',
      industry: 'Logistics',
      assignee: {
        userId: MOCK_USER_ID.sarah,
        name: 'Sarah Chen',
        initials: 'SC',
      },
      transactionStats: {
        today: 9,
        week: 42,
        month: 165,
        todayPrev: 8,
        weekPrev: 39,
        monthPrev: 150,
      },
    },
    {
      id: MOCK_CLIENT_COMPANY_ID.nova,
      name: 'Nova Design Studio',
      shortCode: 'NOVA',
      industry: 'Creative',
      isNew: true,
      transactionStats: {
        today: 4,
        week: 18,
        month: 18,
        todayPrev: 0,
        weekPrev: 0,
        monthPrev: 0,
      },
    },
    {
      id: MOCK_CLIENT_COMPANY_ID.apex,
      name: 'Apex Healthcare',
      shortCode: 'APEX',
      industry: 'Healthcare',
      assignee: {
        userId: MOCK_USER_ID.james,
        name: 'James Obi',
        initials: 'JO',
      },
      transactionStats: {
        today: 7,
        week: 38,
        month: 148,
        todayPrev: 6,
        weekPrev: 34,
        monthPrev: 131,
      },
    },
    {
      id: MOCK_CLIENT_COMPANY_ID.coastal,
      name: 'Coastal Ventures',
      shortCode: 'CSTL',
      industry: 'Investment',
      assignee: {
        userId: MOCK_USER_ID.sarah,
        name: 'Sarah Chen',
        initials: 'SC',
      },
      transactionStats: {
        today: 6,
        week: 22,
        month: 63,
        todayPrev: 5,
        weekPrev: 18,
        monthPrev: 55,
      },
    },
  ];

  return base.map((c) => {
    const qt = tasksForClient(c.id, MOCK_FIRM_TASK_QUEUE_ITEMS);
    return {
      ...c,
      openTaskCount: openByClient[c.id] ?? 0,
      status: deriveClientStatus(qt, Boolean(c.isNew)),
      lastActivityLabel: deriveLastActivityLabel(qt),
    };
  });
}

export const MOCK_FIRM_CLIENTS: FirmClientSummary[] = buildMockFirmClients();
