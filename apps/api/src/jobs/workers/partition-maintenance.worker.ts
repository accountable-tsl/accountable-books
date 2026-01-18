import type { Job } from 'bullmq';
import { Worker } from 'bullmq';

import { redis } from '../../lib/redis.js';
import {
  drainDefaultPartition,
  ensureYearPartition,
  runPartitionMaintenance,
} from '../../shared/services/partitionManagement.service.js';
import { type PartitionMaintenanceJobData } from '../queues/partition-maintenance.queue.js';

/**
 * Partition Maintenance Worker
 *
 * Processes partition maintenance jobs to ensure database partitions
 * are created and maintained automatically. This worker prevents
 * the DDL-within-transaction errors that occur when partitions
 * don't exist during data insertion.
 */

async function processPartitionMaintenanceJob(
  job: Job<PartitionMaintenanceJobData>,
) {
  const { type, tableName, year, options } = job.data;

  console.log(`🗂️  Processing partition maintenance job: ${type}`, {
    tableName,
    year,
    options,
  });

  try {
    switch (type) {
      case 'smart_maintenance':
        await runPartitionMaintenance(options);
        console.log('✅ Smart partition maintenance completed');
        break;

      case 'drain_defaults':
        await drainDefaultPartition('bank_transactions');
        await drainDefaultPartition('ledger_entries');
        console.log('✅ Default partition draining completed');
        break;

      case 'manual_year_creation':
        if (!tableName || !year) {
          throw new Error('Manual year creation requires tableName and year');
        }
        await ensureYearPartition(tableName, year);
        console.log(
          `✅ Manual partition created for ${tableName} year ${year}`,
        );
        break;

      default:
        throw new Error(`Unknown partition maintenance job type: ${type}`);
    }
  } catch (error) {
    console.error(`❌ Partition maintenance job failed (${type}):`, error);
    throw error; // Re-throw to trigger retry logic
  }
}

/**
 * Start the partition maintenance worker
 */
export function startPartitionMaintenanceWorker(): Worker {
  const worker = new Worker(
    'partition-maintenance',
    processPartitionMaintenanceJob,
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
    console.log('🗂️  Partition maintenance worker is ready');
  });

  worker.on('active', (job: Job<PartitionMaintenanceJobData>) => {
    console.log(`🗂️  Processing partition job: ${job.data.type} (${job.id})`);
  });

  worker.on('completed', (job: Job<PartitionMaintenanceJobData>) => {
    console.log(`✅ Partition job completed: ${job.data.type} (${job.id})`);
  });

  worker.on(
    'failed',
    (job: Job<PartitionMaintenanceJobData> | undefined, err: Error) => {
      console.error(
        `❌ Partition job failed: ${job?.data.type} (${job?.id})`,
        err,
      );
    },
  );

  worker.on('stalled', (jobId: string) => {
    console.warn(`⚠️  Partition job stalled: ${jobId}`);
  });

  worker.on('error', (err: Error) => {
    console.error('❌ Partition maintenance worker error:', err);
  });

  return worker;
}
