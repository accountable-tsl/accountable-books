import { format, parse, isValid } from "date-fns";

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
