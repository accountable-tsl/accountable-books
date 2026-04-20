import type {
  TeamMember,
  TeamMemberRole,
  TeamMemberStatus,
} from '../model/use-team-settings';

export function getRoleLabel(role: TeamMemberRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'accountant':
      return 'Accountant';
    case 'bookkeeper':
      return 'Bookkeeper';
    case 'viewer':
      return 'Viewer';
    default:
      return role;
  }
}

export function getStatusBadgeVariant(status: TeamMemberStatus) {
  switch (status) {
    case 'active':
      return 'secondary' as const;
    case 'invited':
      return 'outline' as const;
    default:
      return 'outline' as const;
  }
}

export function getStatusLabel(status: TeamMemberStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'invited':
      return 'Invited';
    default:
      return status;
  }
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function getTeamMemberRowKey(member: TeamMember): string {
  if (member.status === 'invited') {
    return member.inviteId;
  }
  return member.membershipId;
}
