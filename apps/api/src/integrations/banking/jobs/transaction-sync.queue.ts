import { isProd } from '../../../config/env.js';
import { purgeProviderWebhookPayloads } from '../../../domains/banking/bank-provider-webhook-events/bank-provider-webhook-events.model.js';
import { processHistoryImportExpirySweep } from '../../../domains/banking/bank-transaction-history/history-expiry.service.js';
import { purgeOldSyncRuns } from '../../../domains/banking/bank-transaction-sync-runs/bank-transaction-sync-runs.model.js';
import { getSyncableBankAccounts } from '../../../domains/banking/bankAccounts/bankAccounts.model.js';
import {
  executeQueueOperation,
  QueueName,
} from '../../../jobs/queues/queue-broker.js';
import { createQueue } from '../../../jobs/queues/queue-factory.js';
import { logger } from '../../../shared/utils/logger.js';
import {
  BANK_ACCOUNT_SYNC_JOB_ATTEMPTS,
  BANK_ACCOUNT_SYNC_JOB_BACKOFF,
} from '../transaction-sync.constants.js';
import { requestBankAccountSync } from '../transaction-sync.outbox.js';

export type TransactionSyncSchedulerJobData =
  | { syncType: 'periodic' }
  | { kind: 'history-import-expiry' }
  | { kind: 'banking-retention' };

/**
 * BullMQ owns daily schedulers. Account sync execution is outbox-owned
 * (`BANK_SYNC_REQUESTED`); the scan writes/coalesces intents. History-import
 * expiry runs in-process against the DB.
 */
export const transactionSyncQueue =
  createQueue<TransactionSyncSchedulerJobData>('transaction-sync', {
    defaultJobOptions: {
      attempts: BANK_ACCOUNT_SYNC_JOB_ATTEMPTS,
      backoff: BANK_ACCOUNT_SYNC_JOB_BACKOFF,
      removeOnComplete: isProd ? { age: 86400, count: 1000 } : { count: 100 },
      removeOnFail: { age: 172800, count: 1000 },
    },
  });

export async function scheduleDailySyncScan(cronPattern = '0 2 * * *') {
  await executeQueueOperation(QueueName.TRANSACTION_SYNC, () =>
    transactionSyncQueue.upsertJobScheduler(
      'daily-sync-scan',
      { pattern: cronPattern },
      {
        name: 'daily-sync-scan',
        data: { syncType: 'periodic' as const },
        opts: {
          priority: -1,
          attempts: 3,
          backoff: { type: 'exponential', delay: 30000 },
        },
      },
    ),
  );
}

export async function scheduleHistoryImportExpiryScan(
  cronPattern = '15 2 * * *',
) {
  await executeQueueOperation(QueueName.TRANSACTION_SYNC, () =>
    transactionSyncQueue.upsertJobScheduler(
      'history-import-expiry',
      { pattern: cronPattern },
      {
        name: 'history-import-expiry',
        data: { kind: 'history-import-expiry' as const },
        opts: {
          priority: -1,
          attempts: 3,
          backoff: { type: 'exponential', delay: 30000 },
        },
      },
    ),
  );
}

export async function scheduleBankingRetentionScan(cronPattern = '30 2 * * *') {
  await executeQueueOperation(QueueName.TRANSACTION_SYNC, () =>
    transactionSyncQueue.upsertJobScheduler(
      'banking-retention',
      { pattern: cronPattern },
      {
        name: 'banking-retention',
        data: { kind: 'banking-retention' as const },
        opts: {
          priority: -1,
          attempts: 3,
          backoff: { type: 'exponential', delay: 30000 },
        },
      },
    ),
  );
}

/** Wake path: write one durable sync intent per syncable account. */
export async function enqueuePeriodicBankSyncIntents(): Promise<{
  accountCount: number;
  failedCount: number;
}> {
  const accounts = await getSyncableBankAccounts();
  const results = await Promise.allSettled(
    accounts.map((account) =>
      requestBankAccountSync({
        bankAccountId: account.id,
        trigger: 'periodic',
      }),
    ),
  );
  const failedCount = results.filter(
    (result) => result.status === 'rejected',
  ).length;
  logger.info(
    { accountCount: accounts.length, failedCount },
    'Periodic bank sync intents written',
  );
  return { accountCount: accounts.length, failedCount };
}

export async function runHistoryImportExpiryJob(): Promise<{
  expiredCount: number;
  remindedCount: number;
  candidateRowsDeleted: number;
}> {
  return processHistoryImportExpirySweep();
}

export async function runBankingRetentionJob(): Promise<{
  webhookPayloadsCleared: number;
  syncRunsDeleted: number;
}> {
  const [webhooks, syncRuns] = await Promise.all([
    purgeProviderWebhookPayloads(),
    purgeOldSyncRuns(),
  ]);
  logger.info(
    {
      webhookPayloadsCleared: webhooks.cleared,
      syncRunsDeleted: syncRuns.deleted,
    },
    'Banking retention purge completed',
  );
  return {
    webhookPayloadsCleared: webhooks.cleared,
    syncRunsDeleted: syncRuns.deleted,
  };
}

export async function getTransactionSyncQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    transactionSyncQueue.getWaiting(),
    transactionSyncQueue.getActive(),
    transactionSyncQueue.getCompleted(),
    transactionSyncQueue.getFailed(),
    transactionSyncQueue.getDelayed(),
  ]);
  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    delayed: delayed.length,
    total:
      waiting.length +
      active.length +
      completed.length +
      failed.length +
      delayed.length,
  };
}

export async function cleanupTransactionSyncQueue() {
  try {
    const completedCleaned = await transactionSyncQueue.clean(
      24 * 60 * 60 * 1000,
      1000,
      'completed',
    );
    const failedCleaned = await transactionSyncQueue.clean(
      48 * 60 * 60 * 1000,
      1000,
      'failed',
    );
    return {
      completedCleaned: completedCleaned.length,
      failedCleaned: failedCleaned.length,
    };
  } catch (error) {
    console.error('Failed to cleanup transaction sync queue:', error);
    return { completedCleaned: 0, failedCleaned: 0 };
  }
}
