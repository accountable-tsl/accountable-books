import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  fetchTeamMembers,
  inviteTeamMember,
  removeTeamMember,
  resendTeamInvite,
  revokeTeamInvite,
  updateTeamMemberRole,
} from '../api';

import type {
  InviteTeamMemberRequest,
  RemoveTeamMemberRequest,
  ResendTeamInviteRequest,
  RevokeTeamInviteRequest,
  UpdateTeamMemberRoleRequest,
} from './types';

function teamMembersQueryKey(companyId: string | undefined) {
  return ['team-settings', 'members', companyId ?? 'none'] as const;
}

function requireCompanyId(companyId: string | undefined): string {
  if (!companyId) {
    throw new Error('teamSettings: companyId is required at mutation time');
  }
  return companyId;
}

function invalidateTeamMembersQuery(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: teamMembersQueryKey(companyId),
  });
}

export function useTeamMembers(companyId: string | undefined) {
  return useQuery({
    queryKey: teamMembersQueryKey(companyId),
    queryFn: () => fetchTeamMembers(companyId),
    staleTime: 60_000,
    enabled: Boolean(companyId),
  });
}

export function useInviteTeamMember(companyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: InviteTeamMemberRequest) => {
      const companyIdAtCall = requireCompanyId(companyId);
      const response = await inviteTeamMember({
        companyId: companyIdAtCall,
        input,
      });
      return { companyIdAtCall, response };
    },
    onSuccess: ({ companyIdAtCall, response }) => {
      void invalidateTeamMembersQuery(queryClient, companyIdAtCall);
      toast.success(
        response.status === 'already_member'
          ? `${response.email} is already a team member.`
          : 'Invite sent.',
      );
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Could not send invite.';
      toast.error(message);
    },
  });
}

export function useResendTeamInvite(companyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ResendTeamInviteRequest) => {
      const companyIdAtCall = requireCompanyId(companyId);
      await resendTeamInvite({ companyId: companyIdAtCall, input });
      return { companyIdAtCall, input };
    },
    onSuccess: ({ companyIdAtCall }) => {
      void invalidateTeamMembersQuery(queryClient, companyIdAtCall);
      toast.success('Invite resent.');
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Could not resend invite.';
      toast.error(message);
    },
  });
}

export function useRevokeTeamInvite(companyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RevokeTeamInviteRequest) => {
      const companyIdAtCall = requireCompanyId(companyId);
      await revokeTeamInvite({ companyId: companyIdAtCall, input });
      return { companyIdAtCall };
    },
    onSuccess: ({ companyIdAtCall }) => {
      void invalidateTeamMembersQuery(queryClient, companyIdAtCall);
      toast.success('Invite revoked.');
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Could not revoke invite.';
      toast.error(message);
    },
  });
}

export function useUpdateTeamMemberRole(companyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateTeamMemberRoleRequest) => {
      const companyIdAtCall = requireCompanyId(companyId);
      await updateTeamMemberRole({ companyId: companyIdAtCall, input });
      return { companyIdAtCall };
    },
    onSuccess: ({ companyIdAtCall }) => {
      void invalidateTeamMembersQuery(queryClient, companyIdAtCall);
      toast.success('Role updated.');
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Could not update role.';
      toast.error(message);
    },
  });
}

export function useRemoveTeamMember(companyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RemoveTeamMemberRequest) => {
      const companyIdAtCall = requireCompanyId(companyId);
      await removeTeamMember({ companyId: companyIdAtCall, input });
      return { companyIdAtCall };
    },
    onSuccess: ({ companyIdAtCall }) => {
      void invalidateTeamMembersQuery(queryClient, companyIdAtCall);
      toast.success('Member removed.');
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Could not remove member.';
      toast.error(message);
    },
  });
}
