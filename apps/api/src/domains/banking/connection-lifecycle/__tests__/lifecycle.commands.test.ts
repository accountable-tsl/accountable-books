import type { Knex } from 'knex';
import { describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import {
  cleanupSyncFailureFixture,
  createSyncFailureFixture,
} from '../../../../integrations/banking/services/__tests__/transaction-sync.test-helpers.js';
import { NOTIFICATION_TYPE } from '../../../notifications/notifications.types.js';
import { OUTBOX_INTENT } from '../../../outbox/intents.js';
import {
  loadSecretForProviderExecution,
  rotateBankConnectionSecret,
} from '../../bank-connection-secrets/bank-connection-secrets.model.js';
import { classifyConnectEvent } from '../classify.js';
import {
  completeConnectionReauthorization,
  revokeConnectionAndDestroySecret,
  stopFeedAndCancelSync,
} from '../lifecycle.commands.js';

describe('connection lifecycle commands', () => {
  it('stops one feed without touching siblings and cancels pending sync', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      const sibling = await db.transaction(async (trx: Knex.Transaction) => {
        const [account] = await trx('bank_accounts')
          .insert({
            display_name: 'Sibling',
            account_number_mask: '9999',
            account_type: 'savings',
            business_or_personal: 'business',
            bank_id: (await trx('bank_accounts')
              .where({ id: fixture.bankAccountId })
              .first('bank_id'))!.bank_id,
            currency_id: (await trx('bank_accounts')
              .where({ id: fixture.bankAccountId })
              .first('currency_id'))!.currency_id,
            company_id: fixture.companyId,
            coa_id: (await trx('bank_accounts')
              .where({ id: fixture.bankAccountId })
              .first('coa_id'))!.coa_id,
            created_by_id: fixture.userId,
            updated_by_id: fixture.userId,
          })
          .returning('id');

        const [feed] = await trx('bank_account_feeds')
          .insert({
            company_id: fixture.companyId,
            bank_account_id: account.id,
            bank_connection_id: fixture.connectionId,
            provider_account_id: `sibling-${fixture.providerBankAccountId}`,
            sync_from_timezone: 'Etc/UTC',
            connected_by_id: fixture.userId,
          })
          .returning('id');

        await trx('app.outbox').insert({
          intent_type: 'bank_sync_requested',
          scope_key: `bank_account:${fixture.bankAccountId}`,
          payload: JSON.stringify({
            bankAccountId: fixture.bankAccountId,
            trigger: 'manual',
          }),
          status: 'pending',
          available_at: trx.fn.now(),
        });

        return { accountId: account.id as string, feedId: feed.id as string };
      });

      const stopped = await db.transaction(async (trx) =>
        stopFeedAndCancelSync({
          feedId: fixture.feedId,
          companyId: fixture.companyId,
          revokedById: fixture.userId,
          revocationOrigin: 'client',
          trx,
        }),
      );
      expect(stopped.success).toBe(true);
      expect(stopped.data?.alreadyStopped).toBe(false);

      const primary = await db('bank_account_feeds')
        .where({ id: fixture.feedId })
        .first('revoked_at');
      const other = await db('bank_account_feeds')
        .where({ id: sibling.feedId })
        .first('revoked_at');
      expect(primary?.revoked_at).toBeTruthy();
      expect(other?.revoked_at).toBeNull();

      const pending = await db('app.outbox')
        .where({
          scope_key: `bank_account:${fixture.bankAccountId}`,
          status: 'pending',
        })
        .first();
      expect(pending).toBeUndefined();

      const again = await db.transaction(async (trx) =>
        stopFeedAndCancelSync({
          feedId: fixture.feedId,
          companyId: fixture.companyId,
          revocationOrigin: 'client',
          trx,
        }),
      );
      expect(again.data?.alreadyStopped).toBe(true);
    } finally {
      await db('bank_account_feeds')
        .where({ bank_connection_id: fixture.connectionId })
        .delete();
      await db('bank_accounts')
        .where({ company_id: fixture.companyId })
        .whereNot({ id: fixture.bankAccountId })
        .whereILike('display_name', 'Sibling%')
        .delete();
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('revokes a connection, destroys its secret, and is idempotent', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      const before = await loadSecretForProviderExecution({
        connectionId: fixture.connectionId,
        companyId: fixture.companyId,
      });
      expect(before.success).toBe(true);

      const first = await db.transaction(async (trx) =>
        revokeConnectionAndDestroySecret({
          connectionId: fixture.connectionId,
          companyId: fixture.companyId,
          revokedById: fixture.userId,
          revocationOrigin: 'client',
          trx,
        }),
      );
      expect(first.success).toBe(true);
      expect(first.data?.alreadyRevoked).toBe(false);

      const secret = await loadSecretForProviderExecution({
        connectionId: fixture.connectionId,
        companyId: fixture.companyId,
      });
      expect(secret.success).toBe(false);

      const connection = await db('bank_connections')
        .where({ id: fixture.connectionId })
        .first('authorization_status');
      expect(connection?.authorization_status).toBe('revoked');

      const disconnectedIntents = await db('app.outbox')
        .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
        .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
          NOTIFICATION_TYPE.BANK_CONNECTION_DISCONNECTED,
        ])
        .andWhereRaw(`payload->'event'->'sourceEntity'->>'id' = ?`, [
          fixture.bankAccountId,
        ]);
      expect(disconnectedIntents.length).toBeGreaterThanOrEqual(1);
      expect(disconnectedIntents[0]?.payload.event).toEqual(
        expect.objectContaining({
          eventType: NOTIFICATION_TYPE.BANK_CONNECTION_DISCONNECTED,
          destination: expect.objectContaining({
            action: 'view_bank_account',
            bankAccountId: fixture.bankAccountId,
            connectionId: fixture.connectionId,
          }),
          data: expect.objectContaining({
            revocationOrigin: 'client',
            connectionId: fixture.connectionId,
          }),
        }),
      );

      const reconnectIntents = await db('app.outbox')
        .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
        .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
          NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
        ])
        .andWhereRaw(`payload->'event'->'sourceEntity'->>'id' = ?`, [
          fixture.bankAccountId,
        ]);
      expect(reconnectIntents).toHaveLength(0);

      const second = await db.transaction(async (trx) =>
        revokeConnectionAndDestroySecret({
          connectionId: fixture.connectionId,
          companyId: fixture.companyId,
          revocationOrigin: 'client',
          trx,
        }),
      );
      expect(second.data?.alreadyRevoked).toBe(true);

      const disconnectedAfterIdempotent = await db('app.outbox')
        .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
        .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
          NOTIFICATION_TYPE.BANK_CONNECTION_DISCONNECTED,
        ])
        .andWhereRaw(`payload->'event'->'sourceEntity'->>'id' = ?`, [
          fixture.bankAccountId,
        ]);
      expect(disconnectedAfterIdempotent).toHaveLength(
        disconnectedIntents.length,
      );
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('rotates secrets in place for an active connection', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      await db.transaction(async (trx) => {
        const rotated = await rotateBankConnectionSecret({
          connectionId: fixture.connectionId,
          companyId: fixture.companyId,
          accessToken: 'rotated-token',
          trx,
        });
        expect(rotated.success).toBe(true);

        const loaded = await loadSecretForProviderExecution({
          connectionId: fixture.connectionId,
          companyId: fixture.companyId,
          trx,
        });
        expect(loaded.data?.access_token).toBe('rotated-token');

        const count = await trx('bank_connection_secrets')
          .where({ bank_connection_id: fixture.connectionId })
          .count<{ count: string }>('id as count')
          .first();
        expect(count?.count).toBe('1');
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('reactivates a requires-action connection and durably requests a fresh sync', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      await db('bank_connections').where({ id: fixture.connectionId }).update({
        authorization_status: 'requires_action',
        authorization_reason_code: 'ITEM_LOGIN_REQUIRED',
        requires_action_at: db.fn.now(),
      });

      const result = await db.transaction(async (trx) =>
        completeConnectionReauthorization({
          connectionId: fixture.connectionId,
          companyId: fixture.companyId,
          updatedById: fixture.userId,
          trx,
        }),
      );

      expect(result.success).toBe(true);
      expect(result.data?.syncsQueued).toBe(1);
      expect(
        await db('bank_connections')
          .where({ id: fixture.connectionId })
          .first('authorization_status'),
      ).toEqual({ authorization_status: 'active' });
      expect(
        await db('app.outbox')
          .where({
            intent_type: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
            scope_key: `bank_account:${fixture.bankAccountId}`,
            status: 'pending',
          })
          .first('id'),
      ).toBeTruthy();
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('classifies same item as reauth and clean overlap as replace', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      await db.transaction(async (trx) => {
        const same = await classifyConnectEvent({
          trx,
          companyId: fixture.companyId,
          providerId: (await trx('bank_connections')
            .where({ id: fixture.connectionId })
            .first('provider_id'))!.provider_id,
          providerItemId: (await trx('bank_connections')
            .where({ id: fixture.connectionId })
            .first('provider_item_id'))!.provider_item_id,
          providerAccountIds: [fixture.providerBankAccountId],
        });
        expect(same.kind).toBe('reauth');

        const replace = await classifyConnectEvent({
          trx,
          companyId: fixture.companyId,
          providerId: (await trx('bank_connections')
            .where({ id: fixture.connectionId })
            .first('provider_id'))!.provider_id,
          providerItemId: 'brand-new-item',
          providerAccountIds: [fixture.providerBankAccountId],
        });
        expect(replace.kind).toBe('replace');
        if (replace.kind === 'replace') {
          expect(replace.oldConnectionId).toBe(fixture.connectionId);
        }
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });
});
