import type { Worker } from 'bullmq';

import { getLogger } from '../../shared/utils/logger.js';
import { WORKER_REGISTRY } from '../registry.js';

type WorkerEntry = { worker: Worker; teardown?: () => Promise<void> };

// Active workers tracking
const activeWorkers: Map<string, WorkerEntry> = new Map();
const logger = getLogger({
  component: 'worker-registry',
  processSource: 'worker',
});

/**
 * Start all configured workers
 * @returns Array of started workers
 */
export async function startAllWorkers(): Promise<Worker[]> {
  const workers: Worker[] = [];

  logger.info(
    { workerCount: WORKER_REGISTRY.length },
    'Starting registered workers',
  );

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
      logger.info({ workerName: name, icon }, 'Starting worker');

      let worker: Worker;
      if (config) {
        // Concurrency logic: Env var > Default value
        const concurrency =
          Number(process.env[config.envVar]) || config.defaultValue;
        worker = factory(concurrency);
      } else {
        worker = factory();
      }

      activeWorkers.set(name, { worker, teardown: definition.teardown });
      workers.push(worker);
      logger.info({ workerName: name, label }, 'Worker started successfully');
    } catch (error) {
      logger.error({ workerName: name, error }, 'Failed to start worker');
      if (critical) {
        throw error;
      }
      logger.warn({ workerName: name }, 'Continuing without worker');
    }
  }

  logger.info(
    {
      startedCount: workers.length,
      workerCount: WORKER_REGISTRY.length,
    },
    'Worker startup finished',
  );
  return workers;
}

/**
 * Stop all active workers gracefully
 */
export async function stopAllWorkers(): Promise<void> {
  logger.info('Stopping all workers');

  const stopPromises = Array.from(activeWorkers.entries()).map(
    async ([name, { worker, teardown }]) => {
      try {
        logger.info({ workerName: name }, 'Stopping worker');
        await worker.close();
        if (teardown) await teardown();
        logger.info({ workerName: name }, 'Worker stopped');
      } catch (error) {
        logger.error({ workerName: name, error }, 'Error stopping worker');
      }
    },
  );

  await Promise.all(stopPromises);
  activeWorkers.clear();
  logger.info('All workers stopped');
}

/**
 * Get status of all active workers
 */
export function getWorkersStatus() {
  const status: Record<string, any> = {};

  activeWorkers.forEach(({ worker }, name) => {
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
  return activeWorkers.get(name)?.worker;
}
