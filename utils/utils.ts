import { Decimal } from "@prisma/client/runtime/library";
import { getExchangeRate } from "../models/exRateModel";

/**
 * Convert object keys to lowercase.
 * @param {Object} data - Object with string keys.
 * @returns {Object} New object with lowercase keys.
 */
export function normalizeData(data: { [key: string]: string }): {
  [key: string]: string;
} {
  return Object.keys(data).reduce<{ [key: string]: string }>((acc, key) => {
    acc[key.toLowerCase()] = data[key];
    return acc;
  }, {});
}

/**
 * Detect input format: JSON or CSV.
 * Expected input is JSON from req.body or CSV file uploaded
 * @param {any} input - File or string input.
 * @returns {string} 'csv', 'json', or 'unknown'.
 */
export function simpleInputFormatDetect(input: any): string {
  const inputType =
    input instanceof File
      ? "file"
      : typeof input === "string"
        ? "string"
        : "unknown";

  if (
    inputType === "file" &&
    (input.name.toLowerCase().endsWith(".csv") || input.type === "text/csv")
  ) {
    return "csv";
  } else {
    try {
      JSON.parse(input);
      return "json";
    } catch (error) {}
    return "unknown";
  }
}

/**
 * Convert a string to title case.
 * @param {string} text - Input string.
 * @returns {string} Title-cased string.
 */
export function toTitleCase(text: string) {
  return text.replace(/\w\S*/g, (txt) =>
    txt === txt.toUpperCase()
      ? txt
      : txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
  );
}

/**
 * Truncate text to a specified length and add ellipsis.
 * @param {string} input - The text to truncate.
 * @param {number} maxLength - Maximum length of the text.
 * @returns {string} Truncated text with ellipsis.
 */
export function truncateText(input: string, maxLength: number) {
  return input.length > maxLength ? input.slice(0, maxLength) + "..." : input;
}

/**
 * Identifies objects in an array that are missing specific required keys.
 * @param {Object[]} array - The array of objects to validate.
 * @param {string[]} requiredKeys - The list of keys that each object must have.
 * @returns {Object[]} An array of objects containing the index of invalid objects and the missing keys.

 */
export function findInvalidObjects(array: any[], requiredKeys: string[]) {
  const invalidObjects: any[] = [];

  array.forEach((item, index) => {
    const missingKeys = requiredKeys.filter((key) => !(key in item));

    if (missingKeys.length > 0) {
      invalidObjects.push({
        index,
        missingKeys,
      });
    }
  });

  return invalidObjects;
}

export async function determineExchangeRate(
  date: Date | string,
  baseCurrencyId: string,
  targetCurrencyId: string
): Promise<Decimal | null> {
  try {
    if (baseCurrencyId === targetCurrencyId) {
      return new Decimal(1);
    }

    const exr = await getExchangeRate(
      new Date(date as string),
      baseCurrencyId as string,
      targetCurrencyId as string
    );

    if (exr.success && exr.data?.rate) {
      return new Decimal(exr.data.rate);
    } else {
      console.error(
        `Failed to determine exchange rate for ${baseCurrencyId} to ${targetCurrencyId} on ${new Date(date).toLocaleDateString()}`
      );
      return null;
    }
  } catch (error) {
    console.error(
      `Error determining exchange rate for ${baseCurrencyId} to ${targetCurrencyId} on ${date}:`,
      error
    );
    return null;
  }
}

/**
 * Removes undefined or null properties from an object.
 * @param {Object} obj - The object to filter.
 * @returns {Object} A new object containing only properties with defined (non-undefined and non-null) values.
 */
export function filterUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([_, value]) => value !== undefined && value !== null
    )
  ) as Partial<T>;
}

export function compareDbAndUserObject<
  DB extends Record<string, any>,
  User extends Record<string, any>,
>(dbObj: DB, userObj: User): Partial<User> {
  const differences: Partial<User> = {};

  for (const key in userObj) {
    const dbValue = dbObj[key as keyof DB] as unknown;
    const userValue = userObj[key as keyof User];

    if (!(key in dbObj) || dbValue !== userValue) {
      differences[key] = userValue;
    }
  }

  return differences;
}
