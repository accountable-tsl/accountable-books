import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import {
  cleanupSyncFailureFixture,
  createSyncFailureFixture,
} from '../../../../integrations/banking/services/__tests__/transaction-sync.test-helpers.js';
import { notify } from '../../../notifications/notifications.model.js';
import { NOTIFICATION_TYPE } from '../../../notifications/notifications.types.js';
import { OUTBOX_INTENT } from '../../../outbox/intents.js';
import { dispatchPendingIntents } from '../../../outbox/outbox.dispatcher.js';
import {
  buildBankReplacementUnmatchedAttentionKey,
  buildBankTransactionRemovedAttentionKey,
  buildBankTransactionSupersededAttentionKey,
  writeBankReplacementUnmatchedNotifications,
  writeBankTransactionRemovedNotifications,
  writeBankTransactionSupersededNotifications,
} from '../../bankAccounts/bankAccountNotifications.js';
import {
  acknowledgeBankTransactionRemovedReview,
  acknowledgeBankTransactionSupersededReview,
  resolveReplacementUnmatchedReview,
} from '../bank-exception-review.service.js';

describe('bank exception review resolution (M5a)', () => {
  let db: Knex;
  let fixture: Awaited<ReturnType<typeof createSyncFailureFixture>>;

  beforeEach(async () => {
    db = getTestDb();
    fixture = await createSyncFailureFixture(db);
  });

  afterEach(async () => {
    await db('app.outbox')
      .whereIn('intent_type', [
        OUTBOX_INTENT.NOTIFICATION_REQUESTED,
        OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED,
        OUTBOX_INTENT.NOTIFICATION_COMMS_REQUESTED,
      ])
      .delete();
    await db('app.notifications')
      .where({ client_company_id: fixture.companyId })
      .del();
    await cleanupSyncFailureFixture(db, fixture);
  });

  async function insertBankTransaction(
    overrides: { isDeleted?: boolean } = {},
  ) {
    const [batch] = await db('bank_transaction_batches')
      .insert({
        company_id: fixture.companyId,
        bank_account_id: fixture.bankAccountId,
        bank_account_feed_id: fixture.feedId,
        source: 'bank_feed',
        status: 'active',
        start_date: '2026-01-15',
        end_date: '2026-01-15',
        fingerprint: `review-fixture-${randomUUID()}`,
        import_row_count: 1,
        created_by_id: fixture.userId,
      })
      .returning<{ id: string }[]>('id');

    const [row] = await db('bank_transactions')
      .insert({
        company_id: fixture.companyId,
        bank_account_id: fixture.bankAccountId,
        bank_transaction_batch_id: batch!.id,
        transaction_date: '2026-01-15',
        transaction_at: new Date('2026-01-15T12:00:00.000Z'),
        amount: -42.5,
        system_exchange_rate: 1,
        description: 'Review fixture',
        is_deleted: overrides.isDeleted ?? false,
        deleted_at: overrides.isDeleted ? db.fn.now() : null,
        deletion_origin: overrides.isDeleted ? 'provider_sync' : null,
        deletion_reason: overrides.isDeleted ? 'Superseded fixture' : null,
        created_by_id: fixture.userId,
        updated_by_id: fixture.userId,
      })
      .returning<{ id: string }[]>('id');
    return row!.id;
  }

  it('acknowledges superseded review and stops re-raising while resolved', async () => {
    const bankTransactionId = await insertBankTransaction({
      isDeleted: true,
    });

    await db.transaction(async (trx) => {
      await writeBankTransactionSupersededNotifications(trx, {
        clientCompanyId: fixture.companyId,
        bankAccountId: fixture.bankAccountId,
        bankAccountName: 'Fixture account',
        bankTransactionId,
        ledgerTransactionId: randomUUID(),
        replacementBankTransactionId: null,
        stateVersion: '2026-07-18T00:00:00.000Z',
      });
    });

    await dispatchPendingIntents(20, {
      intentType: OUTBOX_INTENT.NOTIFICATION_REQUESTED,
    });

    const attentionKey =
      buildBankTransactionSupersededAttentionKey(bankTransactionId);
    const opened = await db('app.notifications')
      .where({
        client_company_id: fixture.companyId,
        attention_key: attentionKey,
      })
      .whereNull('resolved_at')
      .first('id');
    expect(opened?.id).toBeTruthy();

    const result = await db.transaction((trx) =>
      acknowledgeBankTransactionSupersededReview({
        companyId: fixture.companyId,
        bankAccountId: fixture.bankAccountId,
        bankTransactionId,
        actorUserId: fixture.userId,
        trx,
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data?.alreadyResolved).toBe(false);

    await dispatchPendingIntents(20, {
      intentType: OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED,
    });

    const resolved = await db('app.notifications')
      .where({ id: opened!.id })
      .first('resolved_at');
    expect(resolved?.resolved_at).toBeTruthy();

    const reraised = await db.transaction(async (trx) =>
      writeBankTransactionSupersededNotifications(trx, {
        clientCompanyId: fixture.companyId,
        bankAccountId: fixture.bankAccountId,
        bankAccountName: 'Fixture account',
        bankTransactionId,
        ledgerTransactionId: randomUUID(),
        replacementBankTransactionId: null,
        stateVersion: '2026-07-18T01:00:00.000Z',
      }),
    );
    expect(reraised).toBe(0);
  });

  it('acknowledges removed review', async () => {
    const bankTransactionId = await insertBankTransaction();

    await db.transaction(async (trx) => {
      await writeBankTransactionRemovedNotifications(trx, {
        clientCompanyId: fixture.companyId,
        bankAccountId: fixture.bankAccountId,
        bankAccountName: 'Fixture account',
        bankTransactionId,
        ledgerTransactionId: randomUUID(),
        stateVersion: '2026-07-18T00:00:00.000Z',
      });
    });
    await dispatchPendingIntents(20, {
      intentType: OUTBOX_INTENT.NOTIFICATION_REQUESTED,
    });

    const result = await db.transaction((trx) =>
      acknowledgeBankTransactionRemovedReview({
        companyId: fixture.companyId,
        bankAccountId: fixture.bankAccountId,
        bankTransactionId,
        actorUserId: fixture.userId,
        trx,
      }),
    );
    expect(result.success).toBe(true);

    await dispatchPendingIntents(20, {
      intentType: OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED,
    });

    const attentionKey =
      buildBankTransactionRemovedAttentionKey(bankTransactionId);
    const row = await db('app.notifications')
      .where({
        client_company_id: fixture.companyId,
        attention_key: attentionKey,
      })
      .first('resolved_at');
    expect(row?.resolved_at).toBeTruthy();
  });

  it('resolves unmatched as genuine without retiring the transaction', async () => {
    const bankTransactionId = await insertBankTransaction();
    await db('bank_transaction_feed_entries').insert({
      company_id: fixture.companyId,
      bank_account_feed_id: fixture.feedId,
      provider_transaction_id: `provider-${randomUUID()}`,
      bank_transaction_id: bankTransactionId,
      observation_type: 'added',
      provider_evidence: {},
      provider_evidence_schema_version: 1,
      observed_at: new Date(),
      replacement_unmatched: true,
    });

    await db.transaction(async (trx) => {
      await writeBankReplacementUnmatchedNotifications(trx, {
        clientCompanyId: fixture.companyId,
        bankAccountId: fixture.bankAccountId,
        bankAccountName: 'Fixture account',
        feedId: fixture.feedId,
        unmatchedCount: 1,
        stateVersion: '2026-07-18T00:00:00.000Z',
      });
    });
    await dispatchPendingIntents(20, {
      intentType: OUTBOX_INTENT.NOTIFICATION_REQUESTED,
    });

    const result = await db.transaction((trx) =>
      resolveReplacementUnmatchedReview({
        companyId: fixture.companyId,
        bankAccountId: fixture.bankAccountId,
        bankTransactionId,
        decision: 'genuine',
        actorUserId: fixture.userId,
        trx,
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      decision: 'genuine',
      retired: false,
      feedAttentionResolved: true,
    });

    const entry = await db('bank_transaction_feed_entries')
      .where({ bank_transaction_id: bankTransactionId })
      .first('replacement_unmatched');
    expect(entry?.replacement_unmatched).toBe(false);

    const txn = await db('bank_transactions')
      .where({ id: bankTransactionId })
      .first('is_deleted');
    expect(txn?.is_deleted).toBe(false);

    await dispatchPendingIntents(20, {
      intentType: OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED,
    });

    const attention = await db('app.notifications')
      .where({
        client_company_id: fixture.companyId,
        attention_key: buildBankReplacementUnmatchedAttentionKey(
          fixture.feedId,
        ),
      })
      .first('resolved_at');
    expect(attention?.resolved_at).toBeTruthy();
  });

  it('resolves unmatched as duplicate by retiring the imported transaction', async () => {
    const bankTransactionId = await insertBankTransaction();
    await db('bank_transaction_feed_entries').insert({
      company_id: fixture.companyId,
      bank_account_feed_id: fixture.feedId,
      provider_transaction_id: `provider-${randomUUID()}`,
      bank_transaction_id: bankTransactionId,
      observation_type: 'added',
      provider_evidence: {},
      provider_evidence_schema_version: 1,
      observed_at: new Date(),
      replacement_unmatched: true,
    });

    await notify({
      recipientUserId: fixture.userId,
      clientCompanyId: fixture.companyId,
      eventType: NOTIFICATION_TYPE.BANK_REPLACEMENT_UNMATCHED_REVIEW,
      attentionKey: buildBankReplacementUnmatchedAttentionKey(fixture.feedId),
      attentionTransition: 'opened',
      priority: 'high',
      title: 'Review unmatched',
      destination: { workspace: 'banking' },
      idempotencyKey: `test-unmatched:${randomUUID()}`,
    });

    const result = await db.transaction((trx) =>
      resolveReplacementUnmatchedReview({
        companyId: fixture.companyId,
        bankAccountId: fixture.bankAccountId,
        bankTransactionId,
        decision: 'duplicate',
        actorUserId: fixture.userId,
        trx,
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      decision: 'duplicate',
      retired: true,
      feedAttentionResolved: true,
    });

    const txn = await db('bank_transactions')
      .where({ id: bankTransactionId })
      .first('is_deleted', 'deletion_origin', 'deletion_reason');
    expect(txn).toMatchObject({
      is_deleted: true,
      deletion_origin: 'user_action',
    });
    expect(String(txn?.deletion_reason)).toContain('duplicate');
  });
});
