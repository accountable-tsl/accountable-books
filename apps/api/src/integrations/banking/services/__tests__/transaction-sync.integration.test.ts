import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import { NOTIFICATION_TYPE } from '../../../../domains/notifications/notifications.types.js';
import { OUTBOX_INTENT } from '../../../../domains/outbox/intents.js';
import { redis } from '../../../../lib/redis.js';
import { providerRegistry } from '../../providers/registry.js';
import {
  isRetryableTransactionSyncFailure,
  TransactionSyncLockBusyError,
  transactionSyncService,
} from '../transaction-sync.service.js';
import {
  cleanupBankAccountAndFeed,
  cleanupSyncFailureFixture,
  createSiblingBankAccount,
  createSyncFailureFixture,
  emptyPage,
  fakeProvider,
  providerTransaction,
} from './transaction-sync.test-helpers.js';

import type { ProviderError, ProviderTransaction } from '../../types/base.js';

const mocks = vi.hoisted(() => ({
  alertAdmins: vi.fn(async () => undefined),
}));

vi.mock('../../../../features/comms/admin-alerts.js', () => ({
  alertAdmins: mocks.alertAdmins,
}));

afterEach(() => {
  vi.restoreAllMocks();
  mocks.alertAdmins.mockClear();
});

async function getFeedState(
  db: ReturnType<typeof getTestDb>,
  bankAccountId: string,
) {
  return db('bank_account_feeds')
    .where({ bank_account_id: bankAccountId })
    .first(
      'sync_cursor',
      'last_successful_sync_at',
      'initial_sync_completed_at',
    );
}

describe('account-scoped transaction streams', () => {
  it('scopes provider item lookup and rejects ambiguous tenant matches', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const connection = await db('bank_connections')
      .where({ id: fixture.connectionId })
      .first<{
        provider_id: string;
        provider_item_id: string;
      }>('provider_id', 'provider_item_id');
    const monoProvider = await db('bank_feed_providers')
      .where({ key: 'mono' })
      .first<{ id: string }>('id');
    if (!connection?.provider_item_id || !monoProvider) {
      throw new Error('Expected connection and Mono provider fixtures');
    }

    const [monoConnection] = await db('bank_connections')
      .insert({
        company_id: fixture.companyId,
        provider_id: monoProvider.id,
        provider_item_id: connection.provider_item_id,
        authorization_status: 'active',
        connected_by_id: fixture.userId,
      })
      .returning<{ id: string }[]>('id');

    try {
      await expect(
        transactionSyncService.findConnectionByItemId({
          providerKey: 'plaid',
          itemId: connection.provider_item_id,
        }),
      ).resolves.toMatchObject({ id: fixture.connectionId });

      const otherCompany = await db('companies')
        .where({ short_code: 'bizDemoUS' })
        .first<{ id: string }>('id');
      if (!otherCompany) throw new Error('Expected bizDemoUS company fixture');
      const [ambiguousConnection] = await db('bank_connections')
        .insert({
          company_id: otherCompany.id,
          provider_id: connection.provider_id,
          provider_item_id: connection.provider_item_id,
          authorization_status: 'active',
          connected_by_id: fixture.userId,
        })
        .returning<{ id: string }[]>('id');
      try {
        await expect(
          transactionSyncService.findConnectionByItemId({
            providerKey: 'plaid',
            itemId: connection.provider_item_id,
          }),
        ).resolves.toBeNull();
      } finally {
        await db('bank_connections')
          .where({ id: ambiguousConnection.id })
          .delete();
      }
    } finally {
      await db('bank_connections').where({ id: monoConnection.id }).delete();
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('advances sibling accounts with independent cursors', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const siblingId = await createSiblingBankAccount(db, fixture);
    const accountIds = new Map<string, string>();
    for (const row of await db('bank_account_feeds')
      .whereIn('bank_account_id', [fixture.bankAccountId, siblingId])
      .select('bank_account_id', 'provider_account_id')) {
      accountIds.set(row.bank_account_id, row.provider_account_id);
    }
    const provider = fakeProvider(async ({ fetchInput }) => ({
      transactions: { added: [], modified: [], removed: [] },
      nextCursor: `cursor:${fetchInput.providerBankAccountId}`,
      hasMore: false,
    }));
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(provider);

    try {
      await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'periodic',
        actorUserId: fixture.userId,
      });
      await transactionSyncService.syncBankAccount({
        bankAccountId: siblingId,
        trigger: 'periodic',
        actorUserId: fixture.userId,
      });

      const states = await db('bank_account_feeds')
        .whereIn('bank_account_id', [fixture.bankAccountId, siblingId])
        .select('bank_account_id', 'sync_cursor', 'last_successful_sync_at');
      expect(states).toEqual(
        expect.arrayContaining(
          [fixture.bankAccountId, siblingId].map((id) =>
            expect.objectContaining({
              bank_account_id: id,
              sync_cursor: `cursor:${accountIds.get(id)}`,
              last_successful_sync_at: expect.any(Date),
            }),
          ),
        ),
      );
    } finally {
      await cleanupBankAccountAndFeed(db, siblingId);
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('discards pending provider observations entirely and imports posted ones', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const pendingTx = {
      ...providerTransaction(fixture.providerBankAccountId, 'pending-tx-1'),
      pending: true,
    };
    const postedTx = providerTransaction(
      fixture.providerBankAccountId,
      'posted-tx-1',
    );
    const provider = fakeProvider(async () => ({
      transactions: {
        added: [pendingTx, postedTx],
        modified: [],
        removed: [],
      },
      nextCursor: 'after-pending',
      hasMore: false,
    }));
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(provider);

    try {
      const result = await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'webhook',
        actorUserId: fixture.userId,
      });
      expect(result.outcome).toBe('completed');
      expect(
        await db('bank_transaction_sync_runs')
          .where({ bank_account_feed_id: fixture.feedId })
          .orderBy('started_at', 'desc')
          .first('outcome', 'completed_at'),
      ).toMatchObject({
        outcome: 'succeeded',
        completed_at: expect.any(Date),
      });

      // The pending observation leaves no trace: no feed entry, no
      // bank transaction.
      expect(
        await db('bank_transaction_feed_entries')
          .where({
            bank_account_feed_id: fixture.feedId,
            provider_transaction_id: pendingTx.transactionId,
          })
          .first('id'),
      ).toBeUndefined();

      const postedEntry = await db('bank_transaction_feed_entries')
        .where({
          bank_account_feed_id: fixture.feedId,
          provider_transaction_id: postedTx.transactionId,
        })
        .first('observation_type', 'bank_transaction_id');
      expect(postedEntry).toMatchObject({
        observation_type: 'added',
        bank_transaction_id: expect.any(String),
      });

      expect(
        await db('bank_transactions')
          .where({ id: postedEntry.bank_transaction_id })
          .first('idempotency_key'),
      ).toEqual({ idempotency_key: null });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('does not write a buffered page or cursor when a later page fails', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const failure = {
      code: 'PROVIDER_UNAVAILABLE',
      message: 'second page failed',
      displayMessage: 'Provider temporarily unavailable',
      retryable: true,
    } satisfies ProviderError;
    const firstTransaction = providerTransaction(
      fixture.providerBankAccountId,
      'buffered-first-page',
    );
    const provider = fakeProvider(
      vi
        .fn()
        .mockResolvedValueOnce({
          transactions: {
            added: [firstTransaction],
            modified: [],
            removed: [],
          },
          nextCursor: 'second-page',
          hasMore: true,
        })
        .mockRejectedValueOnce(failure),
    );
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(provider);

    try {
      await expect(
        transactionSyncService.syncBankAccount({
          bankAccountId: fixture.bankAccountId,
          trigger: 'webhook',
          actorUserId: fixture.userId,
        }),
      ).rejects.toEqual(failure);

      const feed = await getFeedState(db, fixture.bankAccountId);
      expect(feed).toMatchObject({
        sync_cursor: null,
        last_successful_sync_at: null,
      });
      expect(
        await db('app.notifications')
          .where({
            client_company_id: fixture.companyId,
            event_type: NOTIFICATION_TYPE.SYNC_FAILURE_REQUIRES_ACTION,
          })
          .andWhere(
            'attention_key',
            `bank_account:${fixture.bankAccountId}:sync_failure`,
          ),
      ).toHaveLength(0);
      expect(mocks.alertAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'bank.transaction_sync_failed',
          data: expect.objectContaining({
            bankAccountId: fixture.bankAccountId,
            retryable: true,
          }),
        }),
      );
      expect(
        await db('bank_transaction_feed_entries')
          .where({
            bank_account_feed_id: fixture.feedId,
            provider_transaction_id: firstTransaction.transactionId,
          })
          .first('id'),
      ).toBeUndefined();
      expect(
        await db('bank_transaction_sync_runs')
          .where({ bank_account_feed_id: fixture.feedId })
          .orderBy('started_at', 'desc')
          .first('outcome', 'provider_error_code'),
      ).toMatchObject({
        outcome: 'failed',
        provider_error_code: failure.code,
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('surfaces account lock contention as retryable queue work', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const sync = vi.fn(async () => emptyPage('unused-cursor', false));
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(fakeProvider(sync));
    const lockKey = `sync:transaction:account:${fixture.bankAccountId}`;
    await redis.set(lockKey, 'another-run', 'EX', 60);

    try {
      await expect(
        transactionSyncService.syncBankAccount({
          bankAccountId: fixture.bankAccountId,
          trigger: 'webhook',
          actorUserId: fixture.userId,
        }),
      ).rejects.toBeInstanceOf(TransactionSyncLockBusyError);
      expect(sync).not.toHaveBeenCalled();
      expect(await getFeedState(db, fixture.bankAccountId)).toMatchObject({
        sync_cursor: null,
        last_successful_sync_at: null,
      });
    } finally {
      await redis.del(lockKey);
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('records a durable failed run when the provider secret is unavailable', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
      fakeProvider(async () => emptyPage('unused-cursor', false)),
    );
    await db('bank_connection_secrets')
      .where({ bank_connection_id: fixture.connectionId })
      .delete();

    try {
      await expect(
        transactionSyncService.syncBankAccount({
          bankAccountId: fixture.bankAccountId,
          trigger: 'webhook',
          actorUserId: fixture.userId,
        }),
      ).rejects.toThrow(/secret unavailable/i);
      expect(
        await db('bank_transaction_sync_runs')
          .where({ bank_account_feed_id: fixture.feedId })
          .orderBy('started_at', 'desc')
          .first('outcome', 'failure_classification'),
      ).toMatchObject({
        outcome: 'failed',
        failure_classification: 'internal_provider_system',
      });
      expect(
        await db('bank_connections')
          .where({ id: fixture.connectionId })
          .first('authorization_status'),
      ).toEqual({ authorization_status: 'active' });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  // Plaid's restart-on-mutation-during-pagination is adapter-internal now;
  // see plaid.provider.test.ts for its coverage.

  it('fails closed when a provider returns another account transaction', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const provider = fakeProvider(async () => ({
      transactions: {
        added: [providerTransaction('different-account', 'wrong-account')],
        modified: [],
        removed: [],
      },
      nextCursor: 'must-not-persist',
      hasMore: false,
    }));
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(provider);

    try {
      await expect(
        transactionSyncService.syncBankAccount({
          bankAccountId: fixture.bankAccountId,
          trigger: 'periodic',
          actorUserId: fixture.userId,
        }),
      ).rejects.toThrow(/different-account/);
      expect(await getFeedState(db, fixture.bankAccountId)).toMatchObject({
        sync_cursor: null,
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('leaves initial state incomplete when a cursor stream is not ready', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
      fakeProvider(async () => ({
        transactions: { added: [], modified: [], removed: [] },
        hasMore: false,
      })),
    );

    try {
      const result = await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'initial',
        actorUserId: fixture.userId,
      });
      expect(result).toEqual(
        expect.objectContaining({ outcome: 'not_ready', initialSync: true }),
      );
      expect(await getFeedState(db, fixture.bankAccountId)).toMatchObject({
        initial_sync_completed_at: null,
        last_successful_sync_at: null,
      });
      expect(
        await db('bank_transaction_sync_runs')
          .where({ bank_account_feed_id: fixture.feedId })
          .orderBy('started_at', 'desc')
          .first('outcome'),
      ).toMatchObject({ outcome: 'skipped' });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('aborts stale fetched work without overwriting the newer stream state', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
      fakeProvider(async () => {
        await db('bank_account_feeds')
          .where({ id: fixture.feedId })
          .update({ sync_cursor: 'newer-cursor' });
        return emptyPage('stale-cursor', false);
      }),
    );

    try {
      await expect(
        transactionSyncService.syncBankAccount({
          bankAccountId: fixture.bankAccountId,
          trigger: 'webhook',
          actorUserId: fixture.userId,
        }),
      ).rejects.toThrow(/sync state changed/);
      expect(await getFeedState(db, fixture.bankAccountId)).toMatchObject({
        sync_cursor: 'newer-cursor',
        last_successful_sync_at: null,
      });
      expect(
        await db('bank_transaction_sync_runs')
          .where({ bank_account_feed_id: fixture.feedId })
          .orderBy('started_at', 'desc')
          .first('outcome'),
      ).toMatchObject({ outcome: 'stale' });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('aborts a stale date-range pull when its date checkpoint advances', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const startingSyncAt = new Date('2026-06-01T12:00:00Z');
    const concurrentSyncAt = new Date('2026-06-02T12:00:00Z');
    await db('bank_account_feeds').where({ id: fixture.feedId }).update({
      last_successful_sync_at: startingSyncAt,
      initial_sync_completed_at: startingSyncAt,
    });
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
      fakeProvider(async () => {
        // Simulate another successful date-range run advancing the checkpoint
        // without changing the feed identity generation.
        await db('bank_account_feeds')
          .where({ id: fixture.feedId })
          .update({ last_successful_sync_at: concurrentSyncAt });
        // Mono reports complete once its final page is in, so the service
        // proceeds to apply (and hits the stale guard) instead of skipping.
        return {
          ...emptyPage('unused-page', false),
          historyStatus: 'complete' as const,
        };
      }, 'mono'),
    );

    try {
      await expect(
        transactionSyncService.syncBankAccount({
          bankAccountId: fixture.bankAccountId,
          trigger: 'periodic',
          actorUserId: fixture.userId,
        }),
      ).rejects.toThrow(/sync state changed/);
      expect(await getFeedState(db, fixture.bankAccountId)).toMatchObject({
        last_successful_sync_at: concurrentSyncAt,
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('aborts fetched work when its feed is rebound to another connection', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const originalConnection = await db('bank_connections')
      .where({ id: fixture.connectionId })
      .first<{ provider_id: string }>('provider_id');
    if (!originalConnection) throw new Error('Expected connection fixture');

    let replacementConnectionId: string | null = null;
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
      fakeProvider(async () => {
        const [replacement] = await db('bank_connections')
          .insert({
            company_id: fixture.companyId,
            provider_id: originalConnection.provider_id,
            provider_item_id: `replacement-${randomUUID()}`,
            authorization_status: 'active',
            connected_by_id: fixture.userId,
          })
          .returning<{ id: string }[]>('id');
        replacementConnectionId = replacement.id;
        await db('bank_account_feeds')
          .where({ id: fixture.feedId })
          .update({ bank_connection_id: replacement.id });
        return emptyPage('stale-cursor', false);
      }),
    );

    try {
      await expect(
        transactionSyncService.syncBankAccount({
          bankAccountId: fixture.bankAccountId,
          trigger: 'webhook',
          actorUserId: fixture.userId,
        }),
      ).rejects.toThrow(/sync state changed/);
      expect(
        await db('bank_account_feeds')
          .where({ id: fixture.feedId })
          .first('bank_connection_id'),
      ).toMatchObject({ bank_connection_id: replacementConnectionId });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
      if (replacementConnectionId) {
        await db('bank_connections')
          .where({ id: replacementConnectionId })
          .delete();
      }
    }
  });

  it('passes initial vs incremental context to the provider adapter', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const pageFn = vi.fn(
      async (_params: { cursor?: string; fetchInput: unknown }) => ({
        transactions: { added: [], modified: [], removed: [] },
        hasMore: false,
        historyStatus: 'complete' as const,
      }),
    );
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
      fakeProvider(pageFn, 'mono'),
    );

    try {
      await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'initial',
        actorUserId: fixture.userId,
      });
      expect(pageFn.mock.calls[0][0].fetchInput).toMatchObject({
        isInitialSync: true,
        checkpoint: null,
        lastSuccessfulSyncAt: null,
      });

      // The first apply advanced the checkpoint; the incremental call sees it.
      await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'periodic',
        actorUserId: fixture.userId,
      });
      expect(pageFn.mock.calls[1][0].fetchInput).toMatchObject({
        isInitialSync: false,
        checkpoint: null,
        lastSuccessfulSyncAt: expect.any(Date),
      });
      expect(await getFeedState(db, fixture.bankAccountId)).toMatchObject({
        sync_cursor: null,
        initial_sync_completed_at: expect.any(Date),
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('applies added, modified, and removed updates before advancing the cursor', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const retained = providerTransaction(
      fixture.providerBankAccountId,
      `retained-${randomUUID()}`,
    );
    const removed = providerTransaction(
      fixture.providerBankAccountId,
      `removed-${randomUUID()}`,
    );
    const modified: ProviderTransaction = {
      ...retained,
      merchantName: 'Updated merchant',
      rawData: { revision: 2 },
    };
    const sync = vi
      .fn()
      .mockResolvedValueOnce({
        transactions: {
          added: [retained, removed],
          modified: [],
          removed: [],
        },
        nextCursor: 'cursor-one',
        hasMore: false,
        historyStatus: 'complete',
      })
      .mockResolvedValueOnce({
        transactions: {
          added: [],
          modified: [modified],
          removed: [removed.transactionId],
        },
        nextCursor: 'cursor-two',
        hasMore: false,
        historyStatus: 'complete',
      });
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(fakeProvider(sync));

    try {
      await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'initial',
        actorUserId: fixture.userId,
      });
      await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'periodic',
        actorUserId: fixture.userId,
      });

      const feed = await getFeedState(db, fixture.bankAccountId);
      expect(feed).toEqual({
        sync_cursor: 'cursor-two',
        initial_sync_completed_at: expect.any(Date),
        last_successful_sync_at: expect.any(Date),
      });
      const retainedEntry = await db('bank_transaction_feed_entries')
        .where({
          bank_account_feed_id: fixture.feedId,
          provider_transaction_id: retained.transactionId,
        })
        .first<{ bank_transaction_id: string }>('bank_transaction_id');
      const retainedRow = await db('bank_transactions')
        .where({ id: retainedEntry.bank_transaction_id })
        .first('is_deleted', 'source_payload', 'idempotency_key');
      expect(retainedRow).toEqual({
        is_deleted: false,
        idempotency_key: null,
        source_payload: expect.objectContaining({
          merchant_name: 'Updated merchant',
        }),
      });
      const removedEntry = await db('bank_transaction_feed_entries')
        .where({
          bank_account_feed_id: fixture.feedId,
          provider_transaction_id: removed.transactionId,
        })
        .first<{ bank_transaction_id: string }>('bank_transaction_id');
      expect(
        await db('bank_transactions')
          .where({ id: removedEntry.bank_transaction_id })
          .first('is_deleted', 'deletion_origin'),
      ).toEqual({
        is_deleted: true,
        deletion_origin: 'provider_sync',
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('imports unknown observations as new and ignores removals of unknown ids', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    // Providers do not classify added-vs-modified: an observation whose
    // provider id we have never stored is a new transaction, even if the
    // provider labelled it "modified" (fixes the Mono corrected-amount case).
    const observed = providerTransaction(
      fixture.providerBankAccountId,
      `unknown-observed-${randomUUID()}`,
    );
    const removedId = `unknown-removed-${randomUUID()}`;
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
      fakeProvider(async () => ({
        transactions: { added: [], modified: [observed], removed: [removedId] },
        nextCursor: 'quarantine-cursor',
        hasMore: false,
      })),
    );

    try {
      const result = await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'initial',
        actorUserId: fixture.userId,
      });
      expect(result.outcome).toBe('completed');
      expect(result.added).toBe(1);
      expect(result.removed).toBe(0);

      expect(
        await db('bank_transaction_feed_entries')
          .where({
            bank_account_feed_id: fixture.feedId,
            provider_transaction_id: observed.transactionId,
          })
          .first('observation_type', 'bank_transaction_id'),
      ).toMatchObject({
        observation_type: 'added',
        bank_transaction_id: expect.any(String),
      });

      // Removals of never-stored ids (e.g. formerly-pending) leave no trace.
      expect(
        await db('bank_transaction_feed_entries')
          .where({
            bank_account_feed_id: fixture.feedId,
            provider_transaction_id: removedId,
          })
          .first('id'),
      ).toBeUndefined();
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('rolls back application failure and errors only the target account', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const siblingId = await createSiblingBankAccount(db, fixture);
    const invalid = {
      ...providerTransaction(
        fixture.providerBankAccountId,
        `invalid-${randomUUID()}`,
      ),
      date: 'not-a-date',
    };
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
      fakeProvider(async () => ({
        transactions: { added: [invalid], modified: [], removed: [] },
        nextCursor: 'must-roll-back',
        hasMore: false,
      })),
    );

    try {
      let applicationError: unknown;
      try {
        await transactionSyncService.syncBankAccount({
          bankAccountId: fixture.bankAccountId,
          trigger: 'webhook',
          actorUserId: fixture.userId,
        });
      } catch (error) {
        applicationError = error;
      }
      expect(applicationError).toBeInstanceOf(Error);
      expect((applicationError as Error).message).toBe(
        'Invalid date input: Invalid Date',
      );
      expect(isRetryableTransactionSyncFailure(applicationError)).toBe(false);
      const states = await db('bank_account_feeds')
        .whereIn('bank_account_id', [fixture.bankAccountId, siblingId])
        .select('bank_account_id', 'sync_cursor', 'last_successful_sync_at');
      expect(states).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            bank_account_id: fixture.bankAccountId,
            sync_cursor: null,
            last_successful_sync_at: null,
          }),
          expect.objectContaining({
            bank_account_id: siblingId,
            sync_cursor: null,
            last_successful_sync_at: null,
          }),
        ]),
      );
      expect(
        await db('app.outbox')
          .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
          .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
            NOTIFICATION_TYPE.SYNC_FAILURE_REQUIRES_ACTION,
          ])
          .andWhereRaw(`payload->'event'->>'attentionKey' = ?`, [
            `bank_account:${fixture.bankAccountId}:sync_failure`,
          ]),
      ).not.toHaveLength(0);
    } finally {
      await cleanupBankAccountAndFeed(db, siblingId);
      await cleanupSyncFailureFixture(db, fixture);
    }
  });
});
