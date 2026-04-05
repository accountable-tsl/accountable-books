import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  fetchFirmClientRoster,
  fetchFirmDashboardShell,
  fetchFirmTaskQueue,
  firmClientRosterQueryKey,
  firmDashboardShellQueryKey,
  firmTaskQueueQueryKey,
  inviteFirmClient,
} from '../api';
import { MOCK_FIRM_QUEUE_CURRENT_USER } from '../lib/mock-firm-task-queue';

import type { FetchFirmTaskQueueParams, FirmClientInvitePayload } from '../api';
import type {
  FirmClientSummary,
  FirmTaskQueueItem,
  FirmTaskQueueResponse,
  FirmViewerRole,
} from './types';

const EMPTY_SUMMARY: FirmTaskQueueResponse['summary'] = {
  totalTasks: 0,
  actionableCount: 0,
  waitingCount: 0,
  clientCompanyCount: 0,
  criticalCount: 0,
  dueTodayCount: 0,
};

export function useFirmDashboardShell() {
  return useQuery({
    queryKey: firmDashboardShellQueryKey(),
    queryFn: fetchFirmDashboardShell,
    staleTime: 60_000,
  });
}

export function useFirmClientRoster() {
  const query = useQuery({
    queryKey: firmClientRosterQueryKey(),
    queryFn: fetchFirmClientRoster,
    staleTime: 60_000,
  });

  return {
    firmCompanyId: query.data?.firmCompanyId,
    clients: query.data?.clients ?? [],
    isLoading: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isSuccess: query.isSuccess,
  };
}

export type InviteFirmClientVariables = {
  firmCompanyId: string;
  input: FirmClientInvitePayload;
};

export function useInviteFirmClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ firmCompanyId, input }: InviteFirmClientVariables) =>
      inviteFirmClient({ firmCompanyId, input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: firmClientRosterQueryKey() });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Could not send invite';
      toast.error(message);
    },
  });
}

export type UseFirmTaskQueueOptions = {
  viewerRole?: FirmViewerRole;
  myTasksOnly?: boolean;
  clientCompanyId?: string | null;
  teamMemberInitials?: string | null;
  clients: FirmClientSummary[];
  currentUserId?: string;
  enabled?: boolean;
};

export type FirmTaskQueueHookResult = Omit<
  FirmTaskQueueResponse,
  'firmCompanyId'
> & {
  firmCompanyId: string | undefined;
  items: FirmTaskQueueItem[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};

export function useFirmTaskQueue(
  options: UseFirmTaskQueueOptions,
): FirmTaskQueueHookResult {
  const {
    viewerRole,
    myTasksOnly = false,
    clientCompanyId = null,
    teamMemberInitials = null,
    clients,
    currentUserId,
    enabled = true,
  } = options;

  const fetchParams = useMemo<FetchFirmTaskQueueParams>(
    () => ({
      viewerRole,
      myTasksOnly,
      clientCompanyId,
      teamMemberInitials,
      clients,
      currentUserId: currentUserId ?? MOCK_FIRM_QUEUE_CURRENT_USER.userId,
    }),
    [
      viewerRole,
      myTasksOnly,
      clientCompanyId,
      teamMemberInitials,
      clients,
      currentUserId,
    ],
  );

  const query = useQuery({
    queryKey: firmTaskQueueQueryKey(fetchParams),
    queryFn: () => fetchFirmTaskQueue(fetchParams),
    staleTime: 60_000,
    enabled,
  });

  const actionableItems = query.data?.actionableItems ?? [];
  const waitingItems = query.data?.waitingItems ?? [];
  const summary = query.data?.summary ?? EMPTY_SUMMARY;

  const queueLoading = enabled ? query.isPending : true;

  return {
    firmCompanyId: query.data?.firmCompanyId,
    summary,
    actionableItems,
    waitingItems,
    items: [...actionableItems, ...waitingItems],
    isLoading: queueLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
