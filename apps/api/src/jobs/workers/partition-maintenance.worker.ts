import type { Job } from 'bullmq';
import { Worker } from 'bullmq';

import { redis } from '../../lib/redis.js';
import {
  drainDefaultPartition,
  ensureYearPartition,
  runPartitionMaintenance,
} from '../../shared/services/partitionManagement.service.js';
import { runWithJobContext } from '../../shared/telemetry/request-context.js';
import { getLogger } from '../../shared/utils/logger.js';
import { type PartitionMaintenanceJobData } from '../queues/partition-maintenance.queue.js';

/**
 * Partition Maintenance Worker
 *
 * Processes partition maintenance jobs to ensure database partitions
 * are created and maintained automatically. This worker prevents
 * the DDL-within-transaction errors that occur when partitions
 * don't exist during data insertion.
 */

const logger = getLogger({
  component: 'partition-maintenance-worker',
  processSource: 'worker',
});

async function processPartitionMaintenanceJob(
  job: Job<PartitionMaintenanceJobData>,
) {
  const { type, tableName, year, options } = job.data;

  logger.info(
    { type, tableName, year, options, jobId: job.id },
    'Processing partition maintenance job',
  );

  try {
    switch (type) {
      case 'smart_maintenance':
        await runPartitionMaintenance(options);
        logger.info('Smart partition maintenance completed');
        break;

      case 'drain_defaults':
        await drainDefaultPartition('bank_transactions');
        await drainDefaultPartition('ledger_entries');
        logger.info('Default partition draining completed');
        break;

      case 'manual_year_creation':
        if (!tableName || !year) {
          throw new Error('Manual year creation requires tableName and year');
        }
        await ensureYearPartition(tableName, year);
        logger.info({ tableName, year }, 'Manual partition created');
        break;

      default:
        throw new Error(`Unknown partition maintenance job type: ${type}`);
    }
  } catch (error) {
    logger.error(
      { type, error, jobId: job.id },
      'Partition maintenance job failed',
    );
    throw error; // Re-throw to trigger retry logic
  }
}

/**
 * Start the partition maintenance worker
 */
export function startPartitionMaintenanceWorker(): Worker {
  const worker = new Worker(
    'partition-maintenance',
    (job) => runWithJobContext(job, () => processPartitionMaintenanceJob(job)),
    {
      connection: redis,
      concurrency: 1, // Process partition maintenance jobs one at a time
      // Conservative settings since partition maintenance is not time-critical
      drainDelay: 1800, // 30 minutes - very conservative since these are maintenance jobs
      stalledInterval: 1800000, // 30 minutes between stalled checks
      maxStalledCount: 1, // Only allow 1 stalled job before considering it failed
    },
  );

  // Worker event handlers
  worker.on('ready', () => {
    logger.info('Partition maintenance worker is ready');
  });

  worker.on('active', (job: Job<PartitionMaintenanceJobData>) => {
    logger.info({ type: job.data.type, jobId: job.id }, 'Partition job active');
  });

  worker.on('completed', (job: Job<PartitionMaintenanceJobData>) => {
    logger.info(
      { type: job.data.type, jobId: job.id },
      'Partition job completed',
    );
  });

  worker.on(
    'failed',
    (job: Job<PartitionMaintenanceJobData> | undefined, err: Error) => {
      logger.error(
        { type: job?.data.type, jobId: job?.id, error: err },
        'Partition job failed',
      );
    },
  );

  worker.on('stalled', (jobId: string) => {
    logger.warn({ jobId }, 'Partition job stalled');
  });

  worker.on('error', (err: Error) => {
    logger.error({ error: err }, 'Partition maintenance worker error');
  });

  return worker;
}
