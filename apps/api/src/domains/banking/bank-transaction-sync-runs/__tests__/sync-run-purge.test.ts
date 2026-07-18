import { describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import {
  cleanupSyncFailureFixture,
  createSyncFailureFixture,
} from '../../../../integrations/banking/services/__tests__/transaction-sync.test-helpers.js';
import {
  purgeOldSyncRuns,
  SYNC_RUN_RETENTION_DAYS,
} from '../bank-transaction-sync-runs.model.js';

describe('purgeOldSyncRuns', () => {
  it('deletes terminal runs past retention and keeps running/recent runs', async () => {
    const db = getTestDb();
    const fixture = await createSyncFailureFixture(db);

    try {
      const [oldSucceeded] = await db('bank_transaction_sync_runs')
        .insert({
          bank_account_feed_id: fixture.feedId,
          company_id: fixture.companyId,
          trigger: 'manual',
          sync_mode: 'incremental',
          outcome: 'succeeded',
          observed_state_version: 1,
          started_at: db.raw(
            `now() - (interval '1 day' * ?)`,
            [SYNC_RUN_RETENTION_DAYS + 2],
          ),
          completed_at: db.raw(
            `now() - (interval '1 day' * ?)`,
            [SYNC_RUN_RETENTION_DAYS + 1],
          ),
          diagnostic_summary: 'old success',
        })
        .returning('id');

      const [recentFailed] = await db('bank_transaction_sync_runs')
        .insert({
          bank_account_feed_id: fixture.feedId,
          company_id: fixture.companyId,
          trigger: 'manual',
          sync_mode: 'incremental',
          outcome: 'failed',
          observed_state_version: 1,
          started_at: db.raw(`now() - interval '2 days'`),
          completed_at: db.raw(`now() - interval '1 day'`),
          diagnostic_summary: 'recent failure',
        })
        .returning('id');

      const [running] = await db('bank_transaction_sync_runs')
        .insert({
          bank_account_feed_id: fixture.feedId,
          company_id: fixture.companyId,
          trigger: 'manual',
          sync_mode: 'incremental',
          outcome: 'running',
          observed_state_version: 1,
          started_at: db.raw(
            `now() - (interval '1 day' * ?)`,
            [SYNC_RUN_RETENTION_DAYS + 5],
          ),
          completed_at: null,
        })
        .returning('id');

      const result = await purgeOldSyncRuns();
      expect(result.deleted).toBeGreaterThanOrEqual(1);

      const oldGone = await db('bank_transaction_sync_runs')
        .where({ id: oldSucceeded.id })
        .first('id');
      expect(oldGone).toBeUndefined();

      const recentStill = await db('bank_transaction_sync_runs')
        .where({ id: recentFailed.id })
        .first('id');
      expect(recentStill?.id).toBe(recentFailed.id);

      const runningStill = await db('bank_transaction_sync_runs')
        .where({ id: running.id })
        .first('id');
      expect(runningStill?.id).toBe(running.id);
    } finally {
      await cleanupSyncFailureFixture(db, fixture);
    }
  });
});
