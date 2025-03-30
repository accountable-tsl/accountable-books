import { format, parse, isValid } from "date-fns";
import Decimal from "decimal.js";
import numeral from "numeral";
import { ScreenSize } from "../types/types";
import React from "react";
import dayjs from "dayjs";

const possibleDateFormats: string[] = [
  "dd-MMM-yyyy",
  "dd MMM yyyy",
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "yyyy-MM-dd",
  // more formats can be added as needed
];

/**
 * Attempts to parse a date string using multiple formats.
 * @param dateString The date string to parse.
 * @returns A Date object if parsing is successful; otherwise, null.
 */
export const parseDateString = (dateString: string | Date): Date | null => {
  for (const formatString of possibleDateFormats) {
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
  formatString: string = "dd MMM yyyy"
): string => {
  return format(date, formatString);
};

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

/**
 * Finds the earliest and latest dates in an array of objects based on a specific date key
 * @param data Array of objects containing date strings.
 * @param dateKey The key in each object that holds the date string.
 * @returns An object containing the earliest and latest Date objects, or nulls if no valid dates are found.
 */
export const findDateRange = <D>(
  data: D[],
  dateKey: keyof D
): { earliestDate: Date | null; latestDate: Date | null } => {
  const parsedDates: Date[] = data
    .map((item) => {
      const dateValue = item[dateKey];

      if (dateValue instanceof Date) {
        return dateValue;
      }

      if (typeof dateValue === "string") {
        return parseDateString(dateValue);
      }
      return null;
    })
    .filter((date): date is Date => date !== null);

  if (parsedDates.length === 0) {
    return { earliestDate: null, latestDate: null };
  }

  const earliestDate = new Date(
    Math.min(...parsedDates.map((d) => d.getTime()))
  );
  const latestDate = new Date(Math.max(...parsedDates.map((d) => d.getTime())));

  return { earliestDate, latestDate };
};

/**
 * Formats a numeric value with commas as thousands separators.
 * @param value The input value to format. Can be a number, string, or other types.
 * @returns A string with the numeric value formatted with commas, or an empty string if the input is invalid.
 */
export function formatNumericValue(value: any): string {
  if (value === null || value === undefined) return "";

  const strValue =
    typeof value === "object" && value.toString
      ? value.toString()
      : String(value);

  if (!/^[-+]?\d*\.?\d*$/.test(strValue)) return value;

  const [integerPart, decimalPart] = strValue.split(".");

  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimalPart !== undefined
    ? `${formattedInteger}.${decimalPart}`
    : formattedInteger;
}

export function formatAccountText(
  text: string,
  maxInitialLength?: number,
  finalCharsLength?: number
): string {
  if (!text) return "";
  if (
    (maxInitialLength && text.length <= maxInitialLength) ||
    text.length <= 10
  )
    return text;

  let initialText = text.slice(0, maxInitialLength);
  let finalChars = text.slice(finalCharsLength ? -finalCharsLength : -4);

  // Ensure no overlap between initialText and finalChars
  while (initialText.endsWith(finalChars[0])) {
    initialText = initialText.slice(0, -1);
  }

  return `${initialText}... *${finalChars}`;
}

/**
 * Converts a date or timestamp into a human-readable relative time string (e.g., "Just now", "3 minutes ago", "1 hour ago").
 * Uses the Intl.RelativeTimeFormat API for localization.
 *
 * @param dateInput - The date or date string to format.
 * @param locale - (Optional) The locale code (e.g., "en", "fr", "es"). Defaults to "en".
 * @returns A string representing the time elapsed in a human-readable format.
 *
 * @example
 * timeAgo("2025-02-03T10:30:00Z"); // "2 hours ago"
 * timeAgo(new Date()); // "Just now"
 * timeAgo("2025-02-03T10:30:00Z", "fr"); // "il y a 2 heures"
 */
export function timeAgo(dateInput: Date | string, locale: string = "en") {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  const intervals: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
    { unit: "year", seconds: 31536000 },
    { unit: "month", seconds: 2592000 },
    { unit: "week", seconds: 604800 },
    { unit: "day", seconds: 86400 },
    { unit: "hour", seconds: 3600 },
    { unit: "minute", seconds: 60 },
    { unit: "second", seconds: 1 },
  ];

  // Use user-defined locale for localization
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  for (const interval of intervals) {
    const count = Math.floor(diffInSeconds / interval.seconds);
    if (count >= 1) {
      return rtf.format(-count, interval.unit);
    }
  }

  return rtf.format(0, "second"); // "Just now" in different languages
}

/**
 * Converts a string to title case, capitalizing the first letter of each word
 * and converting the rest of the word to lowercase.
 *
 * - Handles multiple spaces and punctuation correctly.
 * - Useful for formatting names, titles, or user-facing strings.
 *
 * @param str - The input string to convert.
 * @returns A new string formatted in title case. If the input is empty, an empty string is returned.
 */

export function toTitleCase(str: string): string {
  return str.replace(
    /\w\S*/g,
    (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

export const parseDecimal = (value: unknown) => {
  if (typeof value === "number") {
    return new Decimal(value);
  }

  if (typeof value === "string") {
    const parsedValue = numeral(value).value();
    return parsedValue !== null ? new Decimal(parsedValue) : new Decimal(0);
  }

  return new Decimal(0);
};

export const SCREEN_BREAKPOINTS = {
  mobile: 640,
  tablet: 768,
  desktop: 1280,
};

/**
 * Detect current screen size
 * @returns {ScreenSize} Current screen size category
 */
export const getScreenSize = (): ScreenSize => {
  if (typeof window === "undefined") return ScreenSize.Desktop;

  const width = window.innerWidth;

  if (width < SCREEN_BREAKPOINTS.tablet) {
    return ScreenSize.Mobile;
  } else if (width < SCREEN_BREAKPOINTS.desktop) {
    return ScreenSize.Tablet;
  } else {
    return ScreenSize.Desktop;
  }
};

/**
 * React hook for reactive screen size detection
 * @returns {ScreenSize} Current screen size category
 */
export const useScreenSize = () => {
  const [screenSize, setScreenSize] = React.useState<ScreenSize>(
    getScreenSize()
  );

  React.useEffect(() => {
    const handleResize = () => {
      setScreenSize(getScreenSize());
    };

    // Add event listener
    window.addEventListener("resize", handleResize);

    // Clean up
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return screenSize;
};

/**
 * Check if current screen size matches a specific size category
 * @param {ScreenSize} size - Size category to check
 * @returns {boolean} Whether current screen matches the given size
 */
export const isScreenSize = (size: ScreenSize): boolean => {
  return getScreenSize() === size;
};

/**
 * Check if screen is smaller than a specific size category
 * @param {ScreenSize} size - Size category to compare against
 * @returns {boolean} Whether screen is smaller than the given size
 */
export const isScreenSmallerThan = (size: ScreenSize): boolean => {
  const currentSize = getScreenSize();

  switch (size) {
    case ScreenSize.Mobile:
      return false;
    case ScreenSize.Tablet:
      return currentSize === ScreenSize.Mobile;
    case ScreenSize.Desktop:
      return (
        currentSize === ScreenSize.Mobile || currentSize === ScreenSize.Tablet
      );
  }
};

export const normalizeDate = (input: string | Date | dayjs.Dayjs): Date => {
  const cleanInput = typeof input === "string" ? input.trim() : input;

  const parsedDate = dayjs.isDayjs(cleanInput) ? cleanInput : dayjs(cleanInput);

  if (!parsedDate.isValid()) {
    throw new Error("Invalid date format");
  }

  return parsedDate.startOf("day").toDate();
};
