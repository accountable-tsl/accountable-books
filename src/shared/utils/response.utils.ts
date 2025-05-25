import { isProd, NODE_ENV } from "../../config/env";
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
  message: string = "Something went wrong",
  error?: unknown,
  code: ErrorCode = ErrorCode.GENERIC,
  report: boolean = false
): ApiResponse<T> {
  let parsedError: string | object | undefined = undefined;
  let finalMessage = message;
  let finalCode = code;
  let shouldReport = report;

  if (error instanceof AppError) {
    parsedError = error.details ?? error.message;
    finalMessage = error.message;
    finalCode = error.code;
    shouldReport = error.shouldReport;
  } else if (error instanceof Error) {
    parsedError = error.message;
  } else if (typeof error === "string") {
    parsedError = error;
  } else if (typeof error === "object") {
    parsedError = error ?? undefined;
  }

  if (isProd && shouldReport) {
    Sentry.captureException(
      error instanceof Error ? error : new Error(finalMessage),
      {
        extra: { error: parsedError, code: finalCode },
      }
    );
  }

  // if (!isProd) {
  //   console.error("Error:", error);
  // }
  if (!isProd) {
    if (error instanceof AppError) {
      console.error("[AppError]", {
        message: error.message,
        code: error.code,
        details: error.details,
      });
    } else if (error instanceof Error) {
      console.error("[Error]", error.message);
    } else if (error === undefined || error === null) {
      console.error("[Error] Received undefined or null error");
    } else {
      console.error("[Error]", error);
    }
  }

  return {
    success: false,
    message: finalMessage,
    code: finalCode,
    error: parsedError,
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
  GENERIC = "GENERIC_ERROR",
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  NO_ROLES = "NO_ROLES",
  ONBOARDING_INCOMPLETE = "ONBOARDING_INCOMPLETE",
}

export class AppError extends Error {
  public code: ErrorCode;
  public details?: any;
  public shouldReport: boolean;
  constructor(
    message: string,
    details?: any,
    report?: boolean,
    code: ErrorCode = ErrorCode.GENERIC
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
    this.shouldReport = report ?? false; // default: not reported
  }
}
