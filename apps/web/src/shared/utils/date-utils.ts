import z from 'zod';
import {
  add,
  sub,
  format as formatDate,
  isValid,
  parse as parseDateFns,
  lastDayOfMonth,
  isLastDayOfMonth,
  isBefore,
  type Duration,
  startOfDay,
  endOfDay,
} from 'date-fns';

// Use plural units for date-fns compatibility
const dateUnitSchema = z.enum(['days', 'weeks', 'months', 'years']);
export type DateUnit = z.infer<typeof dateUnitSchema>;

// Accept both yyyy-MM-dd and yyyy-M-d formats
const dateStringSchema = z.string().refine((dateStr) => {
  const formats = ['yyyy-MM-dd', 'yyyy-M-d'];
  return formats.some((format) => isValid(parseDateFns(dateStr, format, new Date())));
}, 'Invalid date. Use YYYY-MM-DD or YYYY-M-D format (e.g., 2025-01-15 or 2025-1-15)');

// Validate day exists in month (e.g., no April 31)
function validateDayInMonth(year: number, month: number, day: number): void {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
    throw new Error(
      `Invalid date: ${year}-${month}-${day} (day ${day} does not exist in month ${month})`,
    );
  }
}

const optionsSchema = z
  .object({
    // Day/Month inputs
    startDay: z.int().min(1).max(31).optional(),
    startMonth: z.int().min(1).max(12).optional(),
    endDay: z.int().min(1).max(31).optional(),
    endMonth: z.int().min(1).max(12).optional(),

    // Date string inputs
    startDate: dateStringSchema.optional(),
    endDate: dateStringSchema.optional(),

    // Configuration
    year: z.int().min(1900).max(2900).optional(),
    distance: z.number().positive().optional(),
    unit: dateUnitSchema.optional(),
    format: z.string().optional(),
  })
  .refine(
    (data) => {
      const hasStartComponents =
        (data.startDay !== undefined && data.startMonth !== undefined) || data.startDate;
      const hasEndComponents =
        (data.endDay !== undefined && data.endMonth !== undefined) || data.endDate;

      return hasStartComponents || hasEndComponents;
    },
    {
      error:
        'Must provide at least one of: startDay+startMonth, endDay+endMonth, startDate, or endDate',
    },
  )
  .refine(
    (data) => {
      const hasStartConflict =
        data.startDate && (data.startDay !== undefined || data.startMonth !== undefined);
      const hasEndConflict =
        data.endDate && (data.endDay !== undefined || data.endMonth !== undefined);

      return !(hasStartConflict || hasEndConflict);
    },
    {
      error: 'Cannot mix day/month numbers with date strings for the same start/end point',
    },
  )
  .refine(
    (data) => {
      // Validate day/month combinations exist
      try {
        const currentYear = data.year || new Date().getFullYear();

        if (data.startDay !== undefined && data.startMonth !== undefined) {
          validateDayInMonth(currentYear, data.startMonth, data.startDay);
        }
        if (data.endDay !== undefined && data.endMonth !== undefined) {
          validateDayInMonth(currentYear, data.endMonth, data.endDay);
        }
        return true;
      } catch {
        return false;
      }
    },
    {
      error: 'Invalid date: day does not exist in the specified month',
    },
  );
export type DateRangeOptions = z.infer<typeof optionsSchema>;
export interface DateObject {
  dayNumber: number;
  monthNumber: number;
  monthName: string;
  shortMonth: string;
  fullDate: string;
}

export interface DateRangeResult {
  start: DateObject;
  end: DateObject;
}

/**
 * Parse date string with fallback between two accepted formats
 */
function parseDate(dateStr: string): Date {
  // Try yyyy-MM-dd first (more common), then yyyy-M-d
  const formats = ['yyyy-MM-dd', 'yyyy-M-d'] as const;

  for (const format of formats) {
    const parsed = parseDateFns(dateStr, format, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Unable to parse date: ${dateStr}. Use YYYY-MM-DD or YYYY-M-D format.`);
}

/**
 * Create date from numeric components with validation
 */
function createDateFromParts(year: number, month: number, day: number): Date {
  validateDayInMonth(year, month, day);
  return new Date(year, month - 1, day);
}

/**
 * Smart duration addition that preserves month-end dates for accounting periods
 */
function addDuration(date: Date, duration: Duration): Date {
  // Special handling for month operations to preserve end-of-month dates
  if (duration.months && duration.months > 0) {
    const wasLastDayOfMonth = isLastDayOfMonth(date);
    let result = add(date, duration);

    // If original was last day of month, ensure result is also last day
    if (wasLastDayOfMonth) {
      result = lastDayOfMonth(result);
    }

    return result;
  }

  // Standard addition for other units
  return add(date, duration);
}

/**
 * Convert Date to standardized DateObject
 */
function toDateObject(date: Date, format: string): DateObject {
  return {
    dayNumber: date.getDate(),
    monthNumber: date.getMonth() + 1,
    monthName: formatDate(date, 'MMMM'),
    shortMonth: formatDate(date, 'MMM'),
    fullDate: formatDate(date, format),
  };
}

/**
 * Generate a date range with start and end dates
 *
 * @param options - Configuration object with date inputs and formatting options
 * @returns Object containing formatted start and end date information
 *
 * @example
 * ```typescript
 * // Using end date components
 * generateDateRange({ endMonth: 12, endDay: 31 })
 *
 * // Using date strings
 * generateDateRange({ startDate: "2025-01-01", endDate: "2025-12-31" })
 *
 * // Custom distance
 * generateDateRange({ startDate: "2025-06-01", distance: 3, unit: "months" })
 * ```
 */
export function generateDateRange(options: DateRangeOptions = {}) {
  const validatedOptions = optionsSchema.parse(options);

  const {
    startDay,
    startMonth,
    endDay,
    endMonth,
    startDate,
    endDate,
    year = new Date().getFullYear(),
    distance = 1,
    unit = 'years',
    format = 'dd MMM yyyy',
  } = validatedOptions;

  let start: Date;
  let end: Date;
  try {
    // Parse or create start date
    if (startDate) {
      start = parseDate(startDate);
    } else if (startDay !== undefined && startMonth !== undefined) {
      start = createDateFromParts(year, startMonth, startDay);
    } else {
      start = null as any; // Will be calculated from end
    }

    // Parse or create end date
    if (endDate) {
      end = parseDate(endDate);
    } else if (endDay !== undefined && endMonth !== undefined) {
      end = createDateFromParts(year, endMonth, endDay);
    } else {
      end = null as any; // Will be calculated from start
    }

    // Calculate missing dates based on distance
    if (start && end) {
      // Both provided - validate order
      if (isBefore(end, start)) {
        throw new Error('End date cannot be before start date');
      }
    } else if (start && !end) {
      // Calculate end from start + distance
      const duration = { [unit]: distance } as Duration;
      const periodEnd = addDuration(start, duration);
      end = sub(periodEnd, { days: 1 }); // Subtract 1 for inclusive end
    } else if (!start && end) {
      // Calculate start from end - distance
      const duration = { [unit]: distance } as Duration;
      const periodStart = sub(end, duration);
      start = add(periodStart, { days: 1 }); // Add 1 to include the start day
    } else {
      // Default: full calendar year
      start = createDateFromParts(year, 1, 1);
      end = createDateFromParts(year, 12, 31);
    }

    // Ensure we have full day ranges
    start = startOfDay(start);
    end = endOfDay(end);

    // Final validation
    if (!isValid(start) || !isValid(end)) {
      throw new Error('Generated dates are invalid');
    }

    if (isBefore(end, start)) {
      throw new Error('Calculated end date is before start date');
    }

    return {
      start: toDateObject(start, format),
      end: toDateObject(end, format),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Date range generation failed: ${error.message}`);
    }
    throw new Error('Date range generation failed: Unknown error');
  }
}
