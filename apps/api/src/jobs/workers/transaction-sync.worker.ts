import { Worker, JobScheduler } from 'bullmq';
import { redis } from '../../lib/redis.js';
import type { Job } from 'bullmq';
import pino from 'pino';
import { transactionSyncService } from '../../integrations/banking/services/transactionSync.service.js';
import { getAllActiveCredentials } from '../../domains/banking/bankAccountCredentials/bankAccountCredentials.model.js';
import {
  scheduleTransactionSync,
  scheduleDailySyncScan,
} from '../queues/transaction-sync.queue.js';
import { ENV } from '../../config/env.js';

const logger = pino();

// Shared scheduler instance to drive repeatable jobs (cron-based daily scans)
let transactionSyncScheduler: JobScheduler | null = null;

// Transaction sync job data interfaces
export interface TransactionSyncJobData {
  credentialId: string; // Changed from connectionId to credentialId
  startDate?: string;
  endDate?: string;
  syncType: 'initial' | 'periodic' | 'manual' | 'webhook';
  companyId: string;
  userId: string;
}

export interface BulkSyncJobData {
  credentialIds: string[]; // Changed from connectionIds to credentialIds
  companyId: string;
  syncType: 'periodic' | 'manual';
}

// Optimized worker settings for transaction sync
// Even more conservative than email worker since transactions sync less frequently
function buildTransactionSyncWorkerOptions(concurrency: number) {
  return {
    connection: redis,
    concurrency, // Configurable per environment
    // Very conservative settings for transaction sync
    drainDelay: 600, // Wait 10 minutes when queue is empty
    stalledInterval: 600000, // Check stalled jobs every 10 minutes
    maxStalledCount: 2, // Allow 2 retries for stalled jobs
    lockDuration: 120000, // 2 minute job lock (transactions can take time)
    lockRenewTime: 60000, // Renew lock every minute
  } as const;
}

// Transaction sync job processor
async function processTransactionSyncJob(
  job: Job<TransactionSyncJobData | BulkSyncJobData>,
) {
  const startTime = Date.now();

  logger.info(
    {
      jobId: job.id,
      jobName: job.name,
      jobData: job.data,
    },
    'Starting transaction sync job',
  );

  try {
    switch (job.name) {
      case 'sync-transactions': {
        const data = job.data as TransactionSyncJobData;
        await syncSingleConnection(job as Job<TransactionSyncJobData>, data);
        break;
      }

      case 'bulk-sync-transactions': {
        const data = job.data as BulkSyncJobData;
        await syncBulkConnections(job as Job<BulkSyncJobData>, data);
        break;
      }

      case 'daily-sync-scan': {
        await dailySyncScan(job);
        break;
      }

      default:
        throw new Error(`Unknown transaction sync job: ${job.name}`);
    }

    const duration = Date.now() - startTime;
    logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        duration,
      },
      'Transaction sync job completed',
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      {
        jobId: job.id,
        jobName: job.name,
        error: error instanceof Error ? error.message : error,
        duration,
      },
      'Transaction sync job failed',
    );

    throw error;
  }
}

// Individual connection sync
async function syncSingleConnection(
  job: Job<TransactionSyncJobData>,
  data: TransactionSyncJobData,
) {
  logger.info(
    {
      credentialId: data.credentialId,
      syncType: data.syncType,
    },
    'Syncing transactions for credential',
  );

  // Update job progress
  await job.updateProgress(25);

  try {
    // Use our new transaction sync service
    await transactionSyncService.syncTransactionsForCredential(
      data.credentialId,
    );

    await job.updateProgress(100);

    logger.info(
      { credentialId: data.credentialId },
      'Single credential transaction sync completed',
    );
  } catch (error) {
    logger.error(
      {
        credentialId: data.credentialId,
        error: error instanceof Error ? error.message : error,
      },
      'Transaction sync failed for credential',
    );
    throw error;
  }
}

// Bulk connections sync
async function syncBulkConnections(
  job: Job<BulkSyncJobData>,
  data: BulkSyncJobData,
) {
  logger.info(
    {
      credentialCount: data.credentialIds.length,
      syncType: data.syncType,
    },
    'Starting bulk transaction sync',
  );

  const totalCredentials = data.credentialIds.length;
  const errors: string[] = [];

  for (let i = 0; i < data.credentialIds.length; i++) {
    const credentialId = data.credentialIds[i];
    const progress = Math.round(((i + 1) / totalCredentials) * 100);

    logger.info(
      {
        credentialId,
        progress: `${i + 1}/${totalCredentials}`,
      },
      'Syncing credential in bulk job',
    );

    try {
      await transactionSyncService.syncTransactionsForCredential(credentialId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`${credentialId}: ${errorMsg}`);
      logger.error(
        {
          credentialId,
          error: errorMsg,
        },
        'Bulk sync failed for credential',
      );
    }

    await job.updateProgress(progress);

    // Small delay between credentials to avoid overwhelming APIs
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  logger.info(
    {
      credentialCount: totalCredentials,
      companyId: data.companyId,
      errorCount: errors.length,
    },
    'Bulk transaction sync completed',
  );

  if (errors.length > 0) {
    throw new Error(
      `Bulk sync completed with ${errors.length} errors: ${errors.join('; ')}`,
    );
  }
}

// Daily scan: find all active credentials and enqueue sync jobs for each
async function dailySyncScan(job: Job) {
  logger.info('Running daily sync scan for all active credentials');

  await job.updateProgress(10);

  try {
    // Get all active credentials
    const credentials = await getAllActiveCredentials();

    logger.info(
      { credentialCount: credentials.length },
      'Found active credentials for daily sync',
    );

    await job.updateProgress(30);

    // Enqueue sync job for each credential
    const enqueuePromises = credentials.map(async (credential, index) => {
      try {
        await scheduleTransactionSync({
          credentialId: credential.id,
          companyId: credential.company_id,
          userId: 'system', // System-initiated
          syncType: 'periodic',
        });

        // Update progress as we go
        const progress = 30 + Math.round((index / credentials.length) * 60);
        await job.updateProgress(progress);

        return { credentialId: credential.id, success: true };
      } catch (error) {
        logger.error(
          {
            credentialId: credential.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to enqueue sync for credential',
        );
        return { credentialId: credential.id, success: false, error };
      }
    });

    const results = await Promise.all(enqueuePromises);
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    await job.updateProgress(100);

    logger.info(
      {
        totalCredentials: credentials.length,
        successful,
        failed,
      },
      'Daily sync scan completed',
    );

    if (failed > 0) {
      logger.warn(
        {
          totalCredentials: credentials.length,
          successful,
          failed,
          failedCredentials: results
            .filter((r) => !r.success)
            .map((r) => r.credentialId),
        },
        'Daily sync scan completed with some failures - continuing with successful credentials',
      );
      // Don't throw - let successful credentials proceed
      // Failed credentials will be retried on the next daily scan
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Daily sync scan failed',
    );
    throw error;
  }
}

// Worker startup function
export function startTransactionSyncWorker(concurrency = 3) {
  // Start the BullMQ scheduler to handle repeatable jobs
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
    processTransactionSyncJob,
    buildTransactionSyncWorkerOptions(concurrency),
  );

  // Event handlers
  worker.on('completed', (job) => {
    logger.info(
      {
        jobId: job.id,
        jobName: job.name,
      },
      'Transaction sync job completed successfully',
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        jobName: job?.name,
        error: err.message,
      },
      'Transaction sync job failed',
    );
  });

  worker.on('progress', (job, progress) => {
    logger.debug(
      {
        jobId: job.id,
        jobName: job.name,
        progress,
      },
      'Transaction sync job progress update',
    );
  });

  worker.on('ready', async () => {
    logger.info('Transaction sync worker ready with optimized Redis settings');

    // Schedule the daily scan job on worker startup using environment-configured cron pattern
    try {
      const cronPattern = ENV.TRANSACTION_SYNC_CRON || '0 2 * * *';
      await scheduleDailySyncScan(cronPattern);
      logger.info(
        { cronPattern },
        'Daily sync scan job scheduled with cron pattern',
      );
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to schedule daily sync scan job',
      );
    }
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Transaction sync worker error');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Transaction sync job stalled - will be retried');
  });

  // Graceful shutdown handling
  const gracefulShutdown = async () => {
    logger.info('Shutting down transaction sync worker...');
    await worker.close();
    if (transactionSyncScheduler) {
      logger.info('Shutting down transaction sync scheduler...');
      await transactionSyncScheduler.close();
      transactionSyncScheduler = null;
    }
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  return worker;
}

// Export worker instance for metrics
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

// Only start worker if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  logger.info('Starting transaction sync worker directly...');
  transactionSyncWorkerInstance = startTransactionSyncWorker();
}
