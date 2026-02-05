import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

import {
  addDaysToYMD,
  addMonthsToYMD,
  dateDiff,
  isValidYMD,
} from '../../shared/utils/date.utils.js';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export function todayYMDInTz(tz: string, now = new Date()): string {
  return formatInTimeZone(now, tz, 'yyyy-MM-dd');
}

export function ymdToUtcDate(ymd: string, tz: string): Date {
  if (!isValidYMD(ymd)) {
    throw new Error(`Invalid YMD: ${ymd}`);
  }
  return fromZonedTime(`${ymd}T00:00:00`, tz);
}

export function ymdFromDateInTz(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, 'yyyy-MM-dd');
}

export function computeNextAlignedRunDate({
  startYMD,
  frequency,
  todayYMD,
}: {
  startYMD: string;
  frequency: RecurrenceFrequency;
  todayYMD: string;
}): string {
  if (!isValidYMD(startYMD) || !isValidYMD(todayYMD)) {
    throw new Error(`Invalid YMD inputs: ${startYMD}, ${todayYMD}`);
  }

  if (todayYMD <= startYMD) return startYMD;

  switch (frequency) {
    case 'daily':
      return todayYMD;
    case 'weekly': {
      const diffDays = Math.round(
        dateDiff({ from: todayYMD, to: startYMD, unit: 'days', tz: 'start' }),
      );
      const offset = diffDays % 7;
      return offset === 0 ? todayYMD : addDaysToYMD(todayYMD, 7 - offset);
    }
    case 'monthly': {
      const start = startYMD.split('-').map(Number);
      const today = todayYMD.split('-').map(Number);
      const startYear = start[0]!;
      const startMonth = start[1]!;
      const todayYear = today[0]!;
      const todayMonth = today[1]!;
      const monthsDiff =
        (todayYear - startYear) * 12 + (todayMonth - startMonth);
      let candidate = addMonthsToYMD(startYMD, monthsDiff);
      if (candidate < todayYMD) {
        candidate = addMonthsToYMD(startYMD, monthsDiff + 1);
      }
      return candidate;
    }
    case 'yearly': {
      const startYear = Number(startYMD.slice(0, 4));
      const todayYear = Number(todayYMD.slice(0, 4));
      const yearsDiff = todayYear - startYear;
      let candidate = addMonthsToYMD(startYMD, yearsDiff * 12);
      if (candidate < todayYMD) {
        candidate = addMonthsToYMD(startYMD, (yearsDiff + 1) * 12);
      }
      return candidate;
    }
  }
}

export function advanceRunDate({
  fromYMD,
  frequency,
}: {
  fromYMD: string;
  frequency: RecurrenceFrequency;
}): string {
  if (!isValidYMD(fromYMD)) {
    throw new Error(`Invalid YMD: ${fromYMD}`);
  }

  switch (frequency) {
    case 'daily':
      return addDaysToYMD(fromYMD, 1);
    case 'weekly':
      return addDaysToYMD(fromYMD, 7);
    case 'monthly':
      return addMonthsToYMD(fromYMD, 1);
    case 'yearly':
      return addMonthsToYMD(fromYMD, 12);
  }
}

export function toZonedDateForCalculations(date: Date, tz: string): Date {
  return toZonedTime(date, tz);
}
