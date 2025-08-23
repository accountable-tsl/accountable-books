/**
 * Application Logger
 *
 * Centralized logging configuration using pino for structured logging.
 * Supports different log levels per environment and structured error handling.
 */

import pino from 'pino';

/**
 * Log levels configuration per environment
 */
const LOG_LEVELS = {
  local: 'debug',
  test: 'silent',
  staging: 'info',
  production: 'warn',
} as const;

/**
 * Create logger instance with environment-specific configuration
 */
function createLogger() {
  const env = (process.env.NODE_ENV as keyof typeof LOG_LEVELS) || 'local';
  const isDevelopment = env === 'local' || env === 'staging';

  return pino({
    level: LOG_LEVELS[env] || 'info',

    // Pretty print in development environments
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        }
      : undefined,

    // Base fields for all log entries
    base: {
      env,
      service: 'accountable-books-api',
      version: process.env.npm_package_version || 'unknown',
    },

    // Timestamp configuration
    timestamp: pino.stdTimeFunctions.isoTime,

    // Error serialization
    serializers: {
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },

    // Redact sensitive information
    redact: {
      paths: [
        'password',
        'token',
        'authorization',
        'cookie',
        'secret',
        'key',
        '*.password',
        '*.token',
        '*.authorization',
        '*.cookie',
        '*.secret',
        '*.key',
        'req.headers.authorization',
        'req.headers.cookie',
      ],
      censor: '[REDACTED]',
    },
  });
}

/**
 * Global logger instance
 */
export const logger = createLogger();

/**
 * Create child logger with additional context
 */
export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Express middleware for request logging
 * Note: Requires pino-http package for full functionality
 */
export function createRequestLogger() {
  // Basic request logging middleware
  return (req: any, res: any, next: any) => {
    const start = Date.now();

    // Log request
    logger.info(
      {
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress,
      },
      'Incoming request',
    );

    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(
        {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
        },
        'Request completed',
      );
    });

    next();
  };
}

/**
 * Structured error logging helper
 */
export function logError(error: Error, context: Record<string, unknown> = {}) {
  logger.error(
    {
      err: error,
      ...context,
    },
    `Error: ${error.message}`,
  );
}

/**
 * Database operation logging helper
 */
export function logDatabaseOperation(
  operation: string,
  table: string,
  context: Record<string, unknown> = {},
) {
  logger.debug(
    {
      operation,
      table,
      ...context,
    },
    `Database ${operation} on ${table}`,
  );
}

/**
 * Performance timing helper
 */
export function logTiming(
  operation: string,
  startTime: number,
  context: Record<string, unknown> = {},
) {
  const duration = Date.now() - startTime;
  logger.info(
    {
      operation,
      duration,
      ...context,
    },
    `${operation} completed in ${duration}ms`,
  );
}

export default logger;
