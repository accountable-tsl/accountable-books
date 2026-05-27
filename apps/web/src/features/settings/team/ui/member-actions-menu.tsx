import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';

import type { TeamMember } from '../model/use-team-settings';

type MemberActionsMenuProps = {
  member: TeamMember;
  anyMemberActionsBusy: boolean;
  canEditRoles: boolean;
  canManageActiveMembers: boolean;
  activeActionPermissionReason?: string;
  inviteActionPendingInviteId?: string;
  activeActionPendingMembershipId?: string;
  resendInvitePending: boolean;
  updateRolePending: boolean;
  removeMemberPending: boolean;
  onEditRole: (member: TeamMember) => void;
  onResendInvite: (member: TeamMember) => void;
  onRevokeInvite: (member: TeamMember) => void;
  onRemoveMember: (member: TeamMember) => void;
};

export function MemberActionsMenu({
  member,
  anyMemberActionsBusy,
  canEditRoles,
  canManageActiveMembers,
  activeActionPermissionReason,
  inviteActionPendingInviteId,
  activeActionPendingMembershipId,
  resendInvitePending,
  updateRolePending,
  removeMemberPending,
  onEditRole,
  onResendInvite,
  onRevokeInvite,
  onRemoveMember,
}: MemberActionsMenuProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" type="button">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Open actions for {member.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={
            member.status !== 'active' || anyMemberActionsBusy || !canEditRoles
          }
          title={
            member.status === 'active' && !canEditRoles
              ? activeActionPermissionReason
              : undefined
          }
          onSelect={(event) => {
            event.preventDefault();
            onEditRole(member);
          }}
        >
          {member.status === 'active' &&
          activeActionPendingMembershipId === member.membershipId &&
          updateRolePending
            ? 'Saving role...'
            : 'Edit role'}
        </DropdownMenuItem>

        {member.status === 'invited' ? (
          <DropdownMenuItem
            disabled={anyMemberActionsBusy}
            onSelect={(event) => {
              event.preventDefault();
              onResendInvite(member);
            }}
          >
            {inviteActionPendingInviteId === member.inviteId &&
            resendInvitePending
              ? 'Resending invite...'
              : 'Resend invite'}
          </DropdownMenuItem>
        ) : null}

        {member.status === 'invited' ? (
          <DropdownMenuItem
            variant="destructive"
            disabled={anyMemberActionsBusy}
            onSelect={(event) => {
              event.preventDefault();
              onRevokeInvite(member);
            }}
          >
            Revoke invite
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            variant="destructive"
            disabled={
              member.status !== 'active' ||
              anyMemberActionsBusy ||
              !canManageActiveMembers
            }
            title={
              member.status === 'active' && !canManageActiveMembers
                ? activeActionPermissionReason
                : undefined
            }
            onSelect={(event) => {
              event.preventDefault();
              onRemoveMember(member);
            }}
          >
            {member.status === 'active' &&
            activeActionPendingMembershipId === member.membershipId &&
            removeMemberPending
              ? 'Removing member...'
              : 'Remove member'}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
