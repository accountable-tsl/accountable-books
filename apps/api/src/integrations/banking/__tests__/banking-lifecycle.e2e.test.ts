import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { ingestProviderWebhookEvent } from '../../../domains/banking/bank-provider-webhook-events/bank-provider-webhook-events.model.js';
import { resolveReplacementUnmatchedReview } from '../../../domains/banking/bank-exception-review/bank-exception-review.service.js';
import { loadSecretForProviderExecution } from '../../../domains/banking/bank-connection-secrets/bank-connection-secrets.model.js';
import { revokeConnectionAndDestroySecret } from '../../../domains/banking/connection-lifecycle/lifecycle.commands.js';
import { NOTIFICATION_TYPE } from '../../../domains/notifications/notifications.types.js';
import { OUTBOX_INTENT } from '../../../domains/outbox/intents.js';
import { dispatchPendingIntents } from '../../../domains/outbox/outbox.dispatcher.js';
import { encrypt } from '../../../shared/utils/crypto.utils.js';
import { providerRegistry } from '../providers/registry.js';
import { requestBankAccountSync } from '../transaction-sync.outbox.js';
import {
  cleanupSyncFailureFixture,
  createSyncFailureFixture,
  fakeProvider,
  providerTransaction,
} from '../services/__tests__/transaction-sync.test-helpers.js';

import type { FakeProviderPage } from '../services/__tests__/transaction-sync.test-helpers.js';

const mocks = vi.hoisted(() => ({
  alertAdmins: vi.fn(async () => undefined),
}));

vi.mock('../../../features/comms/admin-alerts.js', () => ({
  alertAdmins: mocks.alertAdmins,
}));

afterEach(() => {
  vi.restoreAllMocks();
  mocks.alertAdmins.mockClear();
});

function singlePage(
  page: Partial<FakeProviderPage['transactions']>,
  historyStatus: FakeProviderPage['historyStatus'] = 'complete',
): () => Promise<FakeProviderPage> {
  return async () => ({
    transactions: { added: [], modified: [], removed: [], ...page },
    nextCursor: `cursor-${randomUUID()}`,
    hasMore: false,
    historyStatus,
  });
}

async function drainBankSync(max = 5) {
  return dispatchPendingIntents(max, {
    intentType: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
  });
}

describe('banking lifecycle e2e', () => {
  it(
    'leased sync → webhook sync → replacement unmatched resolve → revoke',
    async () => {
      const db = getTestDb();
      const fixture = await createSyncFailureFixture(db);
      let replacementConnectionId: string | null = null;

      try {
        const connection = await db('bank_connections')
          .where({ id: fixture.connectionId })
          .first<{ provider_item_id: string; provider_id: string }>(
            'provider_item_id',
            'provider_id',
          );
        if (!connection?.provider_item_id) {
          throw new Error('Expected fixture connection provider_item_id');
        }

        await db('bank_account_feeds').where({ id: fixture.feedId }).update({
          sync_from_date: '2026-01-01',
        });

        const initialTxn = {
          ...providerTransaction(
            fixture.providerBankAccountId,
            `initial-${randomUUID()}`,
          ),
          date: '2026-01-15',
          amount: -25,
        };

        vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
          fakeProvider(singlePage({ added: [initialTxn] })),
        );

        await requestBankAccountSync({
          bankAccountId: fixture.bankAccountId,
          trigger: 'initial',
          actorUserId: fixture.userId,
        });
        const initialDrain = await drainBankSync();
        expect(initialDrain.processed).toBeGreaterThanOrEqual(1);

        const feedAfterInitial = await db('bank_account_feeds')
          .where({ id: fixture.feedId })
          .first(
            'initial_sync_completed_at',
            'last_successful_sync_at',
            'sync_cursor',
          );
        expect(feedAfterInitial?.initial_sync_completed_at).toBeTruthy();
        expect(feedAfterInitial?.last_successful_sync_at).toBeTruthy();

        const initialImport = await db('bank_transaction_feed_entries')
          .where({
            bank_account_feed_id: fixture.feedId,
            provider_transaction_id: initialTxn.transactionId,
          })
          .first('bank_transaction_id');
        expect(initialImport?.bank_transaction_id).toBeTruthy();

        const webhookTxn = {
          ...providerTransaction(
            fixture.providerBankAccountId,
            `webhook-${randomUUID()}`,
          ),
          date: '2026-01-18',
          amount: -10,
        };
        vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
          fakeProvider(singlePage({ added: [webhookTxn] })),
        );

        await db.transaction(async (trx: Knex.Transaction) => {
          const ingested = await ingestProviderWebhookEvent({
            providerKey: 'plaid',
            providerItemId: connection.provider_item_id,
            eventType: 'TRANSACTIONS',
            eventCode: 'SYNC_UPDATES_AVAILABLE',
            dedupeKey: `lifecycle-e2e-${randomUUID()}`,
            payload: {
              webhook_type: 'TRANSACTIONS',
              webhook_code: 'SYNC_UPDATES_AVAILABLE',
              item_id: connection.provider_item_id,
            },
            trx,
          });
          expect(ingested.inserted).toBe(true);
        });

        const webhookDrain = await dispatchPendingIntents(10, {
          intentType: OUTBOX_INTENT.PROVIDER_WEBHOOK_RECEIVED,
        });
        expect(webhookDrain.processed).toBeGreaterThanOrEqual(1);

        const pendingWebhookSync = await db('app.outbox')
          .where({
            intent_type: OUTBOX_INTENT.BANK_SYNC_REQUESTED,
            scope_key: `bank_account:${fixture.bankAccountId}`,
            status: 'pending',
          })
          .first<{ payload: { trigger?: string } }>('payload');
        expect(pendingWebhookSync?.payload).toMatchObject({
          trigger: 'webhook',
        });

        const webhookSyncDrain = await drainBankSync();
        expect(webhookSyncDrain.processed).toBeGreaterThanOrEqual(1);

        const webhookImport = await db('bank_transaction_feed_entries')
          .where({
            bank_account_feed_id: fixture.feedId,
            provider_transaction_id: webhookTxn.transactionId,
          })
          .first('bank_transaction_id');
        expect(webhookImport?.bank_transaction_id).toBeTruthy();

        await db('bank_account_feeds').where({ id: fixture.feedId }).update({
          revoked_at: db.fn.now(),
          revocation_origin: 'client',
          revocation_reason: 'replaced',
        });

        const [newConnection] = await db('bank_connections')
          .insert({
            company_id: fixture.companyId,
            provider_id: connection.provider_id,
            provider_item_id: `item-replacement-${randomUUID()}`,
            authorization_status: 'active',
            connected_by_id: fixture.userId,
          })
          .returning('id');
        replacementConnectionId = newConnection.id as string;

        await db('bank_connection_secrets').insert({
          bank_connection_id: newConnection.id,
          encrypted_access_token: encrypt(
            `access-${randomUUID()}`,
            `${newConnection.id}:${fixture.companyId}`,
          ),
          encryption_key_version: 1,
        });

        const newProviderAccountId = `provider-account-${randomUUID()}`;
        const [newFeed] = await db('bank_account_feeds')
          .insert({
            company_id: fixture.companyId,
            bank_account_id: fixture.bankAccountId,
            bank_connection_id: newConnection.id,
            provider_account_id: newProviderAccountId,
            sync_from_timezone: 'Etc/UTC',
            sync_from_date: '2026-01-01',
            connected_by_id: fixture.userId,
            replaces_bank_account_feed_id: fixture.feedId,
          })
          .returning('id');

        const matching = {
          ...providerTransaction(
            newProviderAccountId,
            `match-${randomUUID()}`,
          ),
          date: initialTxn.date,
          amount: initialTxn.amount,
        };
        const unmatched = {
          ...providerTransaction(
            newProviderAccountId,
            `unmatched-${randomUUID()}`,
          ),
          date: '2026-01-16',
          amount: 99,
        };

        vi.spyOn(providerRegistry, 'getById').mockResolvedValue(
          fakeProvider(singlePage({ added: [matching, unmatched] })),
        );

        await requestBankAccountSync({
          bankAccountId: fixture.bankAccountId,
          trigger: 'initial',
          actorUserId: fixture.userId,
        });
        const replacementDrain = await drainBankSync();
        expect(replacementDrain.processed).toBeGreaterThanOrEqual(1);

        const unmatchedEntry = await db('bank_transaction_feed_entries')
          .where({
            bank_account_feed_id: newFeed.id,
            provider_transaction_id: unmatched.transactionId,
          })
          .first('bank_transaction_id', 'replacement_unmatched');
        expect(unmatchedEntry).toMatchObject({
          replacement_unmatched: true,
        });
        expect(unmatchedEntry?.bank_transaction_id).toBeTruthy();

        const reviewIntent = await db('app.outbox')
          .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
          .whereRaw(`payload->'event'->>'eventType' = ?`, [
            NOTIFICATION_TYPE.BANK_REPLACEMENT_UNMATCHED_REVIEW,
          ])
          .first();
        expect(reviewIntent).toBeTruthy();

        await dispatchPendingIntents(20, {
          intentType: OUTBOX_INTENT.NOTIFICATION_REQUESTED,
        });

        const resolveResult = await db.transaction((trx) =>
          resolveReplacementUnmatchedReview({
            companyId: fixture.companyId,
            bankAccountId: fixture.bankAccountId,
            bankTransactionId: unmatchedEntry!.bank_transaction_id!,
            decision: 'genuine',
            actorUserId: fixture.userId,
            trx,
          }),
        );
        expect(resolveResult.success).toBe(true);
        expect(resolveResult.data).toMatchObject({
          decision: 'genuine',
          retired: false,
          feedAttentionResolved: true,
        });

        await dispatchPendingIntents(20, {
          intentType: OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED,
        });

        const cleared = await db('bank_transaction_feed_entries')
          .where({
            bank_account_feed_id: newFeed.id,
            provider_transaction_id: unmatched.transactionId,
          })
          .first('replacement_unmatched');
        expect(cleared?.replacement_unmatched).toBe(false);

        const revokeResult = await db.transaction((trx) =>
          revokeConnectionAndDestroySecret({
            connectionId: replacementConnectionId!,
            companyId: fixture.companyId,
            revokedById: fixture.userId,
            revocationOrigin: 'client',
            trx,
          }),
        );
        expect(revokeResult.success).toBe(true);
        expect(revokeResult.data?.alreadyRevoked).toBe(false);

        const secret = await loadSecretForProviderExecution({
          connectionId: replacementConnectionId!,
          companyId: fixture.companyId,
        });
        expect(secret.success).toBe(false);

        const revokedConnection = await db('bank_connections')
          .where({ id: replacementConnectionId })
          .first('authorization_status');
        expect(revokedConnection?.authorization_status).toBe('revoked');
      } finally {
        await db('bank_provider_webhook_events').del();
        await db('app.outbox')
          .whereIn('intent_type', [
            OUTBOX_INTENT.PROVIDER_WEBHOOK_RECEIVED,
            OUTBOX_INTENT.BANK_SYNC_REQUESTED,
            OUTBOX_INTENT.NOTIFICATION_REQUESTED,
            OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED,
            OUTBOX_INTENT.NOTIFICATION_COMMS_REQUESTED,
          ])
          .delete();
        await db('app.notifications')
          .where({ client_company_id: fixture.companyId })
          .del();
        await cleanupSyncFailureFixture(
          db,
          fixture,
          replacementConnectionId ? [replacementConnectionId] : [],
        );
      }
    },
    30_000,
  );
});
