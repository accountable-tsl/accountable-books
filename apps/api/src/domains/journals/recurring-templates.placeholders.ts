import { getISOWeek, getISOWeekYear } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

import { addDaysToYMD, addMonthsToYMD } from '../../shared/utils/date.utils.js';
import {
  toZonedDateForCalculations,
  ymdToUtcDate,
} from './recurring-templates.schedule.js';

export const PLACEHOLDER_REGEX =
  /\[(Day|Week|Month|Year|Week Year|Month Year)([+-]\d+)?\]/g;

export const PLACEHOLDER_VALIDATE_REGEX =
  /^\[(Day|Week|Month|Year|Week Year|Month Year)([+-]\d+)?\]$/;

export type PlaceholderToken =
  | 'Day'
  | 'Week'
  | 'Month'
  | 'Year'
  | 'Week Year'
  | 'Month Year';

function parsePlaceholder(token: string): {
  token: PlaceholderToken;
  offset: number;
} | null {
  const match = token.match(PLACEHOLDER_VALIDATE_REGEX);
  if (!match) return null;

  const base = match[1] as PlaceholderToken;
  const offsetRaw = match[2];
  const offset = offsetRaw ? Number(offsetRaw) : 0;
  return { token: base, offset: Number.isFinite(offset) ? offset : 0 };
}

function applyOffsetYMD(
  baseYMD: string,
  token: PlaceholderToken,
  offset: number,
): string {
  if (offset === 0) return baseYMD;

  switch (token) {
    case 'Day':
      return addDaysToYMD(baseYMD, offset);
    case 'Week':
    case 'Week Year':
      return addDaysToYMD(baseYMD, offset * 7);
    case 'Month':
    case 'Month Year':
      return addMonthsToYMD(baseYMD, offset);
    case 'Year':
      return addMonthsToYMD(baseYMD, offset * 12);
  }
}

function renderToken({
  token,
  runDateYMD,
  timezone,
  offset,
}: {
  token: PlaceholderToken;
  runDateYMD: string;
  timezone: string;
  offset: number;
}): string {
  const ymd = applyOffsetYMD(runDateYMD, token, offset);
  const utcDate = ymdToUtcDate(ymd, timezone);

  switch (token) {
    case 'Day':
      return formatInTimeZone(utcDate, timezone, 'MMM d, yyyy');
    case 'Week': {
      const zoned = toZonedDateForCalculations(utcDate, timezone);
      const week = getISOWeek(zoned);
      return `W${week}`;
    }
    case 'Month':
      return formatInTimeZone(utcDate, timezone, 'MMMM');
    case 'Year':
      return formatInTimeZone(utcDate, timezone, 'yyyy');
    case 'Week Year': {
      const zoned = toZonedDateForCalculations(utcDate, timezone);
      const week = getISOWeek(zoned);
      const year = getISOWeekYear(zoned);
      return `${year}-W${week}`;
    }
    case 'Month Year':
      return formatInTimeZone(utcDate, timezone, 'MMMM yyyy');
  }
}

export function validatePlaceholdersInText(text: string): string[] {
  const invalid: string[] = [];
  const matches = text.match(/\[[^\]]+\]/g) ?? [];
  for (const token of matches) {
    if (!PLACEHOLDER_VALIDATE_REGEX.test(token)) {
      invalid.push(token);
    }
  }
  return invalid;
}

export function validatePlaceholdersInFields(
  fields: Array<string | null | undefined>,
): {
  valid: boolean;
  invalidTokens: string[];
} {
  const invalidTokens = fields
    .filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    )
    .flatMap((value) => validatePlaceholdersInText(value));

  return {
    valid: invalidTokens.length === 0,
    invalidTokens,
  };
}

export function renderPlaceholders(
  text: string | null | undefined,
  runDateYMD: string,
  timezone: string,
): string | null {
  if (!text) return text ?? null;

  return text.replace(PLACEHOLDER_REGEX, (token) => {
    const parsed = parsePlaceholder(token);
    if (!parsed) return token;
    return renderToken({
      token: parsed.token,
      runDateYMD,
      timezone,
      offset: parsed.offset,
    });
  });
}
