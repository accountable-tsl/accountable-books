import { NODE_ENV } from "../../config/env";
import { ApiResponse } from "../../core/types/api.types";

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
  if (NODE_ENV === "local" || NODE_ENV === "docker.dev") {
    console.error("Error:", error);
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
