// Load environment variables using the project's env-loader
import '../config/env-loader.js';

import * as Sentry from '@sentry/node';
import pino from 'pino';

import { ENV, NODE_ENV } from './config/env.js';
import { startAllSchedules } from './jobs/schedule-registry.js';
import { getJobSchedules } from './jobs/schedules.js';
import { getRedisStats, initRedisMonitoring } from './lib/redis-monitor.js';
import { initSentry } from './sentry.bootstrap.js';

// Initialize logger
const logger =
  NODE_ENV === 'local'
    ? pino({
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, singleLine: true },
        },
      })
    : pino();

/**
 * Scheduler process entry point
 * This file registers all repeatable (cron-based) jobs
 */
async function main() {
  try {
    // Initialize Sentry for error tracking
    initSentry();
    logger.info('🗓️ Scheduler process starting...');

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
      'Scheduler environment',
    );

    // Register all repeatable schedules
    await startAllSchedules();

    const schedules = getJobSchedules();
    logger.info({ schedules }, '✅ Scheduler registry loaded');

    // Basic health check (scheduler + Redis) every 10 minutes
    const healthCheck = () => {
      const redisStats = getRedisStats();

      logger.info(
        {
          redis: {
            commandsPerMinute: redisStats.commandsPerMinute,
            totalCommands: redisStats.commandCount,
          },
        },
        '💓 Scheduler and Redis health check',
      );

      return { redis: redisStats };
    };

    const healthCheckInterval = setInterval(healthCheck, 10 * 60 * 1000);

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`🛑 ${signal} received, shutting down scheduler...`);
      clearInterval(healthCheckInterval);
      logger.info('✅ Scheduler process shut down gracefully');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error(
        { reason, promise },
        '🚨 Unhandled promise rejection in scheduler process',
      );
      Sentry.captureException(reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error({ error }, '🚨 Uncaught exception in scheduler process');
      Sentry.captureException(error);
      process.exit(1);
    });

    logger.info('🚀 Scheduler process fully initialized and running');
  } catch (error) {
    logger.error({ error }, '❌ Failed to start scheduler process');
    Sentry.captureException(error);
    process.exit(1);
  }
}

// Start the scheduler process
main().catch((error) => {
  console.error('💥 Fatal error in scheduler process:', error);
  process.exit(1);
});
