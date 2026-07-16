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
import { promoteBankTransactionHistory } from '../history-promotion.service.js';

describe('history promotion service', () => {
  it('promotes candidates from an earlier date and moves the feed boundary', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      await db('bank_account_feeds').where({ id: fixture.feedId }).update({
        sync_from_date: '2026-01-01',
        sync_from_timezone: 'Etc/UTC',
        state_version: 1,
      });

      await db.transaction(async (trx: Knex.Transaction) => {
        await createHistoryImport({
          bankAccountFeedId: fixture.feedId,
          companyId: fixture.companyId,
          trx,
        });
        await upsertHistoryCandidates({
          candidates: [
            {
              bank_account_feed_id: fixture.feedId,
              company_id: fixture.companyId,
              provider_transaction_id: 'hist-1',
              transaction_date: new Date('2025-12-15'),
              transaction_at: new Date('2025-12-15T10:00:00Z'),
              amount: -25,
              description: 'Older txn',
              payee: 'Vendor',
              provider_evidence: { id: 'hist-1' },
              provider_evidence_schema_version: 1,
              observed_at: new Date(),
            },
            {
              bank_account_feed_id: fixture.feedId,
              company_id: fixture.companyId,
              provider_transaction_id: 'hist-2',
              transaction_date: new Date('2025-11-01'),
              transaction_at: new Date('2025-11-01T10:00:00Z'),
              amount: -10,
              description: 'Too old',
              payee: 'Vendor',
              provider_evidence: { id: 'hist-2' },
              provider_evidence_schema_version: 1,
              observed_at: new Date(),
            },
          ],
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

      const result = await promoteBankTransactionHistory({
        companyId: fixture.companyId,
        bankAccountId: fixture.bankAccountId,
        feedId: fixture.feedId,
        fromDate: '2025-12-01',
        userId: fixture.userId,
      });

      expect(result.success).toBe(true);
      expect(result.data?.promotedCount).toBe(1);

      const feed = await db('bank_account_feeds')
        .where({ id: fixture.feedId })
        .first('sync_from_date', 'state_version');
      const syncFromYmd =
        feed?.sync_from_date instanceof Date
          ? feed.sync_from_date.toISOString().slice(0, 10)
          : String(feed?.sync_from_date).slice(0, 10);
      expect(syncFromYmd).toBe('2025-12-01');
      expect(feed?.state_version).toBe(2);

      const remaining = await db('bank_transaction_history_candidates')
        .where({ bank_account_feed_id: fixture.feedId })
        .select('provider_transaction_id');
      expect(remaining).toEqual([
        expect.objectContaining({ provider_transaction_id: 'hist-2' }),
      ]);

      const history = await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .first('status', 'selected_from_date');
      expect(history?.status).toBe('selected');
      const selectedYmd =
        history?.selected_from_date instanceof Date
          ? history.selected_from_date.toISOString().slice(0, 10)
          : String(history?.selected_from_date).slice(0, 10);
      expect(selectedYmd).toBe('2025-12-01');

      // Earlier-only: cannot promote forward past the new boundary.
      const rejected = await promoteBankTransactionHistory({
        companyId: fixture.companyId,
        bankAccountId: fixture.bankAccountId,
        feedId: fixture.feedId,
        fromDate: '2025-12-15',
        userId: fixture.userId,
      });
      expect(rejected.success).toBe(false);
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
});
