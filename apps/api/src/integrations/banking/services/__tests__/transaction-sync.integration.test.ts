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

describe('account-scoped transaction streams', () => {
  it('advances sibling accounts with independent cursors', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const siblingId = await createSiblingBankAccount(db, fixture);
    const accountIds = new Map<string, string>();
    for (const row of await db('bank_accounts')
      .whereIn('id', [fixture.bankAccountId, siblingId])
      .select('id', 'provider_bank_account_id')) {
      accountIds.set(row.id, row.provider_bank_account_id);
    }
    const provider = fakeProvider(async ({ providerBankAccountId }) => ({
      transactions: { added: [], modified: [], removed: [] },
      nextCursor: `cursor:${providerBankAccountId}`,
      hasMore: false,
    }));
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(provider);

    try {
      await db('bank_accounts')
        .whereIn('id', [fixture.bankAccountId, siblingId])
        .update({ sync_error: 'previous account error' });
      await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'periodic',
        actorUserId: fixture.userId,
      });
      expect(
        await db('bank_accounts')
          .whereIn('id', [fixture.bankAccountId, siblingId])
          .orderBy('id')
          .select('id', 'sync_error'),
      ).toEqual(
        [fixture.bankAccountId, siblingId].sort().map((id) => ({
          id,
          sync_error:
            id === fixture.bankAccountId ? null : 'previous account error',
        })),
      );
      await transactionSyncService.syncBankAccount({
        bankAccountId: siblingId,
        trigger: 'periodic',
        actorUserId: fixture.userId,
      });

      const states = await db('bank_accounts')
        .whereIn('id', [fixture.bankAccountId, siblingId])
        .select('id', 'transaction_sync_cursor', 'last_sync_at');
      expect(states).toEqual(
        expect.arrayContaining(
          [fixture.bankAccountId, siblingId].map((id) =>
            expect.objectContaining({
              id,
              transaction_sync_cursor: `cursor:${accountIds.get(id)}`,
              last_sync_at: expect.any(Date),
            }),
          ),
        ),
      );
    } finally {
      await db('bank_accounts').where({ id: siblingId }).delete();
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

      const account = await db('bank_accounts')
        .where({ id: fixture.bankAccountId })
        .first('transaction_sync_cursor', 'last_sync_at');
      expect(account).toEqual({
        transaction_sync_cursor: null,
        last_sync_at: null,
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
        await db('bank_transactions')
          .where({ idempotency_key: firstTransaction.transactionId })
          .first('id'),
      ).toBeUndefined();
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
      expect(
        await db('bank_accounts')
          .where({ id: fixture.bankAccountId })
          .first('transaction_sync_cursor', 'last_sync_at', 'sync_error'),
      ).toEqual({
        transaction_sync_cursor: null,
        last_sync_at: null,
        sync_error: null,
      });
    } finally {
      await redis.del(lockKey);
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
      expect(
        await db('bank_accounts')
          .where({ id: fixture.bankAccountId })
          .first('transaction_sync_cursor'),
      ).toEqual({ transaction_sync_cursor: 'final-cursor' });
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
      expect(
        await db('bank_accounts')
          .where({ id: fixture.bankAccountId })
          .first('transaction_sync_cursor', 'last_sync_at'),
      ).toEqual({ transaction_sync_cursor: null, last_sync_at: null });
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
      expect(
        await db('bank_accounts')
          .where({ id: fixture.bankAccountId })
          .first('transaction_sync_cursor'),
      ).toEqual({ transaction_sync_cursor: null });
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
      expect(
        await db('bank_accounts')
          .where({ id: fixture.bankAccountId })
          .first('initial_transaction_sync_completed_at', 'last_sync_at'),
      ).toEqual({
        initial_transaction_sync_completed_at: null,
        last_sync_at: null,
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('aborts stale fetched work without overwriting the newer stream state', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
      fakeProvider(async () => {
        await db('bank_accounts')
          .where({ id: fixture.bankAccountId })
          .update({ transaction_sync_cursor: 'newer-cursor' });
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
        await db('bank_accounts')
          .where({ id: fixture.bankAccountId })
          .first('transaction_sync_cursor', 'last_sync_at', 'sync_error'),
      ).toEqual({
        transaction_sync_cursor: 'newer-cursor',
        last_sync_at: null,
        sync_error: null,
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('aborts a stale date-range pull when its account window advances', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    const startingSyncAt = new Date('2026-06-01T12:00:00Z');
    const newerSyncAt = new Date('2026-06-02T12:00:00Z');
    await db('bank_accounts').where({ id: fixture.bankAccountId }).update({
      last_sync_at: startingSyncAt,
      initial_transaction_sync_completed_at: startingSyncAt,
    });
    vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
      fakeProvider(async () => {
        await db('bank_accounts')
          .where({ id: fixture.bankAccountId })
          .update({ last_sync_at: newerSyncAt });
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
      expect(
        await db('bank_accounts')
          .where({ id: fixture.bankAccountId })
          .first('last_sync_at', 'sync_error'),
      ).toEqual({ last_sync_at: newerSyncAt, sync_error: null });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('uses credential history initially and account overlap incrementally for date providers', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);
    await db('bank_account_credentials')
      .where({ id: fixture.credentialId })
      .update({ transactions_from_date: new Date('2025-04-10T00:00:00Z') });
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

      await db('bank_accounts')
        .where({ id: fixture.bankAccountId })
        .update({
          last_sync_at: new Date('2026-02-20T12:00:00Z'),
          initial_transaction_sync_completed_at: new Date(
            '2026-02-20T12:00:00Z',
          ),
        });
      await transactionSyncService.syncBankAccount({
        bankAccountId: fixture.bankAccountId,
        trigger: 'periodic',
        actorUserId: fixture.userId,
      });
      expect(sync.mock.calls[1][0].fromDate).toEqual(
        new Date('2026-02-19T12:00:00Z'),
      );
      expect(
        await db('bank_accounts')
          .where({ id: fixture.bankAccountId })
          .first('transaction_sync_cursor'),
      ).toEqual({ transaction_sync_cursor: null });
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

      const account = await db('bank_accounts')
        .where({ id: fixture.bankAccountId })
        .first(
          'transaction_sync_cursor',
          'initial_transaction_sync_completed_at',
          'last_sync_at',
        );
      expect(account).toEqual({
        transaction_sync_cursor: 'cursor-two',
        initial_transaction_sync_completed_at: expect.any(Date),
        last_sync_at: expect.any(Date),
      });
      const retainedRow = await db('bank_transactions')
        .where({ idempotency_key: retained.transactionId })
        .first('is_deleted', 'source_payload');
      expect(retainedRow).toEqual({
        is_deleted: false,
        source_payload: expect.objectContaining({
          revision: 2,
          merchant_name: 'Updated merchant',
        }),
      });
      expect(
        await db('bank_transactions')
          .where({ idempotency_key: removed.transactionId })
          .first('is_deleted', 'deletion_origin'),
      ).toEqual({
        is_deleted: true,
        deletion_origin: 'provider_sync',
      });
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
      const states = await db('bank_accounts')
        .whereIn('id', [fixture.bankAccountId, siblingId])
        .select('id', 'transaction_sync_cursor', 'last_sync_at', 'sync_error');
      expect(states).toEqual(
        expect.arrayContaining([
          {
            id: fixture.bankAccountId,
            transaction_sync_cursor: null,
            last_sync_at: null,
            sync_error: 'Invalid date input: Invalid Date',
          },
          {
            id: siblingId,
            transaction_sync_cursor: null,
            last_sync_at: null,
            sync_error: null,
          },
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
      await db('bank_accounts').where({ id: siblingId }).delete();
      await cleanupSyncFailureFixture(db, fixture);
    }
  });
});
