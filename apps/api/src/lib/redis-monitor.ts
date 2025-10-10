import { redis } from './redis.js';
import pino from 'pino';

const logger = pino();

// Redis command monitoring statistics
interface RedisStats {
  commandCount: number;
  commandsByType: Map<string, number>;
  lastResetTime: number;
  averageCommandsPerMinute: number;
}

// Global stats tracking
let stats: RedisStats = {
  commandCount: 0,
  commandsByType: new Map(),
  lastResetTime: Date.now(),
  averageCommandsPerMinute: 0,
};

// Command categories for better monitoring
const BULLMQ_COMMANDS = new Set([
  'BZPOPMIN',
  'BZPOPMAX',
  'RPOPLPUSH',
  'BRPOPLPUSH',
  'ZRANGEBYSCORE',
  'ZADD',
  'ZREM',
  'ZREMRANGEBYSCORE',
  'EVALSHA',
  'EVAL',
  'HMSET',
  'HMGET',
  'HGETALL',
  'EXISTS',
  'DEL',
  'EXPIRE',
  'TTL',
]);

const HIGH_FREQUENCY_COMMANDS = new Set([
  'BZPOPMIN',
  'BRPOPLPUSH',
  'EXISTS',
  'ZRANGEBYSCORE',
]);

/**
 * Initialize Redis command monitoring
 * Only enable in staging/production for performance monitoring
 */
export function initRedisMonitoring() {
  const shouldMonitor =
    process.env.ENABLE_REDIS_MONITORING === 'true' ||
    process.env.NODE_ENV === 'staging';

  if (!shouldMonitor) {
    logger.info('Redis monitoring disabled');
    return;
  }

  logger.info('🔍 Initializing Redis command monitoring...');

  // Track connection events
  redis.on('connect', () => {
    logger.info('✅ Redis connected - monitoring active');
  });

  redis.on('error', (error) => {
    logger.error({ error }, '❌ Redis connection error');
  });

  redis.on('reconnecting', () => {
    logger.warn('🔄 Redis reconnecting...');
  });

  // Monitor commands (if available)
  try {
    const monitor = redis.monitor();

    monitor
      .then((monitor) => {
        logger.info('📊 Redis command monitoring started');

        monitor.on('monitor', (time, args, source, database) => {
          if (args && args.length > 0) {
            const command = args[0].toUpperCase();

            // Update stats
            stats.commandCount++;
            const currentCount = stats.commandsByType.get(command) || 0;
            stats.commandsByType.set(command, currentCount + 1);

            // Log high-frequency commands less often
            if (HIGH_FREQUENCY_COMMANDS.has(command)) {
              // Log every 100th high-frequency command
              if (stats.commandCount % 100 === 0) {
                logger.debug(
                  {
                    command,
                    count: stats.commandCount,
                    database,
                    source,
                  },
                  'High-frequency Redis command (every 100th logged)',
                );
              }
            } else if (BULLMQ_COMMANDS.has(command)) {
              // Log BullMQ commands occasionally
              if (stats.commandCount % 50 === 0) {
                logger.debug(
                  {
                    command,
                    args: args.slice(1, 3), // Log first few args only
                    count: stats.commandCount,
                  },
                  'BullMQ Redis command',
                );
              }
            }

            // Log summary every 1000 commands
            if (stats.commandCount % 1000 === 0) {
              logCommandSummary();
            }
          }
        });
      })
      .catch((error) => {
        logger.warn(
          { error },
          '⚠️  Could not enable Redis command monitoring (not critical)',
        );
      });
  } catch (error) {
    logger.warn({ error }, '⚠️  Redis monitoring not available (not critical)');
  }

  // Log summary every hour
  setInterval(
    () => {
      logCommandSummary(true);
      resetStats();
    },
    60 * 60 * 1000,
  ); // 1 hour

  logger.info('✅ Redis monitoring initialized');
}

/**
 * Log command summary statistics
 */
function logCommandSummary(isHourly = false) {
  const elapsed = (Date.now() - stats.lastResetTime) / 1000; // seconds
  const commandsPerMinute = Math.round((stats.commandCount / elapsed) * 60);

  // Get top 10 commands
  const topCommands = Array.from(stats.commandsByType.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .reduce(
      (obj, [cmd, count]) => {
        obj[cmd] = count;
        return obj;
      },
      {} as Record<string, number>,
    );

  const logLevel = isHourly ? 'info' : 'debug';

  logger[logLevel](
    {
      totalCommands: stats.commandCount,
      commandsPerMinute,
      elapsedSeconds: Math.round(elapsed),
      topCommands,
      uniqueCommandTypes: stats.commandsByType.size,
    },
    isHourly ? '📊 Hourly Redis usage summary' : '📈 Redis command summary',
  );
}

/**
 * Reset stats for the next period
 */
function resetStats() {
  stats = {
    commandCount: 0,
    commandsByType: new Map(),
    lastResetTime: Date.now(),
    averageCommandsPerMinute: 0,
  };
}

/**
 * Get current Redis monitoring stats
 */
export function getRedisStats(): RedisStats & {
  topCommands: Record<string, number>;
  commandsPerMinute: number;
} {
  const elapsed = (Date.now() - stats.lastResetTime) / 1000;
  const commandsPerMinute = Math.round((stats.commandCount / elapsed) * 60);

  const topCommands = Array.from(stats.commandsByType.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .reduce(
      (obj, [cmd, count]) => {
        obj[cmd] = count;
        return obj;
      },
      {} as Record<string, number>,
    );

  return {
    ...stats,
    topCommands,
    commandsPerMinute,
  };
}

/**
 * Log a warning if Redis usage is unusually high
 */
export function checkRedisUsageThreshold() {
  const redisStats = getRedisStats();
  const warningThreshold = 1000; // commands per minute

  if (redisStats.commandsPerMinute > warningThreshold) {
    logger.warn(
      {
        commandsPerMinute: redisStats.commandsPerMinute,
        totalCommands: redisStats.commandCount,
        topCommands: redisStats.topCommands,
      },
      '🚨 High Redis usage detected - consider optimizing worker settings',
    );
  }
}

// Check usage every 5 minutes
setInterval(checkRedisUsageThreshold, 5 * 60 * 1000);
