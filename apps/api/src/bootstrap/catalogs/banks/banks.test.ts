import { describe, expect, it } from 'vitest';

import { BANKS_CATALOG } from './banks.js';

describe('bootstrap bank catalog', () => {
  it('contains normalized banks with country-scoped stable keys', () => {
    expect(BANKS_CATALOG.length).toBeGreaterThan(500);

    for (const bank of BANKS_CATALOG) {
      expect(bank.key).toMatch(/^[a-z]{2}_[a-z0-9_]+$/);
      expect(bank.key.startsWith(`${bank.country.toLowerCase()}_`)).toBe(true);
      expect(bank.displayName.trim()).toBe(bank.displayName);
      expect(bank.officialName?.trim() ?? null).toBe(bank.officialName);
    }
  });

  it('provides local code and type together', () => {
    for (const bank of BANKS_CATALOG) {
      expect(bank.localCode === null).toBe(bank.localCodeType === null);
    }
  });
});
