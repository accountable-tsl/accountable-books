import { describe, expect, it } from 'vitest';

import { COUNTRIES_CATALOG, getCountryFromCatalogByCode } from './countries.js';

describe('bootstrap country catalog', () => {
  it('contains valid alpha-2 entries with normalized metadata', () => {
    expect(COUNTRIES_CATALOG.length).toBeGreaterThan(100);

    for (const country of COUNTRIES_CATALOG) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.name.trim()).toBe(country.name);
      expect(country.phoneCode).toMatch(/^\+[0-9]{1,14}$/);
    }
  });

  it('resolves catalog entries case-insensitively by code', () => {
    const us = getCountryFromCatalogByCode('us');
    expect(us).toBeDefined();
    expect(us?.code).toBe('US');
    expect(us?.phoneCode).toBe('+1');
  });

  it('returns undefined for unknown country code', () => {
    expect(getCountryFromCatalogByCode('ZZ')).toBeUndefined();
  });
});
