import { Worker } from 'bullmq';
import { redis } from '../../lib/redis.js';
import type { Job } from 'bullmq';
import pino from 'pino';

const logger = pino();

// Transaction sync job data interfaces
export interface TransactionSyncJobData {
  connectionId: string;
  startDate?: string;
  endDate?: string;
  syncType: 'initial' | 'periodic' | 'manual';
  companyId: string;
  userId: string;
}

export interface BulkSyncJobData {
  connectionIds: string[];
  companyId: string;
  syncType: 'periodic' | 'manual';
}

// Optimized worker settings for transaction sync
// Even more conservative than email worker since transactions sync less frequently
const TRANSACTION_SYNC_WORKER_OPTIONS = {
  connection: redis,
  concurrency: 3, // Process 3 connections simultaneously
  // Very conservative settings for transaction sync
  drainDelay: 600, // Wait 10 minutes when queue is empty
  stalledInterval: 600000, // Check stalled jobs every 10 minutes
  maxStalledCount: 2, // Allow 2 retries for stalled jobs
  lockDuration: 120000, // 2 minute job lock (transactions can take time)
  lockRenewTime: 60000, // Renew lock every minute
};

// Transaction sync job processor
async function processTransactionSyncJob(job: Job<TransactionSyncJobData | BulkSyncJobData>) {
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
        await syncSingleConnection(job, data);
        break;
      }

      case 'bulk-sync-transactions': {
        const data = job.data as BulkSyncJobData;
        await syncBulkConnections(job, data);
        break;
      }

      case 'periodic-sync': {
        const data = job.data as TransactionSyncJobData;
        await periodicSync(job, data);
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
      connectionId: data.connectionId,
      syncType: data.syncType,
    },
    'Syncing transactions for single connection',
  );

  // Update job progress
  await job.updateProgress(25);

  // TODO: Implement actual transaction sync logic
  // This would integrate with your banking providers (Plaid, Mono)
  /*
  const connection = await getBankConnection(data.connectionId);
  if (!connection) {
    throw new Error(`Bank connection not found: ${data.connectionId}`);
  }

  const provider = getProviderForConnection(connection);
  const transactions = await provider.getTransactions({
    connectionId: data.connectionId,
    startDate: data.startDate,
    endDate: data.endDate,
  });

  await job.updateProgress(75);

  await saveTransactions(transactions, data.companyId);
  await updateLastSyncTime(data.connectionId);
  */

  await job.updateProgress(100);

  // Simulate processing time (remove in production)
  await new Promise((resolve) => setTimeout(resolve, 1000));

  logger.info({ connectionId: data.connectionId }, 'Single connection sync completed');
}

// Bulk connections sync
async function syncBulkConnections(job: Job<BulkSyncJobData>, data: BulkSyncJobData) {
  logger.info(
    {
      connectionCount: data.connectionIds.length,
      syncType: data.syncType,
    },
    'Starting bulk transaction sync',
  );

  const totalConnections = data.connectionIds.length;

  for (let i = 0; i < data.connectionIds.length; i++) {
    const connectionId = data.connectionIds[i];
    const progress = Math.round(((i + 1) / totalConnections) * 100);

    logger.info(
      {
        connectionId,
        progress: `${i + 1}/${totalConnections}`,
      },
      'Syncing connection in bulk job',
    );

    // TODO: Sync individual connection
    // await syncSingleConnectionInternal(connectionId, data.companyId);

    await job.updateProgress(progress);

    // Small delay between connections to avoid overwhelming APIs
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  logger.info(
    {
      connectionCount: totalConnections,
      companyId: data.companyId,
    },
    'Bulk transaction sync completed',
  );
}

// Periodic sync for all connections
async function periodicSync(job: Job<TransactionSyncJobData>, data: TransactionSyncJobData) {
  logger.info(
    {
      companyId: data.companyId,
    },
    'Running periodic transaction sync',
  );

  // TODO: Get all active connections for the company
  // const connections = await getActiveConnectionsForCompany(data.companyId);

  await job.updateProgress(50);

  // TODO: Queue individual sync jobs for each connection
  // This distributes the load and allows for better error handling

  await job.updateProgress(100);

  logger.info(
    {
      companyId: data.companyId,
    },
    'Periodic sync queuing completed',
  );
}

// Worker startup function
export function startTransactionSyncWorker() {
  const worker = new Worker(
    'transaction-sync',
    processTransactionSyncJob,
    TRANSACTION_SYNC_WORKER_OPTIONS,
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

  worker.on('ready', () => {
    logger.info('Transaction sync worker ready with optimized Redis settings');
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
