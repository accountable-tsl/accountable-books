import { Queue } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { NODE_ENV, isProd } from '../../config/env.js';
import type {
  TransactionSyncJobData,
  BulkSyncJobData,
} from '../workers/transaction-sync.worker.js';

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
 */
export async function scheduleTransactionSync(
  data: TransactionSyncJobData,
  options: {
    delay?: number;
    priority?: number;
  } = {},
) {
  return await transactionSyncQueue.add('sync-transactions', data, {
    delay: options.delay,
    priority: options.priority || 0,
    // Override default attempts for manual syncs
    attempts: data.syncType === 'manual' ? 3 : 5,
  });
}

/**
 * Schedule bulk transaction sync for multiple connections
 */
export async function scheduleBulkTransactionSync(
  data: BulkSyncJobData,
  options: {
    delay?: number;
  } = {},
) {
  return await transactionSyncQueue.add('bulk-sync-transactions', data, {
    delay: options.delay,
    priority: 1, // Higher priority for bulk syncs
  });
}

/**
 * Schedule periodic sync for a connection (every 4 hours)
 */
export async function schedulePeriodicSync(
  connectionId: string,
  companyId: string,
  userId: string,
) {
  const jobId = `periodic-sync-${connectionId}`;

  return await transactionSyncQueue.add(
    'periodic-sync',
    {
      connectionId,
      companyId,
      userId,
      syncType: 'periodic' as const,
    },
    {
      jobId, // Prevent duplicate periodic sync jobs
      repeat: {
        every: 4 * 60 * 60 * 1000, // 4 hours in milliseconds
      },
      // Lower priority for periodic syncs
      priority: -1,
    },
  );
}

/**
 * Cancel periodic sync for a connection (when connection is disabled/deleted)
 */
export async function cancelPeriodicSync(connectionId: string) {
  const jobId = `periodic-sync-${connectionId}`;

  try {
    // Remove the repeatable job
    const repeatableJobs = await transactionSyncQueue.getRepeatableJobs();
    const job = repeatableJobs.find((job) => job.id === jobId);

    if (job) {
      await transactionSyncQueue.removeRepeatableByKey(job.key);
      console.log(`Cancelled periodic sync for connection: ${connectionId}`);
    }
  } catch (error) {
    console.error(`Failed to cancel periodic sync for connection ${connectionId}:`, error);
  }
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
    total: waiting.length + active.length + completed.length + failed.length + delayed.length,
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
    const failedCleaned = await transactionSyncQueue.clean(48 * 60 * 60 * 1000, 1000, 'failed');

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
