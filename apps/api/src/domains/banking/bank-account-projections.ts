import type { BankConnectionAuthorizationStatus } from './bank-connections/bank-connections.types.js';

export type ProjectedConnectionStatus =
  | 'not_connected'
  | 'connected'
  | 'error'
  | 'revoked';

export type FeedConnectionFacts = {
  hasEverHadFeed: boolean;
  activeFeed: {
    initial_sync_completed_at: Date | null;
    last_successful_sync_at: Date | null;
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
