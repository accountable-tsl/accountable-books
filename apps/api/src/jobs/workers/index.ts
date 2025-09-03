import { startEmailWorker } from './email.worker.js';
import { startTransactionSyncWorker } from './transaction-sync.worker.js';
import type { Worker } from 'bullmq';

export interface WorkerConfig {
  email: {
    enabled: boolean;
    concurrency: number;
  };
  transactionSync: {
    enabled: boolean;
    concurrency: number;
  };
}

// Default worker configuration
const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  email: {
    enabled: process.env.ENABLE_EMAIL_WORKER !== 'false',
    concurrency: Number(process.env.EMAIL_WORKER_CONCURRENCY) || 5,
  },
  transactionSync: {
    enabled: process.env.ENABLE_TRANSACTION_SYNC === 'true',
    concurrency: Number(process.env.TRANSACTION_SYNC_CONCURRENCY) || 3,
  },
};

// Active workers tracking
const activeWorkers: Map<string, Worker> = new Map();

/**
 * Start all configured workers
 * @param config Optional worker configuration override
 * @returns Array of started workers
 */
export async function startAllWorkers(config: Partial<WorkerConfig> = {}): Promise<Worker[]> {
  const workerConfig = { ...DEFAULT_WORKER_CONFIG, ...config };
  const workers: Worker[] = [];

  console.log('🚀 Starting workers with configuration:', workerConfig);

  // Start email worker
  if (workerConfig.email.enabled) {
    try {
      console.log('📧 Starting email worker...');
      const emailWorker = startEmailWorker();
      activeWorkers.set('email', emailWorker);
      workers.push(emailWorker);
      console.log('✅ Email worker started successfully');
    } catch (error) {
      console.error('❌ Failed to start email worker:', error);
      throw error;
    }
  } else {
    console.log('⏭️  Email worker disabled');
  }

  // Start transaction sync worker
  if (workerConfig.transactionSync.enabled) {
    try {
      console.log('💳 Starting transaction sync worker...');
      const syncWorker = startTransactionSyncWorker();
      activeWorkers.set('transactionSync', syncWorker);
      workers.push(syncWorker);
      console.log('✅ Transaction sync worker started successfully');
    } catch (error) {
      console.error('❌ Failed to start transaction sync worker:', error);
      // Don't throw for transaction sync as it's not critical for MVP
    }
  } else {
    console.log('⏭️  Transaction sync worker disabled');
  }

  console.log(`✅ Started ${workers.length} workers successfully`);
  return workers;
}

/**
 * Stop all active workers gracefully
 */
export async function stopAllWorkers(): Promise<void> {
  console.log('🛑 Stopping all workers...');

  const stopPromises = Array.from(activeWorkers.entries()).map(async ([name, worker]) => {
    try {
      console.log(`⏹️  Stopping ${name} worker...`);
      await worker.close();
      console.log(`✅ ${name} worker stopped`);
    } catch (error) {
      console.error(`❌ Error stopping ${name} worker:`, error);
    }
  });

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
