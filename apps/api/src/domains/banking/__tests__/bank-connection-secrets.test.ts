import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import {
  createBankConnectionSecret,
  loadSecretForConnectionReauthorization,
  loadSecretForProviderExecution,
} from '../bank-connection-secrets/bank-connection-secrets.model.js';
import {
  createBankConnection,
  getBankConnection,
} from '../bank-connections/bank-connections.model.js';

describe('bank connection secrets', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;
  let connectionId: string;
  let providerKey: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
    userId = await getTestUserId(trx, US_USER_EMAIL);

    const provider = await trx('bank_feed_providers')
      .select('id', 'key')
      .first<{ id: string; key: string }>();
    if (!provider) throw new Error('Expected a bank feed provider fixture');
    providerKey = provider.key;

    const [connection] = await trx('bank_connections')
      .insert({
        company_id: companyId,
        provider_id: provider.id,
        authorization_status: 'active',
        connected_by_id: userId,
      })
      .returning<{ id: string }[]>('id');
    if (!connection) throw new Error('Failed to create test bank connection');
    connectionId = connection.id;
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('creates a connection secret and never exposes it through ordinary connection reads', async () => {
    const created = await createBankConnectionSecret({
      connectionId,
      companyId,
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      trx,
    });
    expect(created.success).toBe(true);

    const connectionResult = await getBankConnection({
      connectionId,
      companyId,
      trx,
    });
    expect(connectionResult.success).toBe(true);
    expect(connectionResult.data).not.toHaveProperty('encrypted_access_token');
    expect(connectionResult.data).not.toHaveProperty('encrypted_refresh_token');

    // Belt-and-suspenders: the base bank_connections table has no secret
    // columns at all — token material only ever lives in
    // bank_connection_secrets — so an ordinary `select *` cannot leak it
    // either, even if a caller bypassed the model's column allow-list.
    const rawConnectionRow = await trx('bank_connections')
      .where({ id: connectionId })
      .select('*')
      .first();
    expect(rawConnectionRow).not.toHaveProperty('encrypted_access_token');
    expect(rawConnectionRow).not.toHaveProperty('encrypted_refresh_token');

    const secretRow = await trx('bank_connection_secrets')
      .where({ bank_connection_id: connectionId })
      .first<{ encrypted_access_token: string | null }>();
    expect(secretRow?.encrypted_access_token).toBeTruthy();
  });

  it('returns decrypted tokens for an active connection via loadSecretForProviderExecution', async () => {
    await createBankConnectionSecret({
      connectionId,
      companyId,
      accessToken: 'active-access-token',
      refreshToken: 'active-refresh-token',
      trx,
    });

    const loaded = await loadSecretForProviderExecution({
      connectionId,
      companyId,
      trx,
    });

    expect(loaded.success).toBe(true);
    expect(loaded.data).toEqual(
      expect.objectContaining({
        bank_connection_id: connectionId,
        access_token: 'active-access-token',
        refresh_token: 'active-refresh-token',
      }),
    );
  });

  it('fails to load a secret for provider execution when the connection itself is not active', async () => {
    await createBankConnectionSecret({
      connectionId,
      companyId,
      accessToken: 'requires-action-token',
      trx,
    });

    await trx('bank_connections').where({ id: connectionId }).update({
      authorization_status: 'requires_action',
      requires_action_at: trx.fn.now(),
    });

    const loaded = await loadSecretForProviderExecution({
      connectionId,
      companyId,
      trx,
    });

    expect(loaded.success).toBe(false);
  });

  it('loads a requires-action connection secret only for its company and provider during reauthorization', async () => {
    await createBankConnectionSecret({
      connectionId,
      companyId,
      accessToken: 'reauthorization-token',
      trx,
    });
    await trx('bank_connections').where({ id: connectionId }).update({
      authorization_status: 'requires_action',
      requires_action_at: trx.fn.now(),
    });

    const loaded = await loadSecretForConnectionReauthorization({
      connectionId,
      companyId,
      providerKey,
      trx,
    });
    const wrongCompany = await loadSecretForConnectionReauthorization({
      connectionId,
      companyId: randomUUID(),
      providerKey,
      trx,
    });

    expect(loaded.data?.access_token).toBe('reauthorization-token');
    expect(wrongCompany.success).toBe(false);
  });

  it('refuses to create secret material with the wrong tenant context', async () => {
    const wrongCompanyId = randomUUID();
    const rejectedCreate = await createBankConnectionSecret({
      connectionId,
      companyId: wrongCompanyId,
      accessToken: 'wrong-tenant-token',
      trx,
    });
    expect(rejectedCreate.success).toBe(false);
    expect(
      await trx('bank_connection_secrets')
        .where({ bank_connection_id: connectionId })
        .first('id'),
    ).toBeUndefined();
  });

  it('rolls back connection and secret creation as one database transaction', async () => {
    const provider = await trx('bank_feed_providers')
      .select('id')
      .first<{ id: string }>();
    if (!provider) throw new Error('Expected a bank feed provider fixture');
    const providerItemId = `rollback-${randomUUID()}`;

    await expect(
      trx.transaction(async (nested) => {
        const connection = await createBankConnection({
          data: {
            company_id: companyId,
            provider_id: provider.id,
            provider_item_id: providerItemId,
            connected_by_id: userId,
          },
          trx: nested,
        });
        if (!connection.success || !connection.data) {
          throw new Error('Failed to create rollback-test connection');
        }

        const secret = await createBankConnectionSecret({
          connectionId: connection.data.id,
          companyId,
          accessToken: 'must-roll-back',
          trx: nested,
        });
        expect(secret.success).toBe(true);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect(
      await trx('bank_connections')
        .where({ provider_item_id: providerItemId })
        .first('id'),
    ).toBeUndefined();
  });
});
