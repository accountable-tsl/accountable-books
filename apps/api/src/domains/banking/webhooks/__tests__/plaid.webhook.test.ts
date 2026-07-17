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
import plaidWebhookRouter from '../plaid.webhook.js';

vi.mock(
  '../../../../integrations/banking/utils/webhookVerification.js',
  () => ({
    webhookProviders: {
      plaid: { verificationEnabled: false },
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

    app = express();
    app.use(plaidWebhookRouter);
  });

  afterEach(async () => {
    await cleanupSyncFailureFixture(db, fixture);
  });

  it('writes coalescable bank sync intents for the connection', async () => {
    const response = await requestApp(app, {
      method: 'POST',
      path: '/webhooks/banking/plaid',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook_type: 'TRANSACTIONS',
        webhook_code: 'SYNC_UPDATES_AVAILABLE',
        item_id: providerItemId,
        environment: 'sandbox',
      }),
    });

    expect(
      response.status,
      `webhook status ${response.status}: ${response.text}`,
    ).toBe(200);
    expect(response.body).toEqual({ received: true });

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

  it('revokes the connection on USER_PERMISSION_REVOKED', async () => {
    const response = await requestApp(app, {
      method: 'POST',
      path: '/webhooks/banking/plaid',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook_type: 'ITEM',
        webhook_code: 'USER_PERMISSION_REVOKED',
        item_id: providerItemId,
        environment: 'sandbox',
      }),
    });

    expect(
      response.status,
      `webhook status ${response.status}: ${response.text}`,
    ).toBe(200);
    expect(response.body).toEqual({ received: true });

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
  });
});
