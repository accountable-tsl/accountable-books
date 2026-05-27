import type { TeamMemberStatus } from '@accountable-books/contracts/schema';
import { timeAgo } from '@/shared/utils/old-utils';

export function formatMemberActivityLabel(
  status: TeamMemberStatus,
  lastActiveAt: string | null,
  inviteSentAt?: string | null,
): string {
  if (status === 'invited') {
    if (inviteSentAt) {
      return `Invite sent ${timeAgo(inviteSentAt)}`;
    }
    return 'Pending invite';
  }
  if (lastActiveAt == null) {
    return '—';
  }
  return timeAgo(lastActiveAt);
}
