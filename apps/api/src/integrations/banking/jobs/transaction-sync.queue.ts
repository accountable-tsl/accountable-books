import type { Job, JobsOptions } from 'bullmq';
import { Queue } from 'bullmq';

import { isProd } from '../../../config/env.js';
import {
  executeQueueOperation,
  QueueName,
} from '../../../jobs/queues/queue-broker.js';
import { redis } from '../../../lib/redis.js';
import { withJobTelemetry } from '../../../shared/telemetry/request-context.js';

import type {
  BulkSyncJobData,
  TransactionSyncJobData,
} from './transaction-sync.worker.js';

export const transactionSyncQueue = new Queue('transaction-sync', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5, // More retries for transaction sync
    backoff: { type: 'exponential', delay: 30000 }, // Start at 30s backoff
    // Keep transaction sync jobs longer for debugging
    removeOnComplete: isProd ? { age: 86400, count: 1000 } : { count: 100 }, // Keep for 1 day
    removeOnFail: { age: 172800, count: 1000 }, // Keep failures for 2 days
  },
});

/**
 * Schedule a one-time transaction sync for a specific connection
 * Returns null if queues are disabled
 */
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
    transactionSyncQueue.add('sync-transactions', withJobTelemetry(data), {
      delay: options.delay,
      priority: options.priority || 0,
      // Override default attempts for manual syncs
      attempts: options.attempts ?? (data.syncType === 'manual' ? 3 : 5),
      backoff: options.backoff,
    }),
  );
  return job;
}

/**
 * Schedule bulk transaction sync for multiple connections
 * Returns null if queues are disabled
 */
export async function scheduleBulkTransactionSync(
  data: BulkSyncJobData,
  options: {
    delay?: number;
  } = {},
): Promise<Job<BulkSyncJobData> | null> {
  const job = await executeQueueOperation(QueueName.TRANSACTION_SYNC, () =>
    transactionSyncQueue.add('bulk-sync-transactions', withJobTelemetry(data), {
      delay: options.delay,
      priority: 1, // Higher priority for bulk syncs
    }),
  );
  return job;
}

/**
 * Schedule daily scan-and-enqueue job for all active credentials
 * Uses BullMQ Job Schedulers API for flexible, runtime-updatable scheduling
 */
export async function scheduleDailySyncScan(cronPattern = '0 2 * * *') {
  const schedulerId = 'daily-sync-scan';

  // Use modern Job Schedulers API (BullMQ v5.16.0+)
  // Calling upsertJobScheduler with same ID updates existing scheduler (atomic operation)
  await executeQueueOperation(QueueName.TRANSACTION_SYNC, () =>
    transactionSyncQueue.upsertJobScheduler(
      schedulerId,
      {
        pattern: cronPattern, // Cron expression (e.g., '0 2 * * *' for 2 AM UTC daily)
      },
      {
        name: 'daily-sync-scan',
        data: {
          syncType: 'periodic' as const,
        },
        opts: {
          priority: -1, // Lower priority for periodic syncs
          attempts: 3,
          backoff: { type: 'exponential', delay: 30000 },
        },
      },
    ),
  );
}

/**
 * Get queue statistics
 */
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

/**
 * Cleanup old completed and failed jobs (run periodically)
 */
export async function cleanupTransactionSyncQueue() {
  try {
    // Clean completed jobs older than 1 day
    const completedCleaned = await transactionSyncQueue.clean(
      24 * 60 * 60 * 1000,
      1000,
      'completed',
    );

    // Clean failed jobs older than 2 days
    const failedCleaned = await transactionSyncQueue.clean(
      48 * 60 * 60 * 1000,
      1000,
      'failed',
    );

    console.log(
      `Transaction sync queue cleanup: ${completedCleaned.length} completed, ${failedCleaned.length} failed jobs removed`,
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
