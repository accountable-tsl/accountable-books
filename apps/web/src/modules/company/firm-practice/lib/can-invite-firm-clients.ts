import type { FirmViewerRole } from '@accountable-books/contracts/schema';

/**
 * Whether the current viewer may use the firm “invite client” affordances.
 * UI-only; the API must enforce the same policy.
 *
 * - `viewerRole` or `allowed` undefined → false (hide until shell is usable).
 * - `allowed` empty → false (explicit lockout).
 */
export function canInviteFirmClients(
  viewerRole: FirmViewerRole | undefined,
  allowed: FirmViewerRole[] | undefined,
): boolean {
  if (viewerRole === undefined || allowed === undefined) return false;
  if (allowed.length === 0) return false;
  return allowed.includes(viewerRole);
}
