import { ENV, isProd } from "../../config/env";
import crypto from "crypto";

export const splitIntoWords = (input: string | string[]): string[] => {
  const text = Array.isArray(input) ? input.join(" ") : input;
  const words = text
    .trim()
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word !== "");

  return words;
};

export function getAppUrl(firmSlug?: string): string {
  const baseDomain =
    ENV.BASE_DOMAIN || (isProd ? "getaccountable.com" : "lvh.me");
  const frontendPort = ENV.FRONTEND_PORT || "5173";
  const protocol = isProd ? "https" : "http";
  const portSegment = !isProd && frontendPort ? `:${frontendPort}` : "";
  const subdomain = firmSlug ? `${firmSlug}.` : "app.";

  return `${protocol}://${subdomain}${baseDomain}${portSegment}`;
}

/**
 * Type for inputs that can be used to generate cache keys.
 * Allows strings, numbers, or objects for flexible key creation.
 */
type CacheKeyInput = string | number | Record<string, unknown>;

/**
 * Normalizes input to a consistent string format for cache key generation.
 * @param input - The input to normalize (string, number, object, or array).
 * @returns A string representation of the input.
 * @example
 * normalizeInput({ b: 1, a: 2 }) // '{"a":2,"b":1}'
 * normalizeInput([1, 2]) // '[1,2]'
 * normalizeInput(123) // '123'
 */

export function normalizeInput(input: CacheKeyInput): string {
  // Handle arrays by normalizing each element
  if (Array.isArray(input)) {
    return `[${input.map(normalizeInput).join(",")}]`;
  }

  // Handle objects by sorting keys for consistent JSON stringification
  if (typeof input === "object" && input !== null) {
    const sortedObj: Record<string, unknown> = {};
    Object.keys(input)
      .sort() // Sort keys to ensure consistent output
      .forEach((key) => {
        sortedObj[key] = normalizeInput(input[key] as CacheKeyInput); // Recursively normalize
      });
    return JSON.stringify(sortedObj);
  }
  // Convert non-objects to strings
  return String(input);
}

/**
 * Generates a Redis-compatible cache key by combining a prefix with normalized arguments.
 * @param prefix - A required string to namespace the cache key (e.g., 'user').
 * @param args - Variable inputs (strings, numbers, or objects) to include in the key.
 * @returns A Redis-compatible cache key string.
 * @throws Error if prefix is empty or not provided.
 * @example
 * generateCacheKey('user', 123, { role: 'admin' }) // 'user:123:{"role":"admin"}'
 */
export function generateCacheKey(
  prefix: string,
  ...args: CacheKeyInput[]
): string {
  // Validate prefix
  if (!prefix) {
    throw new Error("Prefix is required for cache key");
  }

  // Normalize and join arguments with colons
  const normalizedArgs = args.map(normalizeInput).join(":");
  const keyString = `${prefix}:${normalizedArgs}`;

  // Shorten long keys (>256 chars) with MD5 hash to keep keys manageable
  if (keyString.length > 256) {
    const hash = crypto.createHash("md5").update(keyString).digest("hex");
    return `${prefix}:${hash}`;
  }

  return keyString;
}
