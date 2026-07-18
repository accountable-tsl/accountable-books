import type { BankConnectionAuthorizationStatus } from './bank-connections/bank-connections.types.js';

export type ProjectedConnectionStatus =
  | 'not_connected'
  | 'connected'
  | 'error'
  | 'revoked';

export type ProjectedSyncHealth =
  | 'pending'
  | 'healthy'
  | 'delayed'
  | 'action_required';

/** Customer sync-health freshness window (initial overdue + last success). */
export const SYNC_HEALTH_FRESHNESS_MS = 24 * 60 * 60 * 1000;

export type FeedConnectionFacts = {
  hasEverHadFeed: boolean;
  activeFeed: {
    initial_sync_completed_at: Date | null;
    last_successful_sync_at: Date | null;
    connected_at: Date | null;
  } | null;
  latestFeedRevoked: boolean;
  connectionAuthorizationStatus: BankConnectionAuthorizationStatus | null;
};

/**
 * Canonical connection-status rules. Database views expose facts; application
 * readers call this function so status policy has one owner.
 */
export function projectConnectionStatus(
  facts: FeedConnectionFacts,
): ProjectedConnectionStatus {
  if (!facts.hasEverHadFeed) return 'not_connected';
  if (facts.activeFeed) {
    if (facts.connectionAuthorizationStatus === 'requires_action') {
      return 'error';
    }
    if (facts.connectionAuthorizationStatus === 'active') {
      return 'connected';
    }
    return 'error';
  }
  if (facts.latestFeedRevoked) return 'revoked';
  return 'not_connected';
}

/**
 * Customer-visible sync health, separate from connection authorization.
 * Isolated retryable failures stay hidden while last success is still fresh.
 */
export function projectSyncHealth(
  facts: FeedConnectionFacts,
  now: Date = new Date(),
): ProjectedSyncHealth | null {
  if (!facts.activeFeed) return null;

  const auth = facts.connectionAuthorizationStatus;
  if (auth !== 'active') {
    return 'action_required';
  }

  const {
    initial_sync_completed_at,
    last_successful_sync_at,
    connected_at,
  } = facts.activeFeed;

  if (initial_sync_completed_at == null) {
    if (
      connected_at != null &&
      now.getTime() - connected_at.getTime() <= SYNC_HEALTH_FRESHNESS_MS
    ) {
      return 'pending';
    }
    return 'delayed';
  }

  if (
    last_successful_sync_at != null &&
    now.getTime() - last_successful_sync_at.getTime() <=
      SYNC_HEALTH_FRESHNESS_MS
  ) {
    return 'healthy';
  }

  return 'delayed';
}
