import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import plaidWebhookRouter from '../plaid.webhook.js';

const mocks = vi.hoisted(() => ({
  findCredentialByItemId: vi.fn(),
  scheduleSyncForCredential: vi.fn(),
}));

vi.mock('../../../../integrations/banking/index.js', () => ({
  scheduleSyncForCredential: mocks.scheduleSyncForCredential,
}));

vi.mock(
  '../../../../integrations/banking/services/transaction-sync.service.js',
  () => ({
    transactionSyncService: {
      findCredentialByItemId: mocks.findCredentialByItemId,
    },
  }),
);

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
  });

  it('routes Item updates through the account fan-out helper', async () => {
    mocks.findCredentialByItemId.mockResolvedValue({ id: 'credential-1' });
    mocks.scheduleSyncForCredential.mockResolvedValue([]);
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
    expect(mocks.findCredentialByItemId).toHaveBeenCalledWith('item-1');
    expect(mocks.scheduleSyncForCredential).toHaveBeenCalledOnce();
    expect(mocks.scheduleSyncForCredential).toHaveBeenCalledWith({
      credentialId: 'credential-1',
      trigger: 'webhook',
    });
  });
});
