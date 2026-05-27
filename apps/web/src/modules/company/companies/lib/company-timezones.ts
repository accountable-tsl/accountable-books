import {
  getTimezonesForCountry,
  isKnownTimezone,
  normalizeTimezoneId,
} from '@accountable-books/utils/timezone';

export type CompanyTimezoneOption = {
  value: string;
  label: string;
};

export function getCompanyTimezoneOptions(
  countryCode?: string | null,
): CompanyTimezoneOption[] {
  return getTimezonesForCountry(countryCode).map((timezone) => ({
    value: timezone.id,
    label: timezone.label,
  }));
}

export function normalizeCompanyTimezone(
  timezone?: string | null,
): string | null {
  if (timezone == null) return null;

  const normalized = normalizeTimezoneId(timezone) ?? timezone.trim();
  return normalized.length > 0 ? normalized : null;
}

export function isCompanyTimezoneOption(
  timezone: string | null | undefined,
  timezoneOptions: CompanyTimezoneOption[],
): boolean {
  const normalized = normalizeCompanyTimezone(timezone);
  if (!normalized) return false;

  return timezoneOptions.some((option) => option.value === normalized);
}

export function getCompanyTimezoneValidationMessage({
  timezone,
  timezoneOptions,
  countryLabel,
  required = true,
}: {
  timezone: string | null | undefined;
  timezoneOptions: CompanyTimezoneOption[];
  countryLabel?: string | null;
  required?: boolean;
}): string | null {
  const normalizedTimezone = normalizeCompanyTimezone(timezone);

  if (!normalizedTimezone) {
    return required ? 'Select a timezone' : null;
  }

  if (!isKnownTimezone(normalizedTimezone)) {
    return 'Select a valid IANA timezone';
  }

  if (
    timezoneOptions.length > 0 &&
    !isCompanyTimezoneOption(normalizedTimezone, timezoneOptions)
  ) {
    return `Select a timezone for ${countryLabel ?? 'this country'}`;
  }

  return null;
}

export function isCompanyTimezoneValidForCountry({
  timezone,
  countryCode,
  requiredWhenMultiple = true,
}: {
  timezone: string | null | undefined;
  countryCode?: string | null;
  requiredWhenMultiple?: boolean;
}): boolean {
  const timezoneOptions = getCompanyTimezoneOptions(countryCode);
  const normalizedTimezone = normalizeCompanyTimezone(timezone);

  if (timezoneOptions.length > 1 && requiredWhenMultiple) {
    return isCompanyTimezoneOption(normalizedTimezone, timezoneOptions);
  }

  return (
    getCompanyTimezoneValidationMessage({
      timezone: normalizedTimezone,
      timezoneOptions,
      required: false,
    }) === null
  );
}
