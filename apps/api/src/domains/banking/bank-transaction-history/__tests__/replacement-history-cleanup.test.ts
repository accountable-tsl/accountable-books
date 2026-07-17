import { describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import {
  cleanupSyncFailureFixture,
  createSyncFailureFixture,
} from '../../../../integrations/banking/services/__tests__/transaction-sync.test-helpers.js';
import {
  createHistoryImport,
  deleteAllHistoryCandidates,
  markHistoryImportStatus,
  refreshHistoryImportAggregates,
  upsertHistoryCandidates,
} from '../bank-transaction-history.model.js';

describe('replacement history cleanup', () => {
  it('clears old-feed candidates and marks the import unavailable', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      await db.transaction(async (trx) => {
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
              transaction_date: new Date('2025-01-01'),
              transaction_at: new Date('2025-01-01'),
              amount: 10,
              description: 'old',
              payee: null,
              provider_evidence: {},
              provider_evidence_schema_version: 1,
              observed_at: new Date(),
            },
          ],
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

      await db.transaction(async (trx) => {
        await deleteAllHistoryCandidates({
          bankAccountFeedId: fixture.feedId,
          trx,
        });
        await refreshHistoryImportAggregates({
          bankAccountFeedId: fixture.feedId,
          trx,
        });
        await markHistoryImportStatus({
          bankAccountFeedId: fixture.feedId,
          companyId: fixture.companyId,
          status: 'unavailable',
          trx,
        });
      });

      const candidates = await db('bank_transaction_history_candidates')
        .where({ bank_account_feed_id: fixture.feedId })
        .count<{ count: string }>('id as count')
        .first();
      expect(candidates?.count).toBe('0');

      const historyImport = await db('bank_transaction_history_imports')
        .where({ bank_account_feed_id: fixture.feedId })
        .first('status');
      expect(historyImport?.status).toBe('unavailable');
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });
});
