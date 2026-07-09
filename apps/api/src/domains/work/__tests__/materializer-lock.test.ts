import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  lockKeyMaterializerScope,
  tryAcquireAdvisoryXactLock,
} from '../../../shared/services/advisoryLocks.service.js';

/**
 * Phase 0 concurrency contract: materialization is serialized per scope_key by a
 * transaction-level advisory lock. Two holders of the same materializer scope
 * key cannot both be inside the locked section concurrently.
 */
describe('materializer scope advisory lock', () => {
  const openTransactions: Knex.Transaction[] = [];

  afterEach(async () => {
    await Promise.all(
      openTransactions.map((trx) => trx.rollback().catch(() => undefined)),
    );
    openTransactions.length = 0;
  });

  it('serializes two holders of the same materializer scope_key', async () => {
    const db = getTestDb();
    const key = lockKeyMaterializerScope(
      `bank_account:${randomUUID()}:${randomUUID()}`,
    );

    const first = await db.transaction();
    openTransactions.push(first);
    const second = await db.transaction();
    openTransactions.push(second);

    // First holder takes the scope lock.
    expect(await tryAcquireAdvisoryXactLock(first, key)).toBe(true);
    // Second holder cannot enter the same locked scope concurrently.
    expect(await tryAcquireAdvisoryXactLock(second, key)).toBe(false);

    // Releasing the first holder (commit) frees the lock for the second.
    await first.commit();
    openTransactions.shift();
    expect(await tryAcquireAdvisoryXactLock(second, key)).toBe(true);
  });

  it('does not serialize distinct scope keys', async () => {
    const db = getTestDb();
    const first = await db.transaction();
    openTransactions.push(first);
    const second = await db.transaction();
    openTransactions.push(second);

    expect(
      await tryAcquireAdvisoryXactLock(
        first,
        lockKeyMaterializerScope(
          `bank_account:${randomUUID()}:${randomUUID()}`,
        ),
      ),
    ).toBe(true);
    expect(
      await tryAcquireAdvisoryXactLock(
        second,
        lockKeyMaterializerScope(
          `bank_account:${randomUUID()}:${randomUUID()}`,
        ),
      ),
    ).toBe(true);
  });
});
