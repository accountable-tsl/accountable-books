import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import plaidWebhookRouter from '../plaid.webhook.js';

const mocks = vi.hoisted(() => ({
  findConnectionByItemId: vi.fn(),
  requestBankSyncForConnection: vi.fn(),
  revokeConnection: vi.fn(),
}));

vi.mock('../../../../integrations/banking/transaction-sync.outbox.js', () => ({
  requestBankSyncForConnection: mocks.requestBankSyncForConnection,
}));

vi.mock(
  '../../../../integrations/banking/services/transaction-sync.service.js',
  () => ({
    transactionSyncService: {
      findConnectionByItemId: mocks.findConnectionByItemId,
    },
  }),
);

vi.mock('../../connection-lifecycle/lifecycle.commands.js', () => ({
  revokeConnectionAndDestroySecret: mocks.revokeConnection,
}));

vi.mock(
  '../../../../integrations/banking/utils/webhookVerification.js',
  () => ({
    webhookProviders: {
      plaid: { verificationEnabled: false },
    },
  }),
);

describe('Plaid transaction webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revokeConnection.mockResolvedValue({ success: true });
  });

  it('writes coalescable bank sync intents for the connection', async () => {
    mocks.findConnectionByItemId.mockResolvedValue({ id: 'connection-1' });
    mocks.requestBankSyncForConnection.mockResolvedValue(2);
    const app = express();
    app.use(plaidWebhookRouter);

    const response = await request(app)
      .post('/webhooks/banking/plaid')
      .set('Content-Type', 'application/json')
      .send(
        JSON.stringify({
          webhook_type: 'TRANSACTIONS',
          webhook_code: 'SYNC_UPDATES_AVAILABLE',
          item_id: 'item-1',
          environment: 'sandbox',
        }),
      );

    expect(response.status).toBe(200);
    expect(mocks.findConnectionByItemId).toHaveBeenCalledWith({
      providerKey: 'plaid',
      itemId: 'item-1',
    });
    expect(mocks.requestBankSyncForConnection).toHaveBeenCalledWith({
      connectionId: 'connection-1',
      trigger: 'webhook',
    });
  });

  it('revokes the connection on USER_PERMISSION_REVOKED', async () => {
    mocks.findConnectionByItemId.mockResolvedValue({
      id: 'connection-1',
      company_id: 'company-1',
    });
    const app = express();
    app.use(plaidWebhookRouter);

    const response = await request(app)
      .post('/webhooks/banking/plaid')
      .set('Content-Type', 'application/json')
      .send(
        JSON.stringify({
          webhook_type: 'ITEM',
          webhook_code: 'USER_PERMISSION_REVOKED',
          item_id: 'item-1',
          environment: 'sandbox',
        }),
      );

    expect(response.status).toBe(200);
    expect(mocks.revokeConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'connection-1',
        companyId: 'company-1',
        revocationOrigin: 'provider',
        revocationReason: 'Plaid USER_PERMISSION_REVOKED',
      }),
    );
  });
});
