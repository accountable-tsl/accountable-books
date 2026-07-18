import { describe, expect, it } from 'vitest';

import {
  projectConnectionStatus,
  projectSyncHealth,
  SYNC_HEALTH_FRESHNESS_MS,
} from '../bank-account-projections.js';

import type { FeedConnectionFacts } from '../bank-account-projections.js';

const NOW = new Date('2026-07-18T12:00:00.000Z');

function facts(
  overrides: Partial<FeedConnectionFacts> & {
    activeFeed?: FeedConnectionFacts['activeFeed'];
  } = {},
): FeedConnectionFacts {
  return {
    hasEverHadFeed: true,
    activeFeed: {
      initial_sync_completed_at: new Date('2026-07-18T10:00:00.000Z'),
      last_successful_sync_at: new Date('2026-07-18T10:00:00.000Z'),
      connected_at: new Date('2026-07-01T00:00:00.000Z'),
    },
    latestFeedRevoked: false,
    connectionAuthorizationStatus: 'active',
    ...overrides,
  };
}

describe('projectConnectionStatus', () => {
  it('returns not_connected when no feed has ever existed', () => {
    expect(
      projectConnectionStatus(
        facts({ hasEverHadFeed: false, activeFeed: null }),
      ),
    ).toBe('not_connected');
  });

  it('returns connected for an active feed with active auth', () => {
    expect(projectConnectionStatus(facts())).toBe('connected');
  });

  it('returns error when auth requires action', () => {
    expect(
      projectConnectionStatus(
        facts({ connectionAuthorizationStatus: 'requires_action' }),
      ),
    ).toBe('error');
  });

  it('returns revoked when latest feed is revoked', () => {
    expect(
      projectConnectionStatus(
        facts({ activeFeed: null, latestFeedRevoked: true }),
      ),
    ).toBe('revoked');
  });
});

describe('projectSyncHealth', () => {
  it('returns null when there is no active feed', () => {
    expect(
      projectSyncHealth(facts({ activeFeed: null }), NOW),
    ).toBeNull();
  });

  it('returns action_required when connection needs repair', () => {
    expect(
      projectSyncHealth(
        facts({ connectionAuthorizationStatus: 'requires_action' }),
        NOW,
      ),
    ).toBe('action_required');
  });

  it('returns healthy when last success is within freshness window', () => {
    expect(projectSyncHealth(facts(), NOW)).toBe('healthy');
  });

  it('returns delayed when last success is older than freshness window', () => {
    expect(
      projectSyncHealth(
        facts({
          activeFeed: {
            initial_sync_completed_at: new Date('2026-07-10T00:00:00.000Z'),
            last_successful_sync_at: new Date(
              NOW.getTime() - SYNC_HEALTH_FRESHNESS_MS - 1,
            ),
            connected_at: new Date('2026-07-01T00:00:00.000Z'),
          },
        }),
        NOW,
      ),
    ).toBe('delayed');
  });

  it('returns pending while initial sync is still within freshness of connect', () => {
    expect(
      projectSyncHealth(
        facts({
          activeFeed: {
            initial_sync_completed_at: null,
            last_successful_sync_at: null,
            connected_at: new Date(NOW.getTime() - 60 * 60 * 1000),
          },
        }),
        NOW,
      ),
    ).toBe('pending');
  });

  it('returns delayed when initial sync is overdue', () => {
    expect(
      projectSyncHealth(
        facts({
          activeFeed: {
            initial_sync_completed_at: null,
            last_successful_sync_at: null,
            connected_at: new Date(
              NOW.getTime() - SYNC_HEALTH_FRESHNESS_MS - 1,
            ),
          },
        }),
        NOW,
      ),
    ).toBe('delayed');
  });

  it('stays healthy after a fresh success even if retries may be in flight', () => {
    expect(
      projectSyncHealth(
        facts({
          activeFeed: {
            initial_sync_completed_at: new Date('2026-07-17T12:00:00.000Z'),
            last_successful_sync_at: new Date(NOW.getTime() - 30 * 60 * 1000),
            connected_at: new Date('2026-07-01T00:00:00.000Z'),
          },
        }),
        NOW,
      ),
    ).toBe('healthy');
  });
});
