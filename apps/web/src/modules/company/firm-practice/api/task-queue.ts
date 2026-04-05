import {
  MOCK_FIRM_QUEUE_CURRENT_USER,
  MOCK_FIRM_TASK_QUEUE_ITEMS,
} from '../lib/mock-firm-task-queue';
import { MOCK_FIRM_COMPANY_ID } from '../lib/practice-fixture-ids';
import { firmTaskQueueResponseSchema } from '../model/types';

import type {
  FirmClientSummary,
  FirmTaskActionabilityState,
  FirmTaskQueueItem,
  FirmTaskQueueResponse,
  FirmTaskQueueSummary,
  FirmViewerRole,
} from '../model/types';

const PRIORITY_ORDER: Record<FirmTaskQueueItem['priority'], number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const WAITING_KIND_ORDER: Record<FirmTaskActionabilityState, number> = {
  actionable_now: 9,
  blocked_by_client: 0,
  blocked_by_dependency: 1,
  informational: 2,
};

function startOfTodayUtc(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isDueToday(isoDate: string | null): boolean {
  if (!isoDate) return false;
  return isoDate.slice(0, 10) === startOfTodayUtc();
}

function sortActionableItems(items: FirmTaskQueueItem[]): FirmTaskQueueItem[] {
  return [...items].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    const da = a.dueDate ?? '\xff';
    const db = b.dueDate ?? '\xff';
    if (da !== db) return da < db ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

function sortWaitingItems(items: FirmTaskQueueItem[]): FirmTaskQueueItem[] {
  return [...items].sort((a, b) => {
    const wa = WAITING_KIND_ORDER[a.actionabilityState];
    const wb = WAITING_KIND_ORDER[b.actionabilityState];
    if (wa !== wb) return wa - wb;
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    const da = a.dueDate ?? '\xff';
    const db = b.dueDate ?? '\xff';
    if (da !== db) return da < db ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

function splitByActionability(items: FirmTaskQueueItem[]): {
  actionable: FirmTaskQueueItem[];
  waiting: FirmTaskQueueItem[];
} {
  const actionable = items.filter(
    (t) => t.actionabilityState === 'actionable_now',
  );
  const waiting = items.filter(
    (t) => t.actionabilityState !== 'actionable_now',
  );
  return {
    actionable: sortActionableItems(actionable),
    waiting: sortWaitingItems(waiting),
  };
}

function buildSummary(
  actionable: FirmTaskQueueItem[],
  waiting: FirmTaskQueueItem[],
): FirmTaskQueueSummary {
  const merged = [...actionable, ...waiting];
  const clients = new Set(merged.map((t) => t.clientCompanyId));
  let critical = 0;
  let dueToday = 0;
  for (const t of merged) {
    if (t.priority === 'urgent' || t.priority === 'high') critical += 1;
    if (isDueToday(t.dueDate)) dueToday += 1;
  }
  return {
    totalTasks: merged.length,
    actionableCount: actionable.length,
    waitingCount: waiting.length,
    clientCompanyCount: clients.size,
    criticalCount: critical,
    dueTodayCount: dueToday,
  };
}

export type FetchFirmTaskQueueParams = {
  viewerRole?: FirmViewerRole;
  myTasksOnly?: boolean;
  clientCompanyId?: string | null;
  teamMemberInitials?: string | null;
  currentUserId?: string;
  clients: FirmClientSummary[];
};

export function firmTaskQueueQueryKey(params: FetchFirmTaskQueueParams) {
  const {
    viewerRole,
    myTasksOnly,
    clientCompanyId,
    teamMemberInitials,
    currentUserId,
    clients,
  } = params;
  const clientFingerprint = clients
    .map(
      (c) =>
        `${c.id}:${c.assignee?.initials ?? ''}:${c.openTaskCount}:${c.status}`,
    )
    .sort()
    .join('|');
  return [
    'firmTaskQueue',
    {
      viewerRole: viewerRole ?? null,
      myTasksOnly: myTasksOnly ?? false,
      clientCompanyId: clientCompanyId ?? null,
      teamMemberInitials: teamMemberInitials ?? null,
      currentUserId: currentUserId ?? MOCK_FIRM_QUEUE_CURRENT_USER.userId,
      clientFingerprint,
    },
  ] as const;
}

function applyFilters(params: FetchFirmTaskQueueParams): FirmTaskQueueItem[] {
  const {
    myTasksOnly = false,
    clientCompanyId = null,
    teamMemberInitials = null,
    clients,
    currentUserId = MOCK_FIRM_QUEUE_CURRENT_USER.userId,
  } = params;

  const clientById = new Map(clients.map((c) => [c.id, c]));

  let list = MOCK_FIRM_TASK_QUEUE_ITEMS;

  if (clientCompanyId) {
    list = list.filter((t) => t.clientCompanyId === clientCompanyId);
  }

  if (myTasksOnly) {
    list = list.filter((t) => t.assignedTo?.userId === currentUserId);
  }

  if (teamMemberInitials) {
    list = list.filter((t) => {
      if (t.assignedTo?.initials === teamMemberInitials) return true;
      const client = clientById.get(t.clientCompanyId);
      return client?.assignee?.initials === teamMemberInitials;
    });
  }

  return list;
}

function buildFirmTaskQueueResponse(
  params: FetchFirmTaskQueueParams,
): Omit<FirmTaskQueueResponse, 'firmCompanyId'> {
  const filtered = applyFilters(params);
  const { actionable, waiting } = splitByActionability(filtered);
  return {
    actionableItems: actionable,
    waitingItems: waiting,
    summary: buildSummary(actionable, waiting),
  };
}

async function fetchFirmTaskQueueFromMock(
  params: FetchFirmTaskQueueParams,
): Promise<FirmTaskQueueResponse> {
  return firmTaskQueueResponseSchema.parse({
    firmCompanyId: MOCK_FIRM_COMPANY_ID,
    ...buildFirmTaskQueueResponse(params),
  });
}

export async function fetchFirmTaskQueue(
  params: FetchFirmTaskQueueParams,
): Promise<FirmTaskQueueResponse> {
  return fetchFirmTaskQueueFromMock(params);
}
