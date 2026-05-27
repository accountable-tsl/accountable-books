import { describe, expect, it } from 'vitest';

import {
  getDefaultTimezoneForCountry,
  getTimezonesForCountry,
  isKnownTimezone,
  normalizeTimezoneId,
} from '../src/timezone/index.js';

describe('timezone utils', () => {
  it('returns a single timezone for single-timezone countries', () => {
    const nigeriaTimezones = getTimezonesForCountry('NG');

    expect(nigeriaTimezones).toHaveLength(1);
    expect(nigeriaTimezones[0]?.id).toBe('Africa/Lagos');
    expect(getDefaultTimezoneForCountry('NG')).toBe('Africa/Lagos');
  });

  it('returns multiple grouped timezones for multi-timezone countries', () => {
    const usTimezones = getTimezonesForCountry('US');

    expect(usTimezones.length).toBeGreaterThan(1);
    expect(
      usTimezones.some((timezone) => timezone.id === 'America/New_York'),
    ).toBe(true);
    expect(getDefaultTimezoneForCountry('US')).toBe('America/New_York');
  });

  it('returns no timezone data for unknown countries', () => {
    expect(getTimezonesForCountry('ZZ')).toEqual([]);
    expect(getDefaultTimezoneForCountry('ZZ')).toBeUndefined();
  });

  it('accepts canonical and alias timezone IDs', () => {
    expect(isKnownTimezone('America/New_York')).toBe(true);
    expect(isKnownTimezone('UTC')).toBe(true);
    expect(normalizeTimezoneId('UTC')).toBe('Etc/UTC');
    expect(isKnownTimezone('Not/A_Real_Timezone')).toBe(false);
  });
});
