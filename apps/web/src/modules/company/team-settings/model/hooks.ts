import { useMemo } from 'react';
import { useSession } from '@session';
import { useQuery } from '@tanstack/react-query';

import { fetchTeamMembers, teamMembersQueryKey } from '../api';

import type { TeamMembersListResponse, TeamSettingsSummary } from './types';

function deriveSummary(
  members: TeamMembersListResponse['members'],
): TeamSettingsSummary {
  const total = members.length;
  const active = members.filter((m) => m.status === 'active').length;
  const invited = members.filter((m) => m.status === 'invited').length;
  const admins = members.filter(
    (m) => m.role === 'owner' || m.role === 'admin',
  ).length;
  return { total, active, invited, admins };
}

export function useTeamMembers() {
  const { companyId } = useSession();

  const query = useQuery({
    queryKey: teamMembersQueryKey(companyId),
    queryFn: fetchTeamMembers,
    staleTime: 60_000,
    enabled: Boolean(companyId),
  });

  const data = query.data;

  const members = data?.members ?? [];

  const summary = useMemo((): TeamSettingsSummary => {
    if (data?.summary) {
      return data.summary;
    }
    return deriveSummary(members);
  }, [data?.summary, members]);

  const isLoading = query.isPending && Boolean(companyId);

  return {
    members,
    summary,
    companyId,
    isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isSuccess: query.isSuccess,
  };
}
