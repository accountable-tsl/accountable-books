import { describe, expect, it } from 'vitest';

import {
  getCompanyTimezoneOptions,
  getCompanyTimezoneValidationMessage,
  isCompanyTimezoneValidForCountry,
  normalizeCompanyTimezone,
} from './company-timezones';

describe('company timezone helpers', () => {
  it('normalizes known aliases', () => {
    expect(normalizeCompanyTimezone('UTC')).toBe('Etc/UTC');
  });

  it('returns country-scoped options', () => {
    expect(
      getCompanyTimezoneOptions('US').some(
        (timezone) => timezone.value === 'America/New_York',
      ),
    ).toBe(true);
  });

  it('rejects a valid timezone outside the selected country when options exist', () => {
    expect(
      getCompanyTimezoneValidationMessage({
        timezone: 'Pacific/Honolulu',
        timezoneOptions: getCompanyTimezoneOptions('GB'),
        countryLabel: 'United Kingdom',
      }),
    ).toBe('Select a timezone for United Kingdom');
  });

  it('requires timezone for multi-timezone countries', () => {
    expect(
      isCompanyTimezoneValidForCountry({
        timezone: null,
        countryCode: 'US',
      }),
    ).toBe(false);
  });
});
