import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { OUTBOX_INTENT } from '../../../domains/outbox/intents.js';
import { claimLeasedIntent } from '../../../domains/outbox/outbox.model.js';
import { TransactionSyncLockBusyError } from '../services/transaction-sync.errors.js';
import { transactionSyncService } from '../services/transaction-sync.service.js';
import {
  bankSyncScopeKey,
  executeLeasedBankSync,
  writeBankSyncOutbox,
} from '../transaction-sync.outbox.js';

import type { BankAccountSyncResult } from '../services/transaction-sync.service.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function syncResult(
  overrides: Partial<BankAccountSyncResult>,
): BankAccountSyncResult {
  return {
    bankAccountId: randomUUID(),
    outcome: 'completed',
    initialSync: true,
    historyStatus: 'complete',
    added: 0,
    modified: 0,
    removed: 0,
    ...overrides,
  };
}

async function claimFreshIntent(bankAccountId: string) {
  const db = getTestDb();
  await db.transaction((trx: Knex.Transaction) =>
    writeBankSyncOutbox(trx, { bankAccountId, trigger: 'initial' }),
  );
  const leased = await db.transaction((trx: Knex.Transaction) =>
    claimLeasedIntent(trx, {
      intentType: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
      scopeKey: bankSyncScopeKey(bankAccountId),
    }),
  );
  if (!leased) throw new Error('Expected to claim the fresh intent');
  return leased;
}

async function getIntentRow(bankAccountId: string) {
  return getTestDb()('app.outbox')
    .where({
      intent_type: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
      scope_key: bankSyncScopeKey(bankAccountId),
    })
    .first<{
      status: string;
      lease_token: string | null;
      dispatch_attempt_count: number;
    }>('status', 'lease_token', 'dispatch_attempt_count');
}

async function cleanupIntent(bankAccountId: string) {
  await getTestDb()('app.outbox')
    .where({
      intent_type: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
      scope_key: bankSyncScopeKey(bankAccountId),
    })
    .delete();
}

describe('bank sync outbox intent execution', () => {
  it('marks the intent processed only when history collection resolves', async () => {
    const bankAccountId = randomUUID();
    try {
      // Still collecting → the intent stays pending and is deferred.
      vi.spyOn(transactionSyncService, 'syncBankAccount').mockResolvedValue(
        syncResult({ bankAccountId, historyStatus: 'collecting' }),
      );
      let leased = await claimFreshIntent(bankAccountId);
      expect(await executeLeasedBankSync(leased)).toBe('deferred');
      expect(await getIntentRow(bankAccountId)).toMatchObject({
        status: 'pending',
        lease_token: null,
      });

      // Complete → processed.
      vi.spyOn(transactionSyncService, 'syncBankAccount').mockResolvedValue(
        syncResult({ bankAccountId, historyStatus: 'complete' }),
      );
      await getTestDb()('app.outbox')
        .where({ scope_key: bankSyncScopeKey(bankAccountId) })
        .update({ available_at: getTestDb().fn.now() });
      leased = await claimFreshIntent(bankAccountId);
      expect(await executeLeasedBankSync(leased)).toBe('processed');
      expect(await getIntentRow(bankAccountId)).toMatchObject({
        status: 'processed',
      });
    } finally {
      await cleanupIntent(bankAccountId);
    }
  });

  it('completes unsupported accounts instead of deferring forever', async () => {
    const bankAccountId = randomUUID();
    try {
      vi.spyOn(transactionSyncService, 'syncBankAccount').mockResolvedValue(
        syncResult({ bankAccountId, outcome: 'unsupported' }),
      );
      const leased = await claimFreshIntent(bankAccountId);
      expect(await executeLeasedBankSync(leased)).toBe('processed');
      expect(await getIntentRow(bankAccountId)).toMatchObject({
        status: 'processed',
      });
    } finally {
      await cleanupIntent(bankAccountId);
    }
  });

  it('defers on lock contention and records real failures with backoff', async () => {
    const bankAccountId = randomUUID();
    try {
      vi.spyOn(transactionSyncService, 'syncBankAccount').mockRejectedValue(
        new TransactionSyncLockBusyError(bankAccountId),
      );
      let leased = await claimFreshIntent(bankAccountId);
      expect(await executeLeasedBankSync(leased)).toBe('deferred');
      // Lock contention is waiting, not failure: the attempt is given back.
      expect(await getIntentRow(bankAccountId)).toMatchObject({
        status: 'pending',
        dispatch_attempt_count: 0,
      });

      vi.spyOn(transactionSyncService, 'syncBankAccount').mockRejectedValue(
        new Error('provider exploded'),
      );
      await getTestDb()('app.outbox')
        .where({ scope_key: bankSyncScopeKey(bankAccountId) })
        .update({ available_at: getTestDb().fn.now() });
      leased = await claimFreshIntent(bankAccountId);
      expect(await executeLeasedBankSync(leased)).toBe('deferred');
      expect(await getIntentRow(bankAccountId)).toMatchObject({
        status: 'pending',
        lease_token: null,
        dispatch_attempt_count: 1, // real failures keep their attempt
      });
    } finally {
      await cleanupIntent(bankAccountId);
    }
  });
});
