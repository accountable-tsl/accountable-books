import { knexClient } from '../../db/knexClient.js';
import type { Knex } from 'knex';

/**
 * Partition Management Service
 *
 * Handles automatic partition creation for bank_transactions and ledger_entries tables.
 * This service ensures partitions exist before data insertion to prevent DDL-within-transaction conflicts.
 */

export interface PartitionInfo {
  tableName: 'bank_transactions' | 'ledger_entries';
  year: number;
  month?: number; // undefined for yearly partitions, 1-12 for monthly
}

/**
 * Ensures partitions exist for the given dates without causing transaction conflicts
 */
export async function ensurePartitionsForDates(
  tableName: 'bank_transactions' | 'ledger_entries',
  dates: Date[],
  knex: Knex = knexClient,
): Promise<void> {
  if (!dates.length) return;

  // Extract unique years from dates
  const years = [...new Set(dates.map((date) => date.getFullYear()))];

  // Create partitions for each required year
  for (const year of years) {
    await ensureYearPartition(tableName, year, knex);
  }
}

/**
 * Ensures a yearly partition exists for the given table and year
 */
export async function ensureYearPartition(
  tableName: 'bank_transactions' | 'ledger_entries',
  year: number,
  knex: Knex = knexClient,
): Promise<void> {
  try {
    // Use the appropriate function name for each table
    if (tableName === 'bank_transactions') {
      await knex.raw('SELECT ensure_year_partition(?)', [year]);
    } else {
      await knex.raw('SELECT ensure_ledger_year_partition(?)', [year]);
    }
  } catch (error) {
    console.error(`Failed to ensure partition for ${tableName} year ${year}:`, error);
    // Don't throw - let inserts go to default partition if creation fails
  }
}

/**
 * Ensures a monthly partition exists for the given table and date
 */
export async function ensureMonthPartition(
  tableName: 'bank_transactions' | 'ledger_entries',
  date: Date,
  knex: Knex = knexClient,
): Promise<void> {
  try {
    if (tableName === 'bank_transactions') {
      await knex.raw('SELECT ensure_month_partition(?)', [date]);
    } else {
      await knex.raw('SELECT ensure_ledger_month_partition(?)', [date]);
    }
  } catch (error) {
    console.error(`Failed to ensure monthly partition for ${tableName} ${date}:`, error);
    // Don't throw - let inserts go to default partition if creation fails
  }
}

/**
 * Gets the current data volume for a table in the given year
 */
export async function getYearlyDataVolume(
  tableName: 'bank_transactions' | 'ledger_entries',
  year: number,
  knex: Knex = knexClient,
): Promise<number> {
  const startDate = `${year}-01-01`;
  const endDate = `${year + 1}-01-01`;

  const result = await knex(tableName)
    .where('date', '>=', startDate)
    .where('date', '<', endDate)
    .where('is_deleted', false)
    .count('* as count')
    .first();

  return parseInt((result?.count as string) || '0', 10);
}

/**
 * Determines if a table should use monthly partitions based on data volume
 */
export async function shouldUseMonthlyPartitions(
  tableName: 'bank_transactions' | 'ledger_entries',
  year: number,
  threshold: number = 100000,
  knex: Knex = knexClient,
): Promise<boolean> {
  const volume = await getYearlyDataVolume(tableName, year, knex);
  return volume > threshold;
}

/**
 * Creates partitions for future years based on smart analysis
 */
export async function smartPartitionMaintenance(
  tableName: 'bank_transactions' | 'ledger_entries',
  yearsAhead: number = 3,
  monthlyThreshold: number = 1200000,
  knex: Knex = knexClient,
): Promise<void> {
  const currentYear = new Date().getFullYear();

  try {
    // Check current year volume to decide future partition strategy
    const currentYearVolume = await getYearlyDataVolume(tableName, currentYear, knex);
    const useMonthlyForFuture = currentYearVolume > monthlyThreshold;

    console.log(
      `Smart partition maintenance for ${tableName}: current year ${currentYear} has ${currentYearVolume} records`,
    );

    // Create partitions for next few years
    for (let year = currentYear; year <= currentYear + yearsAhead; year++) {
      if (year > currentYear && useMonthlyForFuture) {
        // Create monthly partitions for future years if current volume is high
        for (let month = 1; month <= 12; month++) {
          const date = new Date(year, month - 1, 1);
          await ensureMonthPartition(tableName, date, knex);
        }
        console.log(`Created monthly partitions for ${tableName} year ${year}`);
      } else {
        // Create yearly partition
        await ensureYearPartition(tableName, year, knex);
        console.log(`Created yearly partition for ${tableName} year ${year}`);
      }
    }
  } catch (error) {
    console.error(`Smart partition maintenance failed for ${tableName}:`, error);
  }
}

/**
 * Drains the default partition by moving records to proper partitions
 */
export async function drainDefaultPartition(
  tableName: 'bank_transactions' | 'ledger_entries',
  knex: Knex = knexClient,
): Promise<void> {
  try {
    if (tableName === 'bank_transactions') {
      await knex.raw('SELECT drain_bank_transactions_default()');
    } else {
      await knex.raw('SELECT drain_ledger_entries_default()');
    }
    console.log(`Drained default partition for ${tableName}`);
  } catch (error) {
    console.error(`Failed to drain default partition for ${tableName}:`, error);
  }
}

/**
 * Comprehensive partition maintenance that handles both tables
 */
export async function runPartitionMaintenance(
  options: {
    yearsAhead?: number;
    monthlyThreshold?: number;
    drainDefaults?: boolean;
  } = {},
): Promise<void> {
  const { yearsAhead = 3, monthlyThreshold = 100000, drainDefaults = true } = options;

  console.log('Starting partition maintenance...');

  // Maintain partitions for both tables
  await smartPartitionMaintenance('bank_transactions', yearsAhead, monthlyThreshold);
  await smartPartitionMaintenance('ledger_entries', yearsAhead, monthlyThreshold);

  // Drain default partitions if requested
  if (drainDefaults) {
    await drainDefaultPartition('bank_transactions');
    await drainDefaultPartition('ledger_entries');
  }

  console.log('Partition maintenance completed');
}

/**
 * Initialize scheduled partition maintenance jobs
 * This should be called once when the application starts
 */
export async function initializePartitionMaintenanceSchedule(): Promise<void> {
  try {
    // Import here to avoid circular dependencies
    const { scheduleSmartPartitionMaintenance, scheduleDefaultPartitionDraining } = await import(
      '../../jobs/queues/partition-maintenance.queue.js'
    );

    // Schedule smart maintenance (daily at 2 AM)
    await scheduleSmartPartitionMaintenance({
      yearsAhead: 3,
      monthlyThreshold: 100000,
      drainDefaults: false, // Handled separately
    });

    // Schedule default partition draining (every 4 hours)
    await scheduleDefaultPartitionDraining();

    console.log('✅ Partition maintenance schedule initialized');
  } catch (error) {
    console.error('❌ Failed to initialize partition maintenance schedule:', error);
    // Don't throw - let the application continue without scheduled maintenance
  }
}
