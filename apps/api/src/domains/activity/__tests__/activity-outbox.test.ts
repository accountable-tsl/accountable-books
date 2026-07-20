import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { knexClient } from '../../../db/knexClient.js';
import {
  dispatchPendingIntents,
  OUTBOX_INTENT,
  writeOutbox,
} from '../../outbox/index.js';
import { resolveFirmCompanyId } from '../../work/work-ownership.js';
import { writeActivityEventIntent } from '../activity-intent.js';
import { ACTIVITY_EVENT_TYPE } from '../activity.types.js';

import type { ActivityEventRequestedPayload } from '../activity.types.js';

async function activityFixture(client: Knex.Transaction) {
  const clientCompanyId = await getTestCompanyId(client, 'bizDemoUS');
  const firmCompanyId = await resolveFirmCompanyId(client, clientCompanyId);
  const userId = await getTestUserId(client, US_USER_EMAIL);

  return { clientCompanyId, firmCompanyId, userId };
}

describe('activity event outbox', () => {
  const cleanupScopeKeys: string[] = [];

  afterEach(async () => {
    if (cleanupScopeKeys.length === 0) {
      return;
    }

    await knexClient('app.outbox')
      .whereIn('scope_key', cleanupScopeKeys.splice(0))
      .del();
  });

  it('writes activity intents atomically with the caller transaction', async () => {
    const trx = await getTestDb().transaction();
    const { clientCompanyId, userId } = await activityFixture(trx);
    let scopeKey = '';

    try {
      const result = await writeActivityEventIntent(trx, {
        clientCompanyId,
        actor: { type: 'user', userId },
        sourceEntity: { type: 'journal', id: randomUUID() },
        eventType: ACTIVITY_EVENT_TYPE.JOURNAL_CREATED,
        itemCount: 1,
        idempotencyKey: `activity:test:${randomUUID()}`,
        metadata: { test: true },
      });
      scopeKey = result.scopeKey;

      const pendingInTransaction = await trx('app.outbox').where({
        intent_type: OUTBOX_INTENT.ACTIVITY_EVENT_REQUESTED,
        scope_key: scopeKey,
        status: 'pending',
      });

      expect(pendingInTransaction).toHaveLength(1);
    } finally {
      await trx.rollback();
    }

    const committed = await knexClient('app.outbox').where({
      scope_key: scopeKey,
    });
    expect(committed).toHaveLength(0);
  });

  it('rejects amount-bearing events without a currency before writing an intent', async () => {
    const trx = await getTestDb().transaction();
    const { clientCompanyId, userId } = await activityFixture(trx);

    try {
      await expect(
        writeActivityEventIntent(trx, {
          clientCompanyId,
          actor: { type: 'user', userId },
          sourceEntity: { type: 'journal', id: randomUUID() },
          eventType: ACTIVITY_EVENT_TYPE.JOURNAL_CREATED,
          itemCount: 1,
          amount: 25,
          idempotencyKey: `activity:test:${randomUUID()}`,
          metadata: { test: true },
        }),
      ).rejects.toThrow(/currencyId is required/);
    } finally {
      await trx.rollback();
    }
  });

  it('dispatches activity intents into the append-only activity stream', async () => {
    const fixtureTrx = await getTestDb().transaction();
    const { clientCompanyId, userId } = await activityFixture(fixtureTrx);
    await fixtureTrx.rollback();

    const idempotencyKey = `activity:test:${randomUUID()}`;
    let scopeKey = '';

    await knexClient.transaction(async (trx) => {
      const result = await writeActivityEventIntent(trx, {
        clientCompanyId,
        actor: { type: 'user', userId },
        sourceEntity: { type: 'journal', id: randomUUID() },
        eventType: ACTIVITY_EVENT_TYPE.JOURNAL_CREATED,
        itemCount: 2,
        idempotencyKey,
        metadata: { origin: 'activity-outbox-test' },
      });
      scopeKey = result.scopeKey;
      cleanupScopeKeys.push(scopeKey);
    });

    const result = await dispatchPendingIntents(1, { scopeKey });
    expect(result).toEqual({ processed: 1, deferred: 0, failed: 0 });

    const activity = await knexClient('app.activity_events')
      .where({ idempotency_key: idempotencyKey })
      .first(
        'event_type',
        'actor_type',
        'actor_user_id',
        'client_company_id',
        'item_count',
        'metadata',
      );

    expect(activity).toMatchObject({
      event_type: ACTIVITY_EVENT_TYPE.JOURNAL_CREATED,
      actor_type: 'user',
      actor_user_id: userId,
      client_company_id: clientCompanyId,
      item_count: 2,
      metadata: { origin: 'activity-outbox-test' },
    });

    const outboxRow = await knexClient('app.outbox')
      .where({ scope_key: scopeKey })
      .first('status', 'completed_at');
    expect(outboxRow?.status).toBe('processed');
    expect(outboxRow?.completed_at).not.toBeNull();
  });

  it('deduplicates duplicate dispatches by activity idempotency key', async () => {
    const fixtureTrx = await getTestDb().transaction();
    const { clientCompanyId, firmCompanyId, userId } =
      await activityFixture(fixtureTrx);
    await fixtureTrx.rollback();

    const sourceEntityId = randomUUID();
    const idempotencyKey = `activity:test:${randomUUID()}`;
    const event: ActivityEventRequestedPayload['event'] = {
      firmCompanyId,
      clientCompanyId,
      actor: { type: 'user', userId },
      sourceEntity: { type: 'journal', id: sourceEntityId },
      eventType: ACTIVITY_EVENT_TYPE.JOURNAL_CREATED,
      itemCount: 1,
      metadata: { origin: 'duplicate-dispatch-test' },
      idempotencyKey,
      occurredAt: new Date().toISOString(),
    };
    const firstScopeKey = `${OUTBOX_INTENT.ACTIVITY_EVENT_REQUESTED}:${idempotencyKey}:a`;
    const secondScopeKey = `${OUTBOX_INTENT.ACTIVITY_EVENT_REQUESTED}:${idempotencyKey}:b`;

    await knexClient.transaction(async (trx) => {
      await writeOutbox(trx, {
        intentType: OUTBOX_INTENT.ACTIVITY_EVENT_REQUESTED,
        scopeKey: firstScopeKey,
        payload: { event },
      });
      await writeOutbox(trx, {
        intentType: OUTBOX_INTENT.ACTIVITY_EVENT_REQUESTED,
        scopeKey: secondScopeKey,
        payload: { event },
      });
      cleanupScopeKeys.push(firstScopeKey, secondScopeKey);
    });

    expect(
      await dispatchPendingIntents(1, { scopeKey: firstScopeKey }),
    ).toEqual({ processed: 1, deferred: 0, failed: 0 });
    expect(
      await dispatchPendingIntents(1, { scopeKey: secondScopeKey }),
    ).toEqual({ processed: 1, deferred: 0, failed: 0 });

    const rows = await knexClient('app.activity_events').where({
      idempotency_key: idempotencyKey,
    });
    expect(rows).toHaveLength(1);
  });
});
