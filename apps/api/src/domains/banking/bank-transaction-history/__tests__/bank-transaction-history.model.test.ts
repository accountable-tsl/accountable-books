import { describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import {
  cleanupSyncFailureFixture,
  createSyncFailureFixture,
} from '../../../../integrations/banking/services/__tests__/transaction-sync.test-helpers.js';
import {
  createHistoryImport,
  deleteHistoryCandidates,
  getHistoryImportForFeed,
  markHistoryImportStatus,
  refreshHistoryImportAggregates,
  upsertHistoryCandidates,
} from '../bank-transaction-history.model.js';

import type { NewBankTransactionHistoryCandidate } from '../bank-transaction-history.types.js';

function candidate(
  fixture: { feedId: string; companyId: string },
  providerTransactionId: string,
  overrides: Partial<NewBankTransactionHistoryCandidate> = {},
): NewBankTransactionHistoryCandidate {
  return {
    bank_account_feed_id: fixture.feedId,
    company_id: fixture.companyId,
    provider_transaction_id: providerTransactionId,
    transaction_date: new Date('2025-03-10'),
    transaction_at: new Date('2025-03-10T09:00:00Z'),
    amount: -120.5,
    description: 'Historical coffee',
    payee: 'Cafe',
    provider_evidence: { providerTransactionId },
    provider_evidence_schema_version: 1,
    observed_at: new Date(),
    ...overrides,
  };
}

describe('bank transaction history model', () => {
  it('collects candidates idempotently and keeps import aggregates in sync', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      await db.transaction(async (trx) => {
        await createHistoryImport({
          bankAccountFeedId: fixture.feedId,
          companyId: fixture.companyId,
          trx,
        });
        // Idempotent: a second create is a no-op, not an error.
        await createHistoryImport({
          bankAccountFeedId: fixture.feedId,
          companyId: fixture.companyId,
          trx,
        });

        await upsertHistoryCandidates({
          candidates: [
            candidate(fixture, 'hist-1', {
              transaction_date: new Date('2025-02-01'),
            }),
            candidate(fixture, 'hist-2', {
              transaction_date: new Date('2025-04-20'),
            }),
          ],
          trx,
        });
        // Re-observation of the same provider id updates in place (e.g. a
        // corrected amount), it never duplicates.
        await upsertHistoryCandidates({
          candidates: [
            candidate(fixture, 'hist-2', {
              transaction_date: new Date('2025-04-20'),
              amount: 999,
            }),
          ],
          trx,
        });
        await refreshHistoryImportAggregates({
          bankAccountFeedId: fixture.feedId,
          trx,
        });

        const rows = await trx('bank_transaction_history_candidates')
          .where({ bank_account_feed_id: fixture.feedId })
          .orderBy('provider_transaction_id')
          .select('provider_transaction_id', 'amount');
        expect(rows).toEqual([
          { provider_transaction_id: 'hist-1', amount: '-120.5000' },
          { provider_transaction_id: 'hist-2', amount: '999.0000' },
        ]);

        const importRow = await getHistoryImportForFeed({
          bankAccountFeedId: fixture.feedId,
          companyId: fixture.companyId,
          trx,
        });
        // pg parses date columns back as local-midnight Dates.
        expect(importRow).toMatchObject({
          status: 'collecting',
          transaction_count: 2,
          earliest_transaction_date: new Date(2025, 1, 1),
          latest_transaction_date: new Date(2025, 3, 20),
        });

        await deleteHistoryCandidates({
          bankAccountFeedId: fixture.feedId,
          providerTransactionIds: ['hist-1', 'hist-2'],
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
          trx,
        });

        expect(
          await getHistoryImportForFeed({
            bankAccountFeedId: fixture.feedId,
            companyId: fixture.companyId,
            trx,
          }),
        ).toMatchObject({
          status: 'available',
          transaction_count: 0,
          earliest_transaction_date: null,
          latest_transaction_date: null,
        });
      });
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });
});
