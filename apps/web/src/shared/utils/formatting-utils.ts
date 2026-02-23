import type { Country } from '@/shared/types/core';
import { format, isValid, parse } from 'date-fns';
import Decimal from 'decimal.js';
import z from 'zod';

import { getUserLocale } from './random-utils';

const DEFAULT_DATE_FORMAT = 'dd MMM yyyy';
const possibleDateFormats = z.enum([
  'dd-MMM-yyyy',
  'dd MMM yyyy',
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'yyyy-MM-dd',
  'MMM dd, yyyy',
]);
type PossibleDateFormats = z.infer<typeof possibleDateFormats>;

/**
 * Attempts to parse a date string using multiple formats.
 * @param dateString The date string to parse.
 * @returns A Date object if parsing is successful; otherwise, null.
 */
export const parseDateString = (dateString: string | Date): Date | null => {
  for (const formatString of possibleDateFormats.options) {
    const parsedDate = parse(String(dateString), formatString, new Date());
    if (isValid(parsedDate)) {
      return parsedDate;
    }
  }
  // Fallback: Attempt to parse using the built-in Date constructor
  const fallbackDate = new Date(dateString);
  return isValid(fallbackDate) ? fallbackDate : null;
};

/**
 * Formats a Date object into a specified string format.
 * @param date The Date object to format.
 * @param formatString The desired output format.
 * @returns A formatted date string.
 */
export const formatDate = (
  date: Date,
  formatString: string = DEFAULT_DATE_FORMAT,
): string => {
  return format(date, formatString);
};

export function safeFormatDate({
  date,
  formatString = DEFAULT_DATE_FORMAT,
}: {
  date: Date | string | undefined;
  formatString?: PossibleDateFormats;
}) {
  if (!date) return '';

  const parsedDate = parseDateString(date);
  if (!parsedDate) return '';

  try {
    return format(parsedDate, formatString);
  } catch (e) {
    console.warn(`Invalid format string: "${formatString}"`, e);
    return format(parsedDate, DEFAULT_DATE_FORMAT);
  }
}

/**
 * Retrieves the value from an object using the first matching key from a list of possible keys.
 * @param item The object to retrieve the value from.
 * @param possibleKeys An array of possible key names.
 * @returns The value corresponding to the first matching key, or null if none found.
 */
export function getValue(item: any, possibleKeys: string[]): any {
  for (const key of possibleKeys) {
    if (key in item) {
      return item[key];
    }
  }
  return null;
}

export type DateRangeResult = {
  earliestDate: Date | null;
  latestDate: Date | null;
};

/**
 * Finds the earliest and latest dates in an array of objects based on a specific date key
 * @param data Array of objects containing date strings.
 * @param dateKey The key in each object that holds the date string.
 * @returns An object containing the earliest and latest Date objects, or nulls if no valid dates are found.
 */
export const findDateRange = <D>(
  data: D[],
  dateKey: keyof D,
): { earliestDate: Date | null; latestDate: Date | null } => {
  const parsedDates: Date[] = data
    .map((item) => {
      const dateValue = item[dateKey];

      if (dateValue instanceof Date) {
        return dateValue;
      }

      if (typeof dateValue === 'string') {
        return parseDateString(dateValue);
      }
      return null;
    })
    .filter((date): date is Date => date !== null);

  if (parsedDates.length === 0) {
    return { earliestDate: null, latestDate: null };
  }

  const earliestDate = new Date(
    Math.min(...parsedDates.map((d) => d.getTime())),
  );
  const latestDate = new Date(Math.max(...parsedDates.map((d) => d.getTime())));

  return { earliestDate, latestDate };
};

export const formatPhoneNumber = (input: string, country: Country) => {
  // Filter input: keep digits and leading + if present
  const cleaned = input
    .replace(/[^\d+]/g, '') // Remove non-digits except +
    .replace(/(?!^)\+/g, ''); // Remove + unless it's the first character

  // If unknown country, return cleaned input without formatting
  if (country.code === 'UNKNOWN') {
    return cleaned;
  }

  // Remove + for formatting purposes
  const digits = cleaned.replace(/\D/g, '');

  // Add a space every 3 or 4 digits for readability
  const formatted = digits.replace(/(\d{3,4})(?=\d)/g, '$1 ');

  // Return with + prefix if it was originally included
  return cleaned.startsWith('+') ? `+${formatted}` : formatted;
};

export const extractPath = (url: string): string => {
  return url.replace(/^.*?\.[\w.]+\//, '');
};

export function toTitleCase(
  text: string,
  options?: {
    delimiter?: string | RegExp;
    joinWith?: string;
    preserveUppercase?: boolean;
  },
) {
  const {
    delimiter = /\s+/,
    joinWith = ' ',
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
  maskCount: number = 3,
) {
  if (!text) return '';
  const final = text.slice(-finalCharsLength);
  return `${'*'.repeat(maskCount)}${final}`;
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
  },
): string {
  if (!text) return '';

  const {
    maxInitialLength = 4,
    finalCharsLength = 4,
    onlyLast = false,
    separator = '... ',
    maskChar = '*',
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
  const finalChars = text.slice(-finalCharsLength);

  // Prevent overlap
  while (initialText && finalChars && initialText.endsWith(finalChars[0])) {
    initialText = initialText.slice(0, -1);
  }

  return `${initialText}${separator}${maskChar}${finalChars}`;
}

/**
 * Formats a numeric value for financial/accounting display.
 *
 * @param amount - The value to format.
 * @param options - Formatting options.
 *   - currency (optional): The currency code, e.g., 'USD', 'GBP'.
 *   - locale (optional): The locale string, e.g., 'en-US'.
 *   - showSymbol (default: false): If true, include the currency symbol.
 *   - showCode (default: false): If true, append the currency code.
 *   - minFractionDigits (default: 2): Minimum decimal places.
 *   - maxFractionDigits (default: 2): Maximum decimal places.
 *   - accountingNegatives (default: false): If true, show negatives in parentheses.
 * @returns The formatted string.
 */

export interface FormatAmountOptions {
  currency?: string;
  locale?: string;
  showSymbol?: boolean;
  showCode?: boolean;
  minFractionDigits?: number;
  maxFractionDigits?: number;
  accountingNegatives?: boolean;
}

export function formatAmount(
  amount: number | string | Decimal,
  options?: FormatAmountOptions,
): string {
  if (
    amount === null ||
    amount === undefined ||
    (typeof amount === 'string' && amount.trim() === '')
  )
    return '';

  // Convert amount to a JS number for formatting
  let num: number;
  if (typeof amount === 'number') {
    num = amount;
  } else if (typeof amount === 'string') {
    num = parseFloat(amount);
  } else if (amount instanceof Decimal) {
    num = amount.toNumber();
  } else {
    return '';
  }

  if (isNaN(num)) return '';

  const {
    currency,
    locale = getUserLocale(),
    showSymbol = false,
    showCode = false,
    minFractionDigits = 2,
    maxFractionDigits = 2,
    accountingNegatives = false,
  } = options || {};

  const isNegative = num < 0;
  const absNum = accountingNegatives && isNegative ? Math.abs(num) : num;

  let formatted = '';

  if (currency && showSymbol) {
    formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: minFractionDigits,
      maximumFractionDigits: maxFractionDigits,
    }).format(Number(absNum));
  } else {
    formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: minFractionDigits,
      maximumFractionDigits: maxFractionDigits,
    }).format(Number(absNum));
  }

  // Append currency code if needed
  if (showCode && currency) {
    formatted += ` ${currency}`;
  }

  if (isNegative && accountingNegatives) {
    formatted = `(${formatted})`;
  }

  return formatted;
}

/**
 * Formats amount divided by 1,000
 */
export function formatAmountInThousands(
  amount: number | string,
  options?: Parameters<typeof formatAmount>[1],
): string {
  return formatAmount(Number(amount) / 1_000, options);
}

/**
 * Formats amount divided by 1,000,000
 */
export function formatAmountInMillions(
  amount: number | string,
  options?: Parameters<typeof formatAmount>[1],
): string {
  return formatAmount(Number(amount) / 1_000_000, options);
}

/** Unit threshold above which we abbreviate (K, M, B, T). Below it we show the number in full. */
export type CompactAmountUnit = 'thousand' | 'million' | 'billion' | 'trillion';

const COMPACT_THRESHOLDS: Record<CompactAmountUnit, number> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};

const COMPACT_SUFFIXES: Record<CompactAmountUnit, string> = {
  thousand: 'K',
  million: 'M',
  billion: 'B',
  trillion: 'T',
};

/**
 * Format a number: in full (locale + decimals) below the given unit threshold,
 * then abbreviate with suffix (K, M, B, T) at or above it.
 * Pass the unit (e.g. fullUntil: 'billion') to control when we switch to abbreviated.
 */
export function formatAmountCompact(
  val: number,
  options: {
    /** Show in full below this unit; abbreviate at or above it. Default "billion". */
    fullUntil?: CompactAmountUnit;
    locale?: string;
    decimals?: number;
  } = {},
): string {
  const { fullUntil = 'billion', locale = 'en-US', decimals = 2 } = options;
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  const threshold = COMPACT_THRESHOLDS[fullUntil];

  if (abs < threshold) {
    return `${sign}${abs.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }

  if (abs >= COMPACT_THRESHOLDS.trillion)
    return `${sign}${(abs / COMPACT_THRESHOLDS.trillion).toFixed(decimals)}${COMPACT_SUFFIXES.trillion}`;
  if (abs >= COMPACT_THRESHOLDS.billion)
    return `${sign}${(abs / COMPACT_THRESHOLDS.billion).toFixed(decimals)}${COMPACT_SUFFIXES.billion}`;
  if (abs >= COMPACT_THRESHOLDS.million)
    return `${sign}${(abs / COMPACT_THRESHOLDS.million).toFixed(decimals)}${COMPACT_SUFFIXES.million}`;
  if (abs >= COMPACT_THRESHOLDS.thousand)
    return `${sign}${(abs / COMPACT_THRESHOLDS.thousand).toFixed(decimals)}${COMPACT_SUFFIXES.thousand}`;

  return `${sign}${abs.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
