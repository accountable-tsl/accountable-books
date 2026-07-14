import type { Job, JobsOptions } from 'bullmq';

import { isProd } from '../../../config/env.js';
import { getSyncableBankAccounts } from '../../../domains/banking/bankAccounts/bankAccounts.model.js';
import {
  executeQueueOperation,
  QueueName,
} from '../../../jobs/queues/queue-broker.js';
import { createQueue } from '../../../jobs/queues/queue-factory.js';
import { withJobTelemetry } from '../../../shared/telemetry/request-context.js';
import { logger } from '../../../shared/utils/logger.js';
import {
  BANK_ACCOUNT_SYNC_JOB_ATTEMPTS,
  BANK_ACCOUNT_SYNC_JOB_BACKOFF,
} from '../transaction-sync.constants.js';

import type { TransactionSyncTrigger } from '../services/transaction-sync.service.js';

export interface TransactionSyncJobData {
  bankAccountId: string;
  trigger: TransactionSyncTrigger;
  actorUserId?: string;
}

type TransactionSyncQueueData =
  | TransactionSyncJobData
  | { syncType: 'periodic' };

export const transactionSyncQueue = createQueue<TransactionSyncQueueData>(
  'transaction-sync',
  {
    defaultJobOptions: {
      // Eight exponential attempts starting at 30 seconds extend beyond the
      // account lock's 30-minute TTL, preserving a trailing webhook sync.
      attempts: BANK_ACCOUNT_SYNC_JOB_ATTEMPTS,
      backoff: BANK_ACCOUNT_SYNC_JOB_BACKOFF,
      removeOnComplete: isProd ? { age: 86400, count: 1000 } : { count: 100 },
      removeOnFail: { age: 172800, count: 1000 },
    },
  },
);

export async function scheduleTransactionSync(
  data: TransactionSyncJobData,
  options: {
    delay?: number;
    priority?: number;
    attempts?: number;
    backoff?: JobsOptions['backoff'];
  } = {},
): Promise<Job<TransactionSyncJobData> | null> {
  const job = await executeQueueOperation(QueueName.TRANSACTION_SYNC, () =>
    transactionSyncQueue.add('sync-bank-account', withJobTelemetry(data), {
      delay: options.delay,
      priority: options.priority ?? 0,
      ...(options.attempts === undefined ? {} : { attempts: options.attempts }),
      ...(options.backoff === undefined ? {} : { backoff: options.backoff }),
    }),
  );
  return job as Job<TransactionSyncJobData> | null;
}

/** Fan an Item-level event out into one independent job per eligible account. */
export async function scheduleSyncForCredential({
  credentialId,
  trigger,
  actorUserId,
  delay,
}: {
  credentialId: string;
  trigger: TransactionSyncTrigger;
  actorUserId?: string;
  delay?: number;
}): Promise<Array<Job<TransactionSyncJobData> | null>> {
  const accounts = await getSyncableBankAccounts({ credentialId });
  const jobs = await Promise.all(
    accounts.map((account) =>
      scheduleTransactionSync(
        {
          bankAccountId: account.id,
          trigger,
          ...(actorUserId ? { actorUserId } : {}),
        },
        { delay },
      ),
    ),
  );
  logger.info(
    {
      credentialId,
      trigger,
      accountCount: accounts.length,
      queuedJobCount: jobs.filter(Boolean).length,
      delay: delay ?? 0,
    },
    'Credential transaction sync fanned out to account jobs',
  );
  return jobs;
}

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
