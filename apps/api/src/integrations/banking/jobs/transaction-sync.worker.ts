import type { Job } from 'bullmq';
import { JobScheduler, Worker } from 'bullmq';

import { getSyncableBankAccounts } from '../../../domains/banking/bankAccounts/bankAccounts.model.js';
import { redis } from '../../../lib/redis.js';
import { runWithJobContext } from '../../../shared/telemetry/request-context.js';
import { getLogger } from '../../../shared/utils/logger.js';
import {
  isRetryableTransactionSyncFailure,
  transactionSyncService,
} from '../services/transaction-sync.service.js';
import { scheduleTransactionSync } from './transaction-sync.queue.js';

import type { TransactionSyncJobData } from './transaction-sync.queue.js';

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
  job: Job<TransactionSyncJobData | { syncType: 'periodic' }>,
) {
  const startedAt = Date.now();
  logger.info(
    { jobId: job.id, jobName: job.name, jobData: job.data },
    'Starting transaction sync job',
  );

  try {
    if (job.name === 'sync-bank-account') {
      const data = job.data as TransactionSyncJobData;
      await job.updateProgress(25);
      const result = await transactionSyncService.syncBankAccount(data);
      await job.updateProgress(100);
      logger.info(
        { jobId: job.id, ...result },
        'Bank account transaction sync completed',
      );
    } else if (job.name === 'daily-sync-scan') {
      await dailySyncScan(job);
    } else {
      throw new Error(`Unknown transaction sync job: ${job.name}`);
    }
  } catch (error) {
    if (!isRetryableTransactionSyncFailure(error)) {
      job.discard();
    }
    logger.error(
      {
        jobId: job.id,
        jobName: job.name,
        error: error instanceof Error ? error.message : error,
        duration: Date.now() - startedAt,
      },
      'Transaction sync job failed',
    );
    throw error;
  }
}

async function dailySyncScan(job: Job) {
  await job.updateProgress(10);
  const accounts = await getSyncableBankAccounts();
  await job.updateProgress(30);

  const results = await Promise.allSettled(
    accounts.map((account) =>
      scheduleTransactionSync({
        bankAccountId: account.id,
        trigger: 'periodic',
      }),
    ),
  );
  await job.updateProgress(100);

  const failed = results.filter((result) => result.status === 'rejected');
  logger.info(
    { accountCount: accounts.length, failedCount: failed.length },
    'Daily bank account sync scan completed',
  );
  if (failed.length > 0) {
    throw new Error(
      `Failed to enqueue ${failed.length} bank account sync jobs`,
    );
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
