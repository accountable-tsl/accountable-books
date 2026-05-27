import { createId } from '@/shared/utils/id-utils';

import { MOCK_TEAM_MEMBERS_RESPONSE } from '../lib/mock-team-members';

import type {
  InviteTeamMemberRequest,
  InviteTeamMemberResponse,
  RemoveTeamMemberRequest,
  ResendTeamInviteRequest,
  RevokeTeamInviteRequest,
  TeamMembersListResponse,
  UpdateTeamMemberRoleRequest,
} from '../model/types';

export async function fetchTeamMembers(
  companyId: string | undefined,
): Promise<TeamMembersListResponse> {
  if (!companyId || companyId === 'none') {
    return {
      companyId: companyId ?? 'none',
      members: [],
      summary: { total: 0, active: 0, invited: 0, admins: 0 },
    };
  }

  // const res = await api.get(`/api/${companyId}/team-members`);
  // return res.data;

  return {
    ...MOCK_TEAM_MEMBERS_RESPONSE,
    companyId,
  };
}

export async function inviteTeamMember({
  companyId,
  input,
}: {
  companyId: string;
  input: InviteTeamMemberRequest;
}): Promise<InviteTeamMemberResponse> {
  if (!companyId.trim()) {
    return {
      status: 'sent',
      inviteId: createId(),
      email: input.email,
      createdAt: new Date().toISOString(),
    };
  }

  // const res = await api.post(`/api/${companyId}/team-invites`, input);
  // return res.data;

  return {
    status: 'sent',
    inviteId: createId(),
    email: input.email,
    createdAt: new Date().toISOString(),
  };
}

export async function resendTeamInvite({
  companyId,
  input,
}: {
  companyId: string;
  input: ResendTeamInviteRequest;
}): Promise<void> {
  if (!companyId.trim()) {
    return;
  }

  // const res = await api.post(`/api/${companyId}/team-invites/${input.inviteId}/resend`);
  // return res.data;
  void input;
}

export async function revokeTeamInvite({
  companyId,
  input,
}: {
  companyId: string;
  input: RevokeTeamInviteRequest;
}): Promise<void> {
  if (!companyId.trim()) {
    return;
  }

  // const res = await api.post(`/api/${companyId}/team-invites/${input.inviteId}/revoke`);
  // return res.data;
  void input;
}

export async function updateTeamMemberRole({
  companyId,
  input,
}: {
  companyId: string;
  input: UpdateTeamMemberRoleRequest;
}): Promise<void> {
  if (!companyId.trim()) {
    return;
  }

  // const res = await api.patch(`/api/${companyId}/team-members/${input.membershipId}/role`, input);
  // return res.data;
  void input;
}

export async function removeTeamMember({
  companyId,
  input,
}: {
  companyId: string;
  input: RemoveTeamMemberRequest;
}): Promise<void> {
  if (!companyId.trim()) {
    return;
  }

  // const res = await api.delete(`/api/${companyId}/team-members/${input.membershipId}`);
  // return res.data;
  void input;
}
