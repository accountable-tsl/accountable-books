/**
 * Recursively converts object keys from camelCase or PascalCase to snake_case.
 * Leaves values and non-string keys unchanged.
 *
 * Useful for preparing objects before inserting into snake_case databases.
 */

import { z } from "zod";

export function camelToSnake<T>(input: T): T {
  if (!input || typeof input !== "object" || input instanceof Date)
    return input;

  if (Array.isArray(input)) {
    return input.map(camelToSnake) as T;
  }

  return Object.entries(input).reduce(
    (acc, [key, value]) => {
      if (typeof key !== "string") return acc; // Skip non-string keys
      const snakeKey = toSnakeCase(key);
      acc[snakeKey] = camelToSnake(value);
      return acc;
    },
    {} as Record<string, any>
  ) as T;
}

/**
 * Recursively converts object keys from snake_case to camelCase.
 * Leaves values and non-string keys unchanged.
 *
 * Useful for converting DB results to frontend-friendly format.
 */

export function snakeToCamel<T>(input: T): T {
  if (!input || typeof input !== "object" || input instanceof Date)
    return input;

  if (Array.isArray(input)) {
    return input.map(snakeToCamel) as T;
  }

  return Object.entries(input).reduce(
    (acc, [key, value]) => {
      if (typeof key !== "string") return acc; // Skip non-string keys
      const camelKey = key.includes("_") ? toCamelCase(key) : key;
      acc[camelKey] = snakeToCamel(value);
      return acc;
    },
    {} as Record<string, any>
  ) as T;
}

/**
 * Converts a single string from camelCase or PascalCase to snake_case.
 *
 * Handles acronyms (e.g., XMLParser → xml_parser),
 * collapses multiple underscores, trims edge underscores.
 */

export function toSnakeCase(str: string): string {
  if (!str) return str;
  return str
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // camelCase
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, "$1_$2") // Acronyms (XMLParser)
    .replace(/__+/g, "_") // Collapse multiple underscores
    .toLowerCase()
    .replace(/^_+|_+$/g, ""); // Trim leading/trailing underscores
}

/**
 * Converts a single snake_case string to camelCase.
 * If input is already in camelCase or PascalCase, returns a safe normalized version.
 *
 * Handles double underscores and trims edge underscores.
 */
export function toCamelCase(str: string): string {
  if (!str) return str;
  return str
    .replace(/[_]+/g, "_") // Collapse underscores
    .replace(/^_+|_+$/g, "") // Trim underscores
    .toLowerCase()
    .replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase())
    .replace(/^([A-Z])/, (_, char) => char.toLowerCase());
}

export function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    uuid
  );
}
export function getIdentifierType(id: string): "uuid" | "shortCode" {
  if (!id || typeof id !== "string" || id.length > 40) {
    throw new Error("Invalid company identifier");
  }

  // Regex to check if it's a valid UUID (v1, v2, v3, v4, v5)
  const isUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  return isUUID ? "uuid" : "shortCode";
}

export type SnakeToCamelCase<S extends string> =
  S extends `${infer T}_${infer U}`
    ? `${Lowercase<T>}${Capitalize<SnakeToCamelCase<U>>}`
    : S;

export type SnakeToCamelCaseObject<T> = {
  [K in keyof T as K extends string
    ? SnakeToCamelCase<K>
    : K]: T[K] extends object ? SnakeToCamelCaseObject<T[K]> : T[K];
};

export function createCamelCaseSchema<T extends z.ZodTypeAny>(snakeSchema: T) {
  return z.preprocess(camelToSnake, snakeSchema);
}
