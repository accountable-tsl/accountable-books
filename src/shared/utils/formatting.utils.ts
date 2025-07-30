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

export function snakeToCamel<T>(input: T): SnakeToCamelCaseObject<T> {
  if (!input || typeof input !== "object" || input instanceof Date)
    return input as any;

  if (Array.isArray(input)) {
    return input.map(snakeToCamel) as any;
  }

  return Object.entries(input).reduce(
    (acc, [key, value]) => {
      if (typeof key !== "string") return acc; // Skip non-string keys
      const camelKey = key.includes("_") ? toCamelCase(key) : key;
      acc[camelKey] = snakeToCamel(value);
      return acc;
    },
    {} as Record<string, any>
  ) as any;
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

/**
 * Creates a Zod schema that preprocesses input by converting camelCase
 * keys to snake_case before validation.
 *
 * This is useful for ensuring that input objects have keys in the expected
 * snake_case format when interfacing with systems or databases that use
 * snake_case naming conventions.
 *
 * @param snakeSchema - The Zod schema to apply after preprocessing.
 * @returns A Zod schema with preprocessing to convert camelCase keys to snake_case.
 */

export function createCamelCaseSchema<T extends z.ZodTypeAny>(snakeSchema: T) {
  return z.preprocess(camelToSnake, snakeSchema);
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

interface FilterOptions {
  deep?: boolean;
  filterUndefined?: boolean;
  filterEmptyStrings?: boolean;
}

/**
 * Filters out null values from an object
 * @param obj - The object to filter
 * @param options - Configuration options
 * @param options.deep - Whether to recursively filter nested objects (default: true)
 * @param options.filterUndefined - Whether to also filter undefined values (default: false)
 * @param options.filterEmptyStrings - Whether to also filter empty strings (default: false)
 * @returns New object with filtered values removed
 */
function filterNulls<T>(obj: T, options: FilterOptions = {}): T {
  const {
    deep = true,
    filterUndefined = false,
    filterEmptyStrings = false,
  } = options;

  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => {
        if (item === null) return false;
        if (filterUndefined && item === undefined) return false;
        if (filterEmptyStrings && item === "") return false;
        return true;
      })
      .map((item) =>
        deep && isPlainObject(item) ? filterNulls(item, options) : item
      ) as T;
  }

  // Handle objects
  if (isPlainObject(obj)) {
    const result: any = {};

    for (const key of Object.keys(obj)) {
      const value = (obj as any)[key];

      if (value === null) continue;
      if (filterUndefined && value === undefined) continue;
      if (filterEmptyStrings && value === "") continue;

      // Recursively filter nested objects/arrays if deep option is true
      if (deep && (Array.isArray(value) || isPlainObject(value))) {
        result[key] = filterNulls(value, options);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  // Return primitive values as-is
  return obj;
}

// Convenience functions for common use cases
export const removeNulls = <T>(obj: T): T => filterNulls(obj);

export const removeNullsShallow = <T>(obj: T): T =>
  filterNulls(obj, { deep: false });

export const removeNullsAndUndefined = <T>(obj: T): T =>
  filterNulls(obj, { filterUndefined: true });

export const removeAllEmpty = <T>(obj: T): T =>
  filterNulls(obj, { filterUndefined: true, filterEmptyStrings: true });
