import type { QueryFunction } from '@tanstack/react-query';
import { teamMembersListResponseSchema } from '@accountable-books/contracts/schema';

import { MOCK_TEAM_MEMBERS_RESPONSE } from '../lib/mock-team-members';

import type { TeamMembersListResponse } from '../model/types';

/** Invite / row actions: enable when mutations are wired (Phase 4). */
export const TEAM_SETTINGS_UI_ACTIONS_ENABLED = false;

/**
 * Demo / local mock data. Production builds return an empty list until the API exists unless
 * `VITE_ENABLE_TEAM_SETTINGS_MOCK=true` is set (e.g. staging demos).
 */
export function shouldUseMockTeamData(): boolean {
  if (import.meta.env.DEV) return true;
  return import.meta.env.VITE_ENABLE_TEAM_SETTINGS_MOCK === 'true';
}

export function teamMembersQueryKey(companyId: string | undefined) {
  return ['team-settings', 'members', companyId ?? 'none'] as const;
}

export const fetchTeamMembers: QueryFunction<
  TeamMembersListResponse,
  ReturnType<typeof teamMembersQueryKey>
> = async (context) => {
  const [, , companyId] = context.queryKey;

  if (companyId == null || companyId === 'none') {
    throw new Error('Team members require a company context.');
  }

  if (!shouldUseMockTeamData()) {
    return teamMembersListResponseSchema.parse({
      companyId,
      members: [],
      summary: { total: 0, active: 0, invited: 0, admins: 0 },
    });
  }

  return teamMembersListResponseSchema.parse({
    ...MOCK_TEAM_MEMBERS_RESPONSE,
    companyId,
  });
};
