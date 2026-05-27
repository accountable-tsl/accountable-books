import type { Logger, LoggerOptions } from 'pino';
import pino from 'pino';

import { getRequestContext } from '../telemetry/request-context.js';

export const LOG_LEVELS = {
  local: 'debug',
  test: 'silent',
  staging: 'info',
  production: 'info',
} as const;

function createLogger() {
  const env = (process.env.NODE_ENV as keyof typeof LOG_LEVELS) || 'local';
  const isDevelopment = env === 'local';

  const options: LoggerOptions = {
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

    mixin() {
      const context = getRequestContext();
      if (!context) return {};

      return {
        requestId: context.requestId,
        correlationId: context.correlationId,
        ...(context.userId ? { userId: context.userId } : {}),
        ...(context.companyId ? { companyId: context.companyId } : {}),
        processSource: context.processSource,
      };
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
  };

  return pino(options);
}

/**
 * Global logger instance
 */
const baseLogger = createLogger();

export const logger = baseLogger;

export function getLogger(bindings?: Record<string, unknown>): Logger {
  if (!bindings || Object.keys(bindings).length === 0) {
    return baseLogger;
  }

  return baseLogger.child(bindings);
}

/**
 * Create child logger with additional context
 */
export function createChildLogger(context: Record<string, unknown>) {
  return getLogger(context);
}

export default logger;
