import { isProd, NODE_ENV } from '../../config/env.js';
import type { ApiResponse } from '../../core/types/api.types.js';
import * as Sentry from '@sentry/node';

export function successResponse<T>(
  message = 'Query successful',
  data: T,
): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
  };
}

export function errorResponse<T = null>(
  message: string = 'Something went wrong',
  error?: unknown,
  options: {
    code?: ErrorCode;
    report?: boolean;
    metadata?: Record<string, unknown>;
  } = {
    code: ErrorCode.GENERIC,
    report: false,
  },
): ApiResponse<T> {
  let parsedError: string | Record<string, unknown> | string[] | undefined =
    undefined;
  let finalMessage = message;
  let finalCode = options.code;
  let shouldReport = options.report;

  if (error instanceof AppError) {
    parsedError = error.details ?? error.message;
    finalMessage = error.message;
    finalCode = error.code;
    shouldReport = error.shouldReport;
  } else if (error instanceof Error) {
    parsedError = error.message;
  } else if (typeof error === 'string') {
    parsedError = error;
  } else if (typeof error === 'object' && error !== null) {
    parsedError = error as Record<string, unknown>;
  }

  if (isProd && shouldReport) {
    Sentry.captureException(
      error instanceof Error ? error : new Error(finalMessage),
      {
        extra: { error: parsedError, code: finalCode },
      },
    );
  }

  // if (!isProd) {
  //   console.error("Error:", error);
  // }
  if (!isProd) {
    if (error instanceof AppError) {
      console.error('[AppError]', {
        message: error.message,
        code: error.code,
        details: error.details,
      });
    } else if (error instanceof Error) {
      console.error('[Error]', error.message);
    } else if (error === undefined || error === null) {
      console.error('[Error] Received undefined or null error');
    } else {
      console.error('[Error]', error);
    }
  }

  return {
    success: false,
    message: finalMessage,
    code: finalCode,
    error: parsedError,
    ...options.metadata,
  };
}

// export const throwError = (message: string, errorDetails?: any): never => {
//   if (!isProd) console.error(message, errorDetails);

//   if (isProd)
//     Sentry.captureException(new Error(message), { extra: errorDetails });

//   throw new Error(message);
// };

// export function ensure<T>(
//   value: T | undefined | null,
//   errorMessage: string,
//   errorDetails?: any
// ): asserts value is T {
//   if (!value) {
//     throwError(errorMessage, errorDetails);
//   }
// }

export enum ErrorCode {
  // 1xx: Authentication & Authorization
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  NO_ROLES = 'NO_ROLES',
  UNAUTHORIZED = 'UNAUTHORIZED', // No login or invalid session
  FORBIDDEN = 'FORBIDDEN', // Logged in but no permission

  // 2xx: Validation & Input
  INVALID_INPUT = 'INVALID_INPUT',
  CONFLICT = 'CONFLICT', // e.g. duplicate short_code or email

  // 3xx: Not Found
  NOT_FOUND = 'NOT_FOUND', // resource "not found"

  // 4xx: Business Logic / Domain Rules
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED', // e.g. trying to delete demo company
  ONBOARDING_INCOMPLETE = 'ONBOARDING_INCOMPLETE', // e.g. user or company onboarding not complete

  // 5xx: System/Internal Errors
  GENERIC = 'GENERIC_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export class AppError extends Error {
  public code: ErrorCode;
  public details?: any;
  public shouldReport: boolean;
  constructor(
    message: string,
    details?: any,
    report?: boolean,
    code: ErrorCode = ErrorCode.GENERIC,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.shouldReport = report ?? false; // default: not reported
  }
}
