import type { Worker } from 'bullmq';

import { WORKER_REGISTRY } from '../registry.js';

// Active workers tracking
const activeWorkers: Map<string, Worker> = new Map();

/**
 * Start all configured workers
 * @returns Array of started workers
 */
export async function startAllWorkers(): Promise<Worker[]> {
  const workers: Worker[] = [];

  console.log(`🚀 Starting ${WORKER_REGISTRY.length} workers...`);

  for (const definition of WORKER_REGISTRY) {
    const {
      name,
      factory,
      config,
      critical = false,
      label,
      icon = '🔧',
    } = definition;

    try {
      console.log(`${icon} Starting ${name} worker...`);

      let worker: Worker;
      if (config) {
        // Concurrency logic: Env var > Default value
        const concurrency =
          Number(process.env[config.envVar]) || config.defaultValue;
        worker = factory(concurrency);
      } else {
        worker = factory();
      }

      activeWorkers.set(name, worker);
      workers.push(worker);
      console.log(`✅ ${label} started successfully`);
    } catch (error) {
      console.error(`❌ Failed to start ${name} worker:`, error);
      if (critical) {
        throw error;
      }
      console.log(`⚠️  Continuing without ${name} worker`);
    }
  }

  console.log(
    `✅ Started ${workers.length}/${WORKER_REGISTRY.length} workers successfully`,
  );
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
