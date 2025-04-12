import Decimal from "decimal.js";
import { ApiResponse } from "../types/generic";
import crypto from "crypto";
import { NODE_ENV } from "../config/env";

export function generateRandomToken(length = 48): string {
  return crypto.randomBytes(length).toString("hex");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Define a safe Base58 alphabet (avoiding ambiguous characters).
const SAFE_BASE58 =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Generates a secure random short code using the SAFE_BASE58 alphabet.
 * Uses rejection sampling to ensure a uniform distribution.
 *
 * @param length - The desired length of the short code (default 8).
 * @returns A secure, random short code.
 */
export default function generateSecureShortCode(length = 8): string {
  let code = "";
  const maxByte = 232; // 58 * 4 = 232 (avoids modulo bias)

  // Keep generating random bytes until we have the desired length.
  while (code.length < length) {
    // Generate one random byte.
    const byte = crypto.randomBytes(1)[0];

    // Only use the byte if it is within [0, 232) to avoid modulo bias.
    if (byte < maxByte) {
      code += SAFE_BASE58[byte % 58];
    }
  }

  return code;
}

export const toNum = (val: Decimal | number | string) =>
  val instanceof Decimal ? val.toNumber() : Number(val);

export function safeDecimal(value: string | number): string {
  const decimal = new Decimal(value);
  if (decimal.isNaN() || !decimal.isFinite()) {
    throw new Error(`Invalid decimal: ${value}`);
  }
  return decimal.toString();
}

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
  if (NODE_ENV === "development") {
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
export function camelToSnake<T>(input: T): T {
  if (
    !input ||
    input === null ||
    typeof input !== "object" ||
    input instanceof Date
  )
    return input;

  if (Array.isArray(input)) {
    return input.map((item) => camelToSnake(item)) as T;
  }

  return Object.keys(input).reduce(
    (acc, key) => {
      const snakeKey = key
        .replace(/([A-Z]+)/g, "_$1")
        .toLowerCase()
        .replace(/^_/, "");
      acc[snakeKey] = camelToSnake((input as Record<string, any>)[key]);
      return acc;
    },
    {} as Record<string, any>
  ) as T;
}

export function snakeToCamel<T>(input: T): T {
  if (
    !input ||
    input === null ||
    typeof input !== "object" ||
    input instanceof Date
  )
    return input;

  if (Array.isArray(input)) {
    return input.map((item) => snakeToCamel(item)) as T;
  }

  return Object.keys(input).reduce(
    (acc, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, char) =>
        char.toUpperCase()
      );
      acc[camelKey] = snakeToCamel((input as Record<string, any>)[key]);
      return acc;
    },
    {} as Record<string, any>
  ) as T;
}

export const splitIntoWords = (input: string | string[]): string[] => {
  const text = Array.isArray(input) ? input.join(" ") : input;
  const words = text
    .trim()
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word !== "");

  return words;
};
