// Load environment variables using the project's env-loader
import '../config/env-loader.js';

import * as Sentry from '@sentry/node';

import { ENV, NODE_ENV } from './config/env.js';
import {
  getWorkersStatus,
  startAllWorkers,
  stopAllWorkers,
} from './jobs/workers/index.js';
import { getRedisStats, initRedisMonitoring } from './lib/redis-monitor.js';
import { initSentry } from './sentry.bootstrap.js';
import { getLogger } from './shared/utils/logger.js';

// Initialize logger
const logger = getLogger({ component: 'worker', processSource: 'worker' });

/**
 * Main worker process entry point
 * This file starts all configured workers with optimized settings
 */
async function main() {
  try {
    // Initialize Sentry for error tracking
    initSentry();
    logger.info('🔧 Worker process starting (consumers only)...');

    // Initialize Redis monitoring
    initRedisMonitoring();

    // Log environment info
    logger.info(
      {
        environment: NODE_ENV,
        redisUrl: ENV.REDIS_URL ? 'configured' : 'missing',
        backendUrl: ENV.BACKEND_URL,
        redisMonitoring:
          process.env.ENABLE_REDIS_MONITORING === 'true' ? 'enabled' : 'auto',
      },
      'Worker environment',
    );

    // Start all configured workers
    const workers = await startAllWorkers();

    // Log worker status
    const status = getWorkersStatus();
    logger.info(
      status,
      `🎯 Worker process ready with ${workers.length} active workers`,
    );

    // Set up health check endpoint (if needed)
    // This could be useful for monitoring worker health
    const healthCheck = () => {
      const status = getWorkersStatus();
      const redisStats = getRedisStats();

      logger.info(
        {
          workers: status,
          redis: {
            commandsPerMinute: redisStats.commandsPerMinute,
            totalCommands: redisStats.commandCount,
          },
        },
        '💓 Worker and Redis health check',
      );

      return { workers: status, redis: redisStats };
    };

    // Run health check every 5 minutes
    const healthCheckInterval = setInterval(healthCheck, 5 * 60 * 1000);

    // Keep process alive and handle graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('🛑 SIGTERM received, shutting down workers...');
      clearInterval(healthCheckInterval);
      await stopAllWorkers();
      logger.info('✅ Worker process shut down gracefully');
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('🛑 SIGINT received, shutting down workers...');
      clearInterval(healthCheckInterval);
      await stopAllWorkers();
      logger.info('✅ Worker process shut down gracefully');
      process.exit(0);
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error(
        { reason, promise },
        '🚨 Unhandled promise rejection in worker process',
      );
      Sentry.captureException(reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error({ error }, '🚨 Uncaught exception in worker process');
      Sentry.captureException(error);

      stopAllWorkers().finally(() => {
        process.exit(1);
      });
    });

    logger.info('🚀 Worker process fully initialized and running');
  } catch (error) {
    logger.error({ error }, '❌ Failed to start worker process');
    Sentry.captureException(error);
    process.exit(1);
  }
}

// Start the worker process
main().catch((error) => {
  logger.error({ error }, 'Fatal error in worker process');
  process.exit(1);
});
