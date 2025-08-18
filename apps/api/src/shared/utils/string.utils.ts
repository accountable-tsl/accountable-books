import { ENV, isProd } from '../../config/env.js';
import crypto from 'crypto';

export const splitIntoWords = (input: string | string[]): string[] => {
  const text = Array.isArray(input) ? input.join(' ') : input;
  const words = text
    .trim()
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word !== '');

  return words;
};

export function getAppUrl(firmSlug?: string): string {
  const baseDomain = ENV.BASE_DOMAIN || (isProd ? 'getaccountable.com' : 'lvh.me');
  const frontendPort = ENV.FRONTEND_PORT || '5173';
  const protocol = isProd ? 'https' : 'http';
  const portSegment = !isProd && frontendPort ? `:${frontendPort}` : '';
  const subdomain = firmSlug ? `${firmSlug}.` : 'app.';

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
    return `[${input.map(normalizeInput).join(',')}]`;
  }

  // Handle objects by sorting keys for consistent JSON stringification
  if (typeof input === 'object' && input !== null) {
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
export function generateCacheKey(prefix: string, ...args: CacheKeyInput[]): string {
  // Validate prefix
  if (!prefix) {
    throw new Error('Prefix is required for cache key');
  }

  // Normalize and join arguments with colons
  const normalizedArgs = args.map(normalizeInput).join(':');
  const keyString = `${prefix}:${normalizedArgs}`;

  // Shorten long keys (>256 chars) with MD5 hash to keep keys manageable
  if (keyString.length > 256) {
    const hash = crypto.createHash('md5').update(keyString).digest('hex');
    return `${prefix}:${hash}`;
  }

  return keyString;
}

/**
 * Get last N digits of a string
 */
export function getLastNDigits(str: string, n: number): string {
  return str.slice(-n);
}

/**
 * Calculate string similarity using Levenshtein distance
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  const matrix = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator, // substitution
      );
    }
  }

  const maxLength = Math.max(str1.length, str2.length);
  return (maxLength - matrix[str2.length][str1.length]) / maxLength;
}
