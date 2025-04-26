import { isProduction, NODE_ENV } from "../../config/env";
import { ApiResponse } from "../../core/types/api.types";
import * as Sentry from "@sentry/node";

export function successResponse<T>(
  message = "Query successful",
  data: T | T[] | Partial<T> | null
): ApiResponse {
  return {
    success: true,
    message,
    data,
  };
}

export function errorResponse<T = null>(
  message = "Something went wrong",
  error?: unknown
): ApiResponse {
  if (!isProduction) {
    console.error("Error:", error);
  }

  if (isProduction && error) {
    Sentry.captureException(
      error instanceof Error ? error : new Error(message),
      {
        extra: { error },
      }
    );
  }

  let parsedError: string | Record<string, any> | string[] | undefined;

  if (error instanceof Error) {
    parsedError = error.message;
  } else if (Array.isArray(error) || typeof error === "object") {
    parsedError = error as any;
  } else if (typeof error === "string") {
    parsedError = error;
  }

  return {
    success: false,
    message,
    error: parsedError,
    data: null,
  };
}

export const throwError = (message: string, errorDetails?: any): never => {
  if (!isProduction) console.error(message, errorDetails);

  if (isProduction)
    Sentry.captureException(new Error(message), { extra: errorDetails });

  throw new Error(message);
};

export function ensure<T>(
  value: T | undefined | null,
  errorMessage: string,
  errorDetails?: any
): asserts value is T {
  if (value == null) {
    // Loose equality here is deliberate
    throwError(errorMessage, errorDetails);
  }
}
