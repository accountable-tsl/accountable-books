import type { Job } from 'bullmq';
import { JobScheduler, Worker } from 'bullmq';

import { redis } from '../../../lib/redis.js';
import { runWithJobContext } from '../../../shared/telemetry/request-context.js';
import { getLogger } from '../../../shared/utils/logger.js';
import {
  enqueuePeriodicBankSyncIntents,
  runHistoryImportExpiryJob,
} from './transaction-sync.queue.js';

import type { TransactionSyncSchedulerJobData } from './transaction-sync.queue.js';

const logger = getLogger({
  component: 'transaction-sync-worker',
  processSource: 'worker',
});

let transactionSyncScheduler: JobScheduler | null = null;

function buildTransactionSyncWorkerOptions(concurrency: number) {
  return {
    connection: redis,
    concurrency,
    drainDelay: 600,
    stalledInterval: 600000,
    maxStalledCount: 2,
    lockDuration: 120000,
    lockRenewTime: 60000,
  } as const;
}

async function processTransactionSyncJob(
  job: Job<TransactionSyncSchedulerJobData>,
) {
  const startedAt = Date.now();
  logger.info(
    { jobId: job.id, jobName: job.name, jobData: job.data },
    'Starting transaction sync scheduler job',
  );

  try {
    if (job.name === 'daily-sync-scan') {
      await job.updateProgress(10);
      const result = await enqueuePeriodicBankSyncIntents();
      await job.updateProgress(100);
      logger.info(
        { jobId: job.id, ...result },
        'Daily bank sync scan completed',
      );
      if (result.failedCount > 0) {
        throw new Error(
          `Failed to write ${result.failedCount} bank account sync intents`,
        );
      }
      return;
    }

    if (job.name === 'history-import-expiry') {
      await job.updateProgress(10);
      const result = await runHistoryImportExpiryJob();
      await job.updateProgress(100);
      logger.info(
        { jobId: job.id, ...result },
        'History import expiry sweep completed',
      );
      return;
    }

    throw new Error(`Unknown transaction sync job: ${job.name}`);
  } catch (error) {
    logger.error(
      {
        jobId: job.id,
        jobName: job.name,
        error: error instanceof Error ? error.message : error,
        duration: Date.now() - startedAt,
      },
      'Transaction sync scheduler job failed',
    );
    throw error;
  }
}

export function startTransactionSyncWorker(concurrency = 3) {
  if (!transactionSyncScheduler) {
    transactionSyncScheduler = new JobScheduler('transaction-sync', {
      connection: redis,
    });
    transactionSyncScheduler
      .waitUntilReady()
      .then(() => logger.info('Transaction sync scheduler ready'))
      .catch((error) =>
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to initialise transaction sync scheduler',
        ),
      );
  }

  const worker = new Worker(
    'transaction-sync',
    (job) => runWithJobContext(job, () => processTransactionSyncJob(job)),
    buildTransactionSyncWorkerOptions(concurrency),
  );
  worker.on('completed', (job) =>
    logger.info(
      { jobId: job.id, jobName: job.name },
      'Transaction sync job completed',
    ),
  );
  worker.on('failed', (job, error) =>
    logger.error(
      { jobId: job?.id, jobName: job?.name, error: error.message },
      'Transaction sync job failed',
    ),
  );
  worker.on('error', (error) =>
    logger.error({ error: error.message }, 'Transaction sync worker error'),
  );
  return worker;
}

export async function closeTransactionSyncScheduler(): Promise<void> {
  if (!transactionSyncScheduler) return;
  await transactionSyncScheduler.close();
  transactionSyncScheduler = null;
}

let transactionSyncWorkerInstance: Worker | null = null;

export function getTransactionSyncWorker() {
  return transactionSyncWorkerInstance;
}

export function getTransactionSyncWorkerMetrics() {
  if (!transactionSyncWorkerInstance) return null;
  return {
    isRunning: transactionSyncWorkerInstance.isRunning(),
    isPaused: transactionSyncWorkerInstance.isPaused(),
    concurrency: transactionSyncWorkerInstance.concurrency,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  transactionSyncWorkerInstance = startTransactionSyncWorker();
}
