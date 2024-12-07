import { format, parse, isValid } from "date-fns";

type DateFormats = "dd-MMM-yyyy" | "dd MMM yyyy" | "dd/MM/yyyy";

export const parseDate = (
  dateString: string,
  returnFormat: string = "dd MMM yyyy"
) => {
  if (!dateString) {
    return null;
  }

  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    return null;
  }

  return format(date, returnFormat);
};

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
export const parseDateString = (dateString: string): Date | null => {
  for (const formatString of possibleDateFormats) {
    const parsedDate = parse(dateString, formatString, new Date());
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
