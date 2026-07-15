import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import { NOTIFICATION_TYPE } from '../../../../domains/notifications/notifications.types.js';
import { OUTBOX_INTENT } from '../../../../domains/outbox/intents.js';
import { redis } from '../../../../lib/redis.js';
import { providerRegistry } from '../../providers/registry.js';
import { TransactionSyncStrategy } from '../../types/base.js';
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

import type {
  BankingProvider,
  ProviderError,
  ProviderTransaction,
} from '../../types/base.js';

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
    const provider = fakeProvider(async ({ providerBankAccountId }) => ({
      transactions: { added: [], modified: [], removed: [] },
      nextCursor: `cursor:${providerBankAccountId}`,
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

  it('retains pending provider observations as feed entries without canonical transactions', async () => {
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

      const pendingEntry = await db('bank_transaction_feed_entries')
        .where({
          bank_account_feed_id: fixture.feedId,
          provider_transaction_id: pendingTx.transactionId,
        })
        .first(
          'observation_type',
          'resolution_state',
          'resolution_reason',
          'bank_transaction_id',
        );
      expect(pendingEntry).toMatchObject({
        observation_type: 'pending',
        resolution_state: 'awaiting_posted',
        resolution_reason: 'provider_pending',
        bank_transaction_id: null,
      });

      expect(
        await db('bank_transaction_feed_entries')
          .where({
            bank_account_feed_id: fixture.feedId,
            provider_transaction_id: pendingTx.transactionId,
          })
          .first('bank_transaction_id'),
      ).toMatchObject({ bank_transaction_id: null });
      const postedEntry = await db('bank_transaction_feed_entries')
        .where({
          bank_account_feed_id: fixture.feedId,
          provider_transaction_id: postedTx.transactionId,
        })
        .first('observation_type', 'resolution_state', 'bank_transaction_id');
      expect(postedEntry).toMatchObject({
        observation_type: 'added',
        resolution_state: 'resolved',
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

  it('discards mutation buffers and restarts from the original cursor', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const mutation = {
      code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
      message: 'stream changed',
      displayMessage: 'stream changed',
      retryable: true,
    } satisfies ProviderError;
    const sync = vi
      .fn()
      .mockResolvedValueOnce(emptyPage('discarded-page', true))
      .mockRejectedValueOnce(mutation)
      .mockResolvedValueOnce(emptyPage('retained-page', true))
      .mockResolvedValueOnce(emptyPage('final-cursor', false));
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(fakeProvider(sync));

    try {
      const result = await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'webhook',
        actorUserId: fixture.userId,
      });
      expect(result.outcome).toBe('completed');
      expect(sync.mock.calls.map(([input]) => input.cursor)).toEqual([
        undefined,
        'discarded-page',
        undefined,
        'retained-page',
      ]);
      expect(await getFeedState(db, fixture.bankAccountId)).toMatchObject({
        sync_cursor: 'final-cursor',
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('surfaces repeated pagination mutations after three fresh attempts', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const mutation = {
      code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
      message: 'stream changed repeatedly',
      displayMessage: 'stream changed repeatedly',
      retryable: true,
    } satisfies ProviderError;
    const sync = vi.fn().mockRejectedValue(mutation);
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(fakeProvider(sync));

    try {
      await expect(
        transactionSyncService.syncBankAccount({
          bankAccountId: fixture.bankAccountId,
          trigger: 'webhook',
          actorUserId: fixture.userId,
        }),
      ).rejects.toEqual(mutation);
      expect(sync).toHaveBeenCalledTimes(3);
      expect(await getFeedState(db, fixture.bankAccountId)).toMatchObject({
        sync_cursor: null,
        last_successful_sync_at: null,
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

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
        return emptyPage('unused-page', false);
      }, TransactionSyncStrategy.DATE_RANGE_OVERLAP),
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

  it('uses connection history initially and account overlap incrementally for date providers', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    await db('bank_account_feeds')
      .where({ id: fixture.feedId })
      .update({ sync_from_date: new Date('2025-04-10T00:00:00Z') });
    const sync = vi.fn(
      async (_input: Parameters<BankingProvider['syncTransactions']>[0]) => ({
        transactions: { added: [], modified: [], removed: [] },
        hasMore: false,
      }),
    );
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
      fakeProvider(sync, TransactionSyncStrategy.DATE_RANGE_OVERLAP),
    );

    try {
      await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'initial',
        actorUserId: fixture.userId,
      });
      const initialFromDate = sync.mock.calls[0][0].fromDate!;
      expect([
        initialFromDate.getFullYear(),
        initialFromDate.getMonth() + 1,
        initialFromDate.getDate(),
      ]).toEqual([2025, 4, 10]);

      await db('bank_account_feeds')
        .where({ id: fixture.feedId })
        .update({
          last_successful_sync_at: new Date('2026-02-20T12:00:00Z'),
          initial_sync_completed_at: new Date('2026-02-20T12:00:00Z'),
        });
      await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'periodic',
        actorUserId: fixture.userId,
      });
      expect(sync.mock.calls[1][0].fromDate).toEqual(
        new Date('2026-02-19T12:00:00Z'),
      );
      expect(await getFeedState(db, fixture.bankAccountId)).toMatchObject({
        sync_cursor: null,
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
      })
      .mockResolvedValueOnce({
        transactions: {
          added: [],
          modified: [modified],
          removed: [removed.transactionId],
        },
        nextCursor: 'cursor-two',
        hasMore: false,
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

  it('records modified and removed observations with no canonical transaction as unresolved', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const modified = providerTransaction(
      fixture.providerBankAccountId,
      `unknown-modified-${randomUUID()}`,
    );
    const removedId = `unknown-removed-${randomUUID()}`;
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
      fakeProvider(async () => ({
        transactions: { added: [], modified: [modified], removed: [removedId] },
        nextCursor: 'quarantine-cursor',
        hasMore: false,
      })),
    );

    try {
      await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'initial',
        actorUserId: fixture.userId,
      });

      const entries = await db('bank_transaction_feed_entries')
        .where({ bank_account_feed_id: fixture.feedId })
        .whereIn('provider_transaction_id', [modified.transactionId, removedId])
        .select(
          'provider_transaction_id',
          'resolution_state',
          'resolution_reason',
        )
        .orderBy('provider_transaction_id');
      expect(entries).toEqual([
        {
          provider_transaction_id: modified.transactionId,
          resolution_state: 'unresolved',
          resolution_reason: 'modified_without_canonical_transaction',
        },
        {
          provider_transaction_id: removedId,
          resolution_state: 'unresolved',
          resolution_reason: 'removed_without_canonical_transaction',
        },
      ]);
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
