import { Queue } from 'bullmq';
import { redis } from '../../lib/redis.js';

/**
 * Queue for partition maintenance jobs
 *
 * Handles periodic maintenance of database partitions for bank_transactions
 * and ledger_entries tables. This includes:
 * - Creating partitions for future years
 * - Switching to monthly partitions when data volume is high
 * - Draining default partitions
 */

export interface PartitionMaintenanceJobData {
  type: 'smart_maintenance' | 'drain_defaults' | 'manual_year_creation';
  tableName?: 'bank_transactions' | 'ledger_entries';
  year?: number;
  options?: {
    yearsAhead?: number;
    monthlyThreshold?: number;
    drainDefaults?: boolean;
  };
}

export const partitionMaintenanceQueue = new Queue<PartitionMaintenanceJobData>(
  'partition-maintenance',
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30000, // Start with 30s, then 60s, then 120s
      },
      removeOnComplete: {
        age: 86400, // Keep completed jobs for 24 hours
        count: 50, // Keep last 50 completed jobs
      },
      removeOnFail: {
        age: 86400 * 7, // Keep failed jobs for 7 days
        count: 100, // Keep last 100 failed jobs
      },
    },
  },
);

/**
 * Schedule smart partition maintenance
 * Creates partitions for future years and handles volume-based transitions
 */
export async function scheduleSmartPartitionMaintenance(
  options: {
    yearsAhead?: number;
    monthlyThreshold?: number;
    drainDefaults?: boolean;
  } = {},
) {
  return partitionMaintenanceQueue.add(
    'smart-maintenance',
    {
      type: 'smart_maintenance',
      options,
    },
    {
      // Run once per day at 2 AM
      repeat: {
        pattern: '0 2 * * *',
      },
      jobId: 'daily-partition-maintenance', // Prevent duplicates
    },
  );
}

/**
 * Schedule default partition draining
 * Moves records from default partitions to proper partitions
 */
export async function scheduleDefaultPartitionDraining() {
  return partitionMaintenanceQueue.add(
    'drain-defaults',
    {
      type: 'drain_defaults',
    },
    {
      // Run every 4 hours
      repeat: {
        pattern: '0 */4 * * *',
      },
      jobId: 'drain-default-partitions', // Prevent duplicates
    },
  );
}

/**
 * Manually create partition for a specific year
 */
export async function scheduleManualYearPartition(
  tableName: 'bank_transactions' | 'ledger_entries',
  year: number,
) {
  return partitionMaintenanceQueue.add(
    'manual-year-creation',
    {
      type: 'manual_year_creation',
      tableName,
      year,
    },
    {
      priority: 10, // High priority for manual requests
    },
  );
}
