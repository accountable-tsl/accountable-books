import type { Knex } from 'knex';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import { requestApp } from '../../../../../test/http.js';
import {
  cleanupSyncFailureFixture,
  createSyncFailureFixture,
} from '../../../../integrations/banking/services/__tests__/transaction-sync.test-helpers.js';
import { OUTBOX_INTENT } from '../../../outbox/intents.js';
import { dispatchPendingIntents } from '../../../outbox/outbox.dispatcher.js';
import { OUTBOX_MAX_DISPATCH_ATTEMPTS } from '../../../outbox/outbox.model.js';
import {
  buildWebhookDedupeKey,
  WEBHOOK_DEDUPE_WINDOW_MS,
} from '../../bank-provider-webhook-events/webhook-dedupe.js';
import plaidWebhookRouter from '../plaid.webhook.js';

const mockPlaidConfig = vi.hoisted(() => ({
  verificationEnabled: false as boolean,
  verify: undefined as ((req: unknown) => boolean) | undefined,
}));

vi.mock(
  '../../../../integrations/banking/utils/webhookVerification.js',
  () => ({
    webhookProviders: {
      get plaid() {
        return mockPlaidConfig;
      },
    },
  }),
);

describe('Plaid banking webhooks', () => {
  let db: Knex;
  let fixture: Awaited<ReturnType<typeof createSyncFailureFixture>>;
  let providerItemId: string;
  let app: express.Express;

  beforeEach(async () => {
    db = getTestDb();
    fixture = await createSyncFailureFixture(db);
    const connection = await db('bank_connections')
      .where({ id: fixture.connectionId })
      .first<{ provider_item_id: string }>('provider_item_id');
    if (!connection?.provider_item_id) {
      throw new Error('Expected fixture connection to have provider_item_id');
    }
    providerItemId = connection.provider_item_id;

    mockPlaidConfig.verificationEnabled = false;
    mockPlaidConfig.verify = undefined;

    app = express();
    app.use(plaidWebhookRouter);
  });

  afterEach(async () => {
    await db('app.outbox')
      .where('intent_type', OUTBOX_INTENT.PROVIDER_WEBHOOK_RECEIVED)
      .orWhere('intent_type', OUTBOX_INTENT.BANK_SYNC_REQUESTED)
      .delete();
    await db('bank_provider_webhook_events').del();
    await cleanupSyncFailureFixture(db, fixture);
  });

  async function postWebhook(body: Record<string, unknown>) {
    return requestApp(app, {
      method: 'POST',
      path: '/webhooks/banking/plaid',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('rejects invalid JSON without storing an event', async () => {
    const response = await requestApp(app, {
      method: 'POST',
      path: '/webhooks/banking/plaid',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });

    expect(response.status).toBe(400);
    const events = await db('bank_provider_webhook_events')
      .count<{
        count: string;
      }>('id as count')
      .first();
    expect(events?.count).toBe('0');
  });

  it('rejects failed verification without storing an event', async () => {
    mockPlaidConfig.verificationEnabled = true;
    mockPlaidConfig.verify = () => false;

    const response = await postWebhook({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: providerItemId,
      environment: 'sandbox',
    });

    expect(response.status).toBe(401);
    const events = await db('bank_provider_webhook_events')
      .count<{
        count: string;
      }>('id as count')
      .first();
    expect(events?.count).toBe('0');
  });

  it('stores event + outbox on delivery; same-window duplicate body inserts once', async () => {
    const body = {
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: providerItemId,
      environment: 'sandbox',
    };

    const first = await postWebhook(body);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true });

    const second = await postWebhook(body);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true });

    const events = await db('bank_provider_webhook_events').select(
      'id',
      'status',
      'event_type',
      'event_code',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: 'pending',
      event_type: 'TRANSACTIONS',
      event_code: 'SYNC_UPDATES_AVAILABLE',
    });

    const intents = await db('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.PROVIDER_WEBHOOK_RECEIVED,
        status: 'pending',
      })
      .select('payload');
    expect(intents).toHaveLength(1);
    expect(intents[0]?.payload).toMatchObject({
      eventId: events[0]?.id,
      providerKey: 'plaid',
    });
  });

  it('accepts identical body after prior event completed in an earlier receipt window', async () => {
    const body = {
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: providerItemId,
      environment: 'sandbox',
      initial_update_complete: true,
      historical_update_complete: true,
    };
    const rawBody = Buffer.from(JSON.stringify(body));

    const first = await postWebhook(body);
    expect(first.status).toBe(200);

    await dispatchPendingIntents(10, {
      intentType: OUTBOX_INTENT.PROVIDER_WEBHOOK_RECEIVED,
    });

    const earlierWindowKey = buildWebhookDedupeKey(
      rawBody,
      new Date(Date.now() - WEBHOOK_DEDUPE_WINDOW_MS),
    );
    await db('bank_provider_webhook_events').update({
      dedupe_key: earlierWindowKey,
    });

    const second = await postWebhook(body);
    expect(second.status).toBe(200);

    const events = await db('bank_provider_webhook_events')
      .orderBy('received_at', 'asc')
      .select('id', 'status', 'dedupe_key');
    expect(events).toHaveLength(2);
    expect(events[0]?.status).toBe('completed');
    expect(events[1]?.status).toBe('pending');
    expect(events[0]?.dedupe_key).not.toBe(events[1]?.dedupe_key);

    const pendingIntents = await db('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.PROVIDER_WEBHOOK_RECEIVED,
        status: 'pending',
      })
      .select('payload');
    expect(pendingIntents).toHaveLength(1);
    expect(pendingIntents[0]?.payload).toMatchObject({
      eventId: events[1]?.id,
      providerKey: 'plaid',
    });
  });

  it('dispatches sync-updates into coalesced BANK_SYNC_REQUESTED', async () => {
    const response = await postWebhook({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: providerItemId,
      environment: 'sandbox',
    });
    expect(response.status).toBe(200);

    const result = await dispatchPendingIntents(10, {
      intentType: OUTBOX_INTENT.PROVIDER_WEBHOOK_RECEIVED,
    });
    expect(result.processed).toBe(1);

    const event = await db('bank_provider_webhook_events')
      .where({ provider_item_id: providerItemId })
      .first('status', 'bank_connection_id');
    expect(event?.status).toBe('completed');
    expect(event?.bank_connection_id).toBe(fixture.connectionId);

    const intents = await db('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
        scope_key: `bank_account:${fixture.bankAccountId}`,
        status: 'pending',
      })
      .select('payload');

    expect(intents).toHaveLength(1);
    expect(intents[0]?.payload).toMatchObject({
      bankAccountId: fixture.bankAccountId,
      trigger: 'webhook',
    });
  });

  it('revokes the connection on USER_PERMISSION_REVOKED after dispatch', async () => {
    const response = await postWebhook({
      webhook_type: 'ITEM',
      webhook_code: 'USER_PERMISSION_REVOKED',
      item_id: providerItemId,
      environment: 'sandbox',
    });
    expect(response.status).toBe(200);

    const result = await dispatchPendingIntents(10, {
      intentType: OUTBOX_INTENT.PROVIDER_WEBHOOK_RECEIVED,
    });
    expect(result.processed).toBe(1);

    const connection = await db('bank_connections')
      .where({ id: fixture.connectionId })
      .first('authorization_status', 'revoked_at');
    expect(connection?.authorization_status).toBe('revoked');
    expect(connection?.revoked_at).toBeTruthy();

    const feed = await db('bank_account_feeds')
      .where({ id: fixture.feedId })
      .first('revoked_at', 'revocation_origin');
    expect(feed?.revoked_at).toBeTruthy();
    expect(feed?.revocation_origin).toBe('provider');

    const secrets = await db('bank_connection_secrets')
      .where({ bank_connection_id: fixture.connectionId })
      .count<{ count: string }>('id as count')
      .first();
    expect(secrets?.count).toBe('0');

    const event = await db('bank_provider_webhook_events')
      .where({ event_code: 'USER_PERMISSION_REVOKED' })
      .first('status');
    expect(event?.status).toBe('completed');
  });

  it('completes known no-op codes without side effects', async () => {
    const response = await postWebhook({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'INITIAL_UPDATE',
      item_id: providerItemId,
      environment: 'sandbox',
    });
    expect(response.status).toBe(200);

    await dispatchPendingIntents(10, {
      intentType: OUTBOX_INTENT.PROVIDER_WEBHOOK_RECEIVED,
    });

    const event = await db('bank_provider_webhook_events')
      .where({ event_code: 'INITIAL_UPDATE' })
      .first('status');
    expect(event?.status).toBe('completed');

    const syncIntents = await db('app.outbox')
      .where({ intent_type: OUTBOX_INTENT.BANK_SYNC_REQUESTED })
      .count<{ count: string }>('id as count')
      .first();
    expect(syncIntents?.count).toBe('0');
  });

  it('quarantines unhandled webhook types immediately', async () => {
    const response = await postWebhook({
      webhook_type: 'HOLDINGS',
      webhook_code: 'DEFAULT_UPDATE',
      item_id: providerItemId,
      environment: 'sandbox',
    });
    expect(response.status).toBe(200);

    const result = await dispatchPendingIntents(10, {
      intentType: OUTBOX_INTENT.PROVIDER_WEBHOOK_RECEIVED,
    });
    expect(result.processed).toBe(1);

    const event = await db('bank_provider_webhook_events')
      .where({ event_type: 'HOLDINGS' })
      .first('status', 'quarantine_reason');
    expect(event?.status).toBe('quarantined');
    expect(event?.quarantine_reason).toBe('unhandled_webhook');
  });

  it('quarantines after outbox dead-letters when connection is missing', async () => {
    const response = await postWebhook({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'item-does-not-exist',
      environment: 'sandbox',
    });
    expect(response.status).toBe(200);

    const intent = await db('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.PROVIDER_WEBHOOK_RECEIVED,
        status: 'pending',
      })
      .first<{ id: string }>('id');
    expect(intent?.id).toBeTruthy();

    await db('app.outbox')
      .where({ id: intent!.id })
      .update({
        dispatch_attempt_count: OUTBOX_MAX_DISPATCH_ATTEMPTS - 1,
        available_at: db.fn.now(),
      });

    const result = await dispatchPendingIntents(5, {
      intentType: OUTBOX_INTENT.PROVIDER_WEBHOOK_RECEIVED,
    });
    expect(result.failed).toBeGreaterThanOrEqual(1);

    const event = await db('bank_provider_webhook_events')
      .where({ provider_item_id: 'item-does-not-exist' })
      .first('status', 'quarantine_reason');
    expect(event?.status).toBe('quarantined');
    expect(event?.quarantine_reason).toBe('outbox_dead_lettered');
  });
});
