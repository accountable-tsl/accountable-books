import { describe, expect, it } from 'vitest';

import {
  CURRENCIES_CATALOG,
  getCurrencyFromCatalogByCode,
} from './currencies.js';

describe('bootstrap currency catalog', () => {
  it('contains valid entries with normalized codes and minor units', () => {
    expect(CURRENCIES_CATALOG.length).toBeGreaterThan(100);

    for (const currency of CURRENCIES_CATALOG) {
      expect(currency.code).toMatch(/^[A-Z]{3}$/);
      expect(Number.isInteger(currency.minorUnit)).toBe(true);
      expect(currency.minorUnit).toBeGreaterThanOrEqual(0);
      expect(currency.minorUnit).toBeLessThanOrEqual(4);
    }
  });

  it('resolves catalog entries case-insensitively by code', () => {
    const usd = getCurrencyFromCatalogByCode('usd');
    expect(usd).toBeDefined();
    expect(usd?.code).toBe('USD');
    expect(usd?.minorUnit).toBe(2);
  });

  it('returns undefined for unknown currency code', () => {
    expect(getCurrencyFromCatalogByCode('ZZZ')).toBeUndefined();
  });
});
