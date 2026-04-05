import {
  allTimezoneOptions,
  countryDefaultTimezoneIds,
  timezoneAliasMap,
  timezoneIdsByCountry,
} from './data.generated.js';

export type TimezoneOption = (typeof allTimezoneOptions)[number];

export type CountryTimezoneSummary = {
  countryCode: string;
  defaultTimezoneId?: string;
  timezones: TimezoneOption[];
};

const timezoneOptionById = new Map<string, TimezoneOption>(
  allTimezoneOptions.map((timezone) => [timezone.id, timezone] as const),
);
const timezoneAliasLookup: Record<string, string> = timezoneAliasMap;
const timezoneIdsByCountryLookup: Record<string, readonly string[]> =
  timezoneIdsByCountry;
const countryDefaultTimezoneLookup: Record<string, string> =
  countryDefaultTimezoneIds;

const normalizeCountryCode = (
  countryCode?: string | null,
): string | undefined => countryCode?.trim().toUpperCase() || undefined;

export const allTimezones = allTimezoneOptions;
export const countryToTimezone = countryDefaultTimezoneIds;

export function normalizeTimezoneId(
  timezone?: string | null,
): string | undefined {
  const trimmed = timezone?.trim();
  if (!trimmed) return undefined;
  if (timezoneOptionById.has(trimmed)) return trimmed;
  return timezoneAliasLookup[trimmed];
}

export function isKnownTimezone(timezone?: string | null): boolean {
  return normalizeTimezoneId(timezone) !== undefined;
}

export function getTimezoneOption(
  timezone?: string | null,
): TimezoneOption | undefined {
  const normalized = normalizeTimezoneId(timezone);
  if (!normalized) return undefined;
  return timezoneOptionById.get(normalized);
}

export function getTimezonesForCountry(countryCode?: string | null) {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  if (!normalizedCountryCode) return [] as TimezoneOption[];

  return (timezoneIdsByCountryLookup[normalizedCountryCode] ?? [])
    .map((timezoneId) => timezoneOptionById.get(timezoneId))
    .filter((timezone): timezone is TimezoneOption => timezone !== undefined);
}

export function getDefaultTimezoneForCountry(
  countryCode?: string | null,
): string | undefined {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  if (!normalizedCountryCode) return undefined;
  return countryDefaultTimezoneLookup[normalizedCountryCode];
}

export function getCountryTimezoneSummary(
  countryCode?: string | null,
): CountryTimezoneSummary | undefined {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  if (!normalizedCountryCode) return undefined;

  return {
    countryCode: normalizedCountryCode,
    defaultTimezoneId: getDefaultTimezoneForCountry(normalizedCountryCode),
    timezones: getTimezonesForCountry(normalizedCountryCode),
  };
}
