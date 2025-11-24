import { startPartitionMaintenanceWorker } from './partition-maintenance.worker.js';
import type { Worker } from 'bullmq';
import { startEmailWorker } from '../../features/communications/email/index.js';
import { startTransactionSyncWorker } from '../../integrations/banking/index.js';
import { startBalanceRecalcWorker } from '../../domains/balances/index.js';
import { startFiscalCalendarWorker } from '../../domains/reporting/fiscal-calendar/index.js';
import {
  startEnrichmentWorker,
  startRuleRunnerWorker,
} from '../../domains/categorization/index.js';

export interface WorkerConfig {
  email: {
    concurrency: number;
  };
  transactionSync: {
    concurrency: number;
  };
  partitionMaintenance: {
    concurrency: number;
  };
  balanceRecalc: {
    concurrency: number;
  };
  fiscalCalendar: {
    concurrency: number;
  };
  enrichment: {
    concurrency: number;
  };
  ruleRunner: {
    concurrency: number;
  };
}

// Default worker configuration
const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  email: {
    concurrency: Number(process.env.EMAIL_WORKER_CONCURRENCY) || 5,
  },
  transactionSync: {
    concurrency: Number(process.env.TRANSACTION_SYNC_CONCURRENCY) || 3,
  },
  partitionMaintenance: {
    concurrency: Number(process.env.PARTITION_MAINTENANCE_CONCURRENCY) || 1,
  },
  balanceRecalc: {
    concurrency: Number(process.env.BALANCE_RECALC_CONCURRENCY) || 5,
  },
  fiscalCalendar: {
    concurrency: Number(process.env.FISCAL_CALENDAR_CONCURRENCY) || 3,
  },
  enrichment: {
    concurrency: Number(process.env.ENRICHMENT_WORKER_CONCURRENCY) || 10,
  },
  ruleRunner: {
    concurrency: Number(process.env.RULE_RUNNER_CONCURRENCY) || 5,
  },
};

// Active workers tracking
const activeWorkers: Map<string, Worker> = new Map();

/**
 * Start all configured workers
 * @param config Optional worker configuration override
 * @returns Array of started workers
 */
export async function startAllWorkers(
  config: Partial<WorkerConfig> = {},
): Promise<Worker[]> {
  const workerConfig = { ...DEFAULT_WORKER_CONFIG, ...config };
  const workers: Worker[] = [];

  // Start email worker
  try {
    const emailWorker = startEmailWorker();
    activeWorkers.set('email', emailWorker);
    workers.push(emailWorker);
    console.log('📧 Email worker started successfully');
  } catch (error) {
    console.error('❌ Failed to start email worker:', error);
    throw error;
  }

  // Start transaction sync worker
  try {
    const syncWorker = startTransactionSyncWorker(
      workerConfig.transactionSync.concurrency,
    );
    activeWorkers.set('transactionSync', syncWorker);
    workers.push(syncWorker);
    console.log('💳 Transaction sync worker started successfully');
  } catch (error) {
    console.error('❌ Failed to start transaction sync worker:', error);
    throw error;
    // Throw, this is mission critical
  }

  // Start partition maintenance worker
  try {
    const partitionWorker = startPartitionMaintenanceWorker();
    activeWorkers.set('partitionMaintenance', partitionWorker);
    workers.push(partitionWorker);
    console.log('🗂️ Partition maintenance worker started successfully');
  } catch (error) {
    console.error('❌ Failed to start partition maintenance worker:', error);
    // Don't throw for partition maintenance as it's not critical for MVP
  }

  // Start balance recalculation worker (always enabled - core functionality)
  try {
    console.log('⚖️  Starting balance recalculation worker...');
    const balanceWorker = startBalanceRecalcWorker();
    activeWorkers.set('balanceRecalc', balanceWorker);
    workers.push(balanceWorker);
    console.log('✅ Balance recalculation worker started successfully');
  } catch (error) {
    console.error('❌ Failed to start balance recalculation worker:', error);
    // Balance recalc is core functionality, so throw the error
    throw error;
  }

  // Start fiscal calendar worker (core functionality for period management)
  try {
    console.log('📅 Starting fiscal calendar worker...');
    const fiscalCalendarWorker = startFiscalCalendarWorker(
      workerConfig.fiscalCalendar.concurrency,
    );
    activeWorkers.set('fiscalCalendar', fiscalCalendarWorker);
    workers.push(fiscalCalendarWorker);
    console.log('✅ Fiscal calendar worker started successfully');
  } catch (error) {
    console.error('❌ Failed to start fiscal calendar worker:', error);
    // Fiscal calendar is core functionality, so throw the error
    throw error;
  }

  // Start enrichment worker (transaction enrichment for categorization)
  try {
    console.log('🔍 Starting enrichment worker...');
    const enrichmentWorker = startEnrichmentWorker();
    activeWorkers.set('enrichment', enrichmentWorker);
    workers.push(enrichmentWorker);
    console.log('✅ Enrichment worker started successfully');
  } catch (error) {
    console.error('❌ Failed to start enrichment worker:', error);
    // Enrichment is not critical for core operations, so just log the error
    console.log('⚠️  Continuing without enrichment worker');
  }

  // Start rule runner worker (required for categorization automation)
  try {
    console.log('⚙️  Starting rule runner worker...');
    const ruleRunnerWorker = startRuleRunnerWorker(
      workerConfig.ruleRunner.concurrency,
    );
    activeWorkers.set('ruleRunner', ruleRunnerWorker);
    workers.push(ruleRunnerWorker);
    console.log('✅ Rule runner worker started successfully');
  } catch (error) {
    console.error('❌ Failed to start rule runner worker:', error);
    throw error;
  }

  console.log(`✅ Started ${workers.length} workers successfully`);
  return workers;
}

/**
 * Stop all active workers gracefully
 */
export async function stopAllWorkers(): Promise<void> {
  console.log('🛑 Stopping all workers...');

  const stopPromises = Array.from(activeWorkers.entries()).map(
    async ([name, worker]) => {
      try {
        console.log(`⏹️  Stopping ${name} worker...`);
        await worker.close();
        console.log(`✅ ${name} worker stopped`);
      } catch (error) {
        console.error(`❌ Error stopping ${name} worker:`, error);
      }
    },
  );

  await Promise.all(stopPromises);
  activeWorkers.clear();
  console.log('✅ All workers stopped');
}

/**
 * Get status of all active workers
 */
export function getWorkersStatus() {
  const status: Record<string, any> = {};

  activeWorkers.forEach((worker, name) => {
    status[name] = {
      isRunning: worker.isRunning(),
      isPaused: worker.isPaused(),
      concurrency: worker.concurrency,
    };
  });

  return {
    active: activeWorkers.size,
    workers: status,
  };
}

/**
 * Get a specific worker by name
 */
export function getWorker(name: string): Worker | undefined {
  return activeWorkers.get(name);
}

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received, shutting down workers...');
  await stopAllWorkers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received, shutting down workers...');
  await stopAllWorkers();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit immediately, log and continue
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  // For uncaught exceptions, we should exit after cleanup
  stopAllWorkers().finally(() => {
    process.exit(1);
  });
});
