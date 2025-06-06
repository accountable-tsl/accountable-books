import { CountryList } from "@/types/types";

export const formatPhoneNumber = (input: string, country: CountryList) => {
  // Filter input: keep digits and leading + if present
  const cleaned = input
    .replace(/[^\d+]/g, "") // Remove non-digits except +
    .replace(/(?!^)\+/g, ""); // Remove + unless it's the first character

  // If unknown country, return cleaned input without formatting
  if (country.code === "UNKNOWN") {
    return cleaned;
  }

  // Remove + for formatting purposes
  const digits = cleaned.replace(/\D/g, "");

  // Add a space every 3 or 4 digits for readability
  const formatted = digits.replace(/(\d{3,4})(?=\d)/g, "$1 ");

  // Return with + prefix if it was originally included
  return cleaned.startsWith("+") ? `+${formatted}` : formatted;
};

export const extractPath = (url: string): string => {
  return url.replace(/^.*?\.[\w.]+\//, "");
};

export function toTitleCase(
  text: string,
  options?: {
    delimiter?: string | RegExp;
    joinWith?: string;
    preserveUppercase?: boolean;
  }
) {
  const {
    delimiter = /\s+/,
    joinWith = " ",
    preserveUppercase = true,
  } = options || {};

  return text
    .split(delimiter)
    .filter(Boolean)
    .map((word) => {
      if (preserveUppercase && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(joinWith);
}

/**
 * Returns the last N chars of text, preceded by M asterisks.
 * @param text The string to mask.
 * @param finalCharsLength How many digits to show at the end (default 4).
 * @param maskCount How many asterisks to prepend (default 3).
 */
export function maskDigits(
  text: string,
  finalCharsLength: number = 4,
  maskCount: number = 3
) {
  if (!text) return "";
  const final = text.slice(-finalCharsLength);
  return `${"*".repeat(maskCount)}${final}`;
}

/**
 * Formats a string (e.g., bank account number, identifier) for user-friendly display
 * by showing just the start and end, hiding the middle, or just the end if specified.
 *
 * @param text - The full text to format (e.g., an account number).
 * @param options - Formatting options:
 *   - maxInitialLength: Number of initial characters to show (default: 4)
 *   - finalCharsLength: Number of ending characters to show (default: 4)
 *   - onlyLast: If true, show only the last N characters (finalCharsLength)
 *   - separator: String to show in the middle (default: '... ')
 *   - maskChar: Prefix for the final segment (default: '*')
 *   - minHideLength: Minimum length of string before hiding is triggered (default: 10)
 * @returns The formatted text for display.
 *
 * @example
 *   formatAccountText('1234567890123456') // "1234... *3456"
 *   formatAccountText('1234567890', { onlyLast: true }) // "*7890"
 *   formatAccountText('1234567890', { maxInitialLength: 6, finalCharsLength: 2 }) // "123456... *90"
 */
export function formatAccountText(
  text: string,
  options?: {
    maxInitialLength?: number;
    finalCharsLength?: number;
    onlyLast?: boolean;
    separator?: string;
    maskChar?: string;
    minHideLength?: number;
  }
): string {
  if (!text) return "";

  const {
    maxInitialLength = 4,
    finalCharsLength = 4,
    onlyLast = false,
    separator = "... ",
    maskChar = "*",
    minHideLength = 10,
  } = options || {};

  if (onlyLast) {
    const last = text.slice(-finalCharsLength);
    return `${maskChar}${last}`;
  }

  if (
    text.length <= minHideLength ||
    text.length <= maxInitialLength + finalCharsLength
  ) {
    return text;
  }

  let initialText = text.slice(0, maxInitialLength);
  let finalChars = text.slice(-finalCharsLength);

  // Prevent overlap
  while (initialText && finalChars && initialText.endsWith(finalChars[0])) {
    initialText = initialText.slice(0, -1);
  }

  return `${initialText}${separator}${maskChar}${finalChars}`;
}
