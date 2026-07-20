import type { Knex } from 'knex';
import { describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import {
  cleanupSyncFailureFixture,
  createSyncFailureFixture,
} from '../../../../integrations/banking/services/__tests__/transaction-sync.test-helpers.js';
import {
  createHistoryImport,
  markHistoryImportStatus,
  refreshHistoryImportAggregates,
  upsertHistoryCandidates,
} from '../bank-transaction-history.model.js';
import {
  expireDueHistoryImports,
  processHistoryImportExpirySweep,
  sendDueHistoryImportReminders,
} from '../history-expiry.service.js';
import { promoteBankTransactionHistory } from '../history-promotion.service.js';

async function seedAvailableImport(
  db: Knex,
  fixture: {
    feedId: string;
    companyId: string;
  },
  candidates: Array<{ id: string; date: string; amount: number }>,
) {
  await db.transaction(async (trx: Knex.Transaction) => {
    await createHistoryImport({
      bankAccountFeedId: fixture.feedId,
      companyId: fixture.companyId,
      trx,
    });
    await upsertHistoryCandidates({
      candidates: candidates.map((c) => ({
        bank_account_feed_id: fixture.feedId,
        company_id: fixture.companyId,
        provider_transaction_id: c.id,
        transaction_date: new Date(c.date),
        transaction_at: new Date(`${c.date}T10:00:00Z`),
        amount: c.amount,
        description: c.id,
        payee: 'Vendor',
        provider_evidence: { id: c.id },
        provider_evidence_schema_version: 1,
        observed_at: new Date(),
      })),
      trx,
    });
    await refreshHistoryImportAggregates({
      bankAccountFeedId: fixture.feedId,
      trx,
    });
    await markHistoryImportStatus({
      bankAccountFeedId: fixture.feedId,
      companyId: fixture.companyId,
      status: 'available',
      onlyIfStatus: 'collecting',
      trx,
    });
  });
}

describe('history import expiry', () => {
  it('expires overdue available imports and is idempotent on a second run', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      await seedAvailableImport(db, fixture, [
        { id: 'hist-1', date: '2025-12-15', amount: -25 },
        { id: 'hist-2', date: '2025-11-01', amount: -10 },
      ]);
      await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .update({
          available_at: db.raw(`now() - interval '31 days'`),
          expires_at: db.raw(`now() - interval '1 minute'`),
        });

      const first = await expireDueHistoryImports();
      expect(first.expiredCount).toBe(1);
      expect(first.candidateRowsDeleted).toBe(2);

      const history = await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .first('status', 'transaction_count');
      expect(history).toMatchObject({
        status: 'expired',
        transaction_count: 0,
      });
      expect(
        await db('bank_transaction_history_candidates')
          .where({ bank_account_feed_id: fixture.feedId })
          .count<{ count: string }>('id as count')
          .first(),
      ).toMatchObject({ count: '0' });

      const second = await expireDueHistoryImports();
      expect(second).toEqual({ expiredCount: 0, candidateRowsDeleted: 0 });
    } finally {
      await db('bank_transaction_history_candidates')
        .where({ bank_account_feed_id: fixture.feedId })
        .delete();
      await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .delete();
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('clears leftover candidates for selected imports without changing status', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      await db('bank_account_feeds').where({ id: fixture.feedId }).update({
        sync_from_date: '2026-01-01',
        sync_from_timezone: 'Etc/UTC',
        state_version: 1,
      });
      await seedAvailableImport(db, fixture, [
        { id: 'hist-1', date: '2025-12-15', amount: -25 },
        { id: 'hist-2', date: '2025-11-01', amount: -10 },
      ]);

      const promoted = await promoteBankTransactionHistory({
        companyId: fixture.companyId,
        bankAccountId: fixture.bankAccountId,
        feedId: fixture.feedId,
        fromDate: '2025-12-01',
        userId: fixture.userId,
      });
      expect(promoted.success).toBe(true);
      expect(promoted.data?.promotedCount).toBe(1);

      const bankTxnCountBefore = await db('bank_transactions')
        .where({ bank_account_id: fixture.bankAccountId })
        .count<{ count: string }>('id as count')
        .first();

      await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .update({
          available_at: db.raw(`now() - interval '31 days'`),
          expires_at: db.raw(`now() - interval '1 minute'`),
        });

      const result = await expireDueHistoryImports();
      expect(result.expiredCount).toBe(1);
      expect(result.candidateRowsDeleted).toBe(1);

      const history = await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .first('status', 'selected_from_date', 'transaction_count');
      expect(history?.status).toBe('selected');
      expect(history?.transaction_count).toBe(0);

      const bankTxnCountAfter = await db('bank_transactions')
        .where({ bank_account_id: fixture.bankAccountId })
        .count<{ count: string }>('id as count')
        .first();
      expect(bankTxnCountAfter?.count).toBe(bankTxnCountBefore?.count);

      const second = await expireDueHistoryImports();
      expect(second).toEqual({ expiredCount: 0, candidateRowsDeleted: 0 });
    } finally {
      await db('bank_transaction_history_candidates')
        .where({ bank_account_feed_id: fixture.feedId })
        .delete();
      await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .delete();
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('sends the 7-day reminder once and stamps reminder_sent_at', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      await seedAvailableImport(db, fixture, [
        { id: 'hist-1', date: '2025-12-15', amount: -25 },
      ]);
      await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .update({
          expires_at: db.raw(`now() + interval '5 days'`),
        });

      const first = await sendDueHistoryImportReminders();
      expect(first).toBe(1);

      const row = await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .first('reminder_sent_at');
      expect(row?.reminder_sent_at).toBeInstanceOf(Date);

      const second = await sendDueHistoryImportReminders();
      expect(second).toBe(0);

      const sweep = await processHistoryImportExpirySweep();
      expect(sweep.remindedCount).toBe(0);
      expect(sweep.expiredCount).toBe(0);
    } finally {
      await db('bank_transaction_history_candidates')
        .where({ bank_account_feed_id: fixture.feedId })
        .delete();
      await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .delete();
      await cleanupSyncFailureFixture(db, fixture);
    }
  });

  it('expires empty available offers without an expired notification', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      await seedAvailableImport(db, fixture, []);
      await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .update({
          available_at: db.raw(`now() - interval '31 days'`),
          expires_at: db.raw(`now() - interval '1 minute'`),
        });

      const before = await db('app.outbox')
        .where({ intent_type: 'notification_requested' })
        .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
          'bank.history_import_expired',
        ])
        .andWhereRaw(`payload->'event'->>'attentionKey' = ?`, [
          `bank_account_feed:${fixture.feedId}:history_import`,
        ])
        .count<{ count: string }>('id as count')
        .first();

      const result = await expireDueHistoryImports();
      expect(result).toEqual({ expiredCount: 1, candidateRowsDeleted: 0 });

      const history = await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .first('status');
      expect(history?.status).toBe('expired');

      const after = await db('app.outbox')
        .where({ intent_type: 'notification_requested' })
        .andWhereRaw(`payload->'event'->>'eventType' = ?`, [
          'bank.history_import_expired',
        ])
        .andWhereRaw(`payload->'event'->>'attentionKey' = ?`, [
          `bank_account_feed:${fixture.feedId}:history_import`,
        ])
        .count<{ count: string }>('id as count')
        .first();
      expect(after?.count).toBe(before?.count);
    } finally {
      await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .delete();
      await cleanupSyncFailureFixture(db, fixture);
    }
  });
});
