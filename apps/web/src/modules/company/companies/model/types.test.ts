import { describe, expect, it } from 'vitest';

import { updateCompanyVitalsSchema } from './types';

describe('updateCompanyVitalsSchema', () => {
  it('accepts valid multi-segment IANA timezones', () => {
    expect(
      updateCompanyVitalsSchema.shape.defaultTimezone.safeParse(
        'America/Argentina/Buenos_Aires',
      ).success,
    ).toBe(true);
  });

  it('rejects unknown timezone values', () => {
    expect(
      updateCompanyVitalsSchema.shape.defaultTimezone.safeParse(
        'America/Not_A_Real_Place',
      ).success,
    ).toBe(false);
  });
});
