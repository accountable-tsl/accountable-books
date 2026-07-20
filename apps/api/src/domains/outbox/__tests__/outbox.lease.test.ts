import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { OUTBOX_INTENT } from '../intents.js';
import {
  claimLeasedIntent,
  deferLeasedIntent,
  markLeasedIntentProcessed,
  OUTBOX_MAX_DISPATCH_ATTEMPTS,
  recordLeasedIntentFailure,
  wakePendingIntent,
  writeOutbox,
} from '../outbox.model.js';

async function insertPendingInitialSync(scopeKey: string) {
  const db = getTestDb();
  return db.transaction(async (trx: Knex.Transaction) => {
    const { id } = await writeOutbox(trx, {
      intentType: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
      scopeKey,
      payload: { bankAccountId: randomUUID() },
    });
    return id;
  });
}

async function cleanupScope(scopeKey: string) {
  const db = getTestDb();
  await db('app.outbox')
    .where({
      intent_type: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
      scope_key: scopeKey,
    })
    .delete();
}

describe('leased outbox intent ownership', () => {
  const scopes: string[] = [];

  afterEach(async () => {
    for (const scopeKey of scopes.splice(0)) {
      await cleanupScope(scopeKey);
    }
  });

  it('claims with a lease token and refuses wake while leased', async () => {
    const scopeKey = `bank_account:${randomUUID()}`;
    scopes.push(scopeKey);
    await insertPendingInitialSync(scopeKey);

    const leased = await getTestDb().transaction((trx: Knex.Transaction) =>
      claimLeasedIntent(trx, {
        intentType: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
        scopeKey,
      }),
    );
    expect(leased).not.toBeNull();
    expect(leased!.leaseToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const wokenWhileLeased = await wakePendingIntent(
      OUTBOX_INTENT.BANK_SYNC_REQUESTED,
      scopeKey,
    );
    expect(wokenWhileLeased).toBe(false);

    const deferred = await deferLeasedIntent(
      leased!.row.id,
      leased!.leaseToken,
      1,
    );
    expect(deferred).toBe(true);

    const wokenAfterDefer = await wakePendingIntent(
      OUTBOX_INTENT.BANK_SYNC_REQUESTED,
      scopeKey,
    );
    expect(wokenAfterDefer).toBe(true);
  });

  it('ignores stale owners on complete and failure', async () => {
    const scopeKey = `bank_account:${randomUUID()}`;
    scopes.push(scopeKey);
    await insertPendingInitialSync(scopeKey);

    const first = await getTestDb().transaction((trx: Knex.Transaction) =>
      claimLeasedIntent(trx, {
        intentType: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
        scopeKey,
      }),
    );
    expect(first).not.toBeNull();

    // Expire the lease so a second claim can take ownership.
    await getTestDb()('app.outbox')
      .where({ id: first!.row.id })
      .update({ available_at: getTestDb().raw(`now() - interval '1 second'`) });

    const second = await getTestDb().transaction((trx: Knex.Transaction) =>
      claimLeasedIntent(trx, {
        intentType: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
        scopeKey,
      }),
    );
    expect(second).not.toBeNull();
    expect(second!.leaseToken).not.toBe(first!.leaseToken);

    expect(
      await markLeasedIntentProcessed(first!.row.id, first!.leaseToken),
    ).toBe('ownership_lost');
    expect(
      (
        await recordLeasedIntentFailure(
          first!.row.id,
          first!.leaseToken,
          new Error('stale'),
        )
      ).ownershipLost,
    ).toBe(true);

    expect(
      await markLeasedIntentProcessed(second!.row.id, second!.leaseToken),
    ).toBe('processed');
  });

  it('gives back the claimed attempt on defer so waiting never eats the retry budget', async () => {
    const scopeKey = `bank_account:${randomUUID()}`;
    scopes.push(scopeKey);
    await insertPendingInitialSync(scopeKey);

    // Repeated claim/defer cycles (e.g. provider history still collecting)
    // must leave the attempt count untouched.
    for (let cycle = 0; cycle < 3; cycle++) {
      const leased = await getTestDb().transaction((trx: Knex.Transaction) =>
        claimLeasedIntent(trx, {
          intentType: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
          scopeKey,
        }),
      );
      expect(leased).not.toBeNull();
      // Re-open availability immediately so the next cycle can claim.
      expect(
        await deferLeasedIntent(leased!.row.id, leased!.leaseToken, 0),
      ).toBe(true);
    }

    const row = await getTestDb()('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
        scope_key: scopeKey,
      })
      .first<{ dispatch_attempt_count: number }>('dispatch_attempt_count');
    expect(row?.dispatch_attempt_count).toBe(0);
  });

  it('does not double-count attempts on leased failure', async () => {
    const scopeKey = `bank_account:${randomUUID()}`;
    scopes.push(scopeKey);
    await insertPendingInitialSync(scopeKey);

    const leased = await getTestDb().transaction((trx: Knex.Transaction) =>
      claimLeasedIntent(trx, {
        intentType: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
        scopeKey,
      }),
    );
    expect(leased).not.toBeNull();

    const before = await getTestDb()('app.outbox')
      .where({ id: leased!.row.id })
      .first<{ dispatch_attempt_count: number }>('dispatch_attempt_count');
    expect(before?.dispatch_attempt_count).toBe(1);

    const result = await recordLeasedIntentFailure(
      leased!.row.id,
      leased!.leaseToken,
      new Error('provider down'),
    );
    expect(result.ownershipLost).toBe(false);
    expect(result.deadLettered).toBe(false);

    const after = await getTestDb()('app.outbox')
      .where({ id: leased!.row.id })
      .first<{
        dispatch_attempt_count: number;
        status: string;
        lease_token: string | null;
      }>('dispatch_attempt_count', 'status', 'lease_token');
    expect(after?.dispatch_attempt_count).toBe(1);
    expect(after?.status).toBe('pending');
    expect(after?.lease_token).toBeNull();
  });

  it('restarts the retry budget for a fresh request during the final attempt', async () => {
    const scopeKey = `bank_account:${randomUUID()}`;
    scopes.push(scopeKey);
    const id = await insertPendingInitialSync(scopeKey);
    const leased = await getTestDb().transaction((trx: Knex.Transaction) =>
      claimLeasedIntent(trx, {
        intentType: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
        scopeKey,
      }),
    );
    if (!leased) throw new Error('Expected leased intent');

    await getTestDb()('app.outbox').where({ id }).update({
      dispatch_attempt_count: OUTBOX_MAX_DISPATCH_ATTEMPTS,
    });
    const writer = await getTestDb().transaction();
    await writeOutbox(writer, {
      intentType: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
      scopeKey,
      payload: { bankAccountId: randomUUID() },
    });
    const failure = recordLeasedIntentFailure(
      id,
      leased.leaseToken,
      new Error('provider unavailable'),
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    await writer.commit();

    const result = await failure;
    const row = await getTestDb()('app.outbox')
      .where({ id })
      .first(
        'status',
        'dispatch_attempt_count',
        'lease_token',
        'follow_up_requested',
      );

    expect(result).toEqual({ deadLettered: false, ownershipLost: false });
    expect(row).toMatchObject({
      status: 'pending',
      dispatch_attempt_count: 0,
      lease_token: null,
      follow_up_requested: false,
    });
  });
});
