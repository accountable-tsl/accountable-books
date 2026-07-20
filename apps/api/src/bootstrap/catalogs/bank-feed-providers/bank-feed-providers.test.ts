import { describe, expect, it } from 'vitest';

import { BANK_FEED_PROVIDERS_CATALOG } from './bank-feed-providers.js';

describe('bank feed provider catalog', () => {
  it('contains only normalized canonical provider entries', () => {
    expect(BANK_FEED_PROVIDERS_CATALOG).toHaveLength(2);

    for (const provider of BANK_FEED_PROVIDERS_CATALOG) {
      expect(provider.key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(provider.displayName).toBe(provider.displayName.trim());
    }
  });

  it('seeds implemented providers as active', () => {
    expect(
      BANK_FEED_PROVIDERS_CATALOG.map((provider) => ({
        key: provider.key,
        status: provider.status,
      })),
    ).toEqual([
      { key: 'mono', status: 'active' },
      { key: 'plaid', status: 'active' },
    ]);
  });

  it('does not pre-seed unsupported future providers', () => {
    expect(
      BANK_FEED_PROVIDERS_CATALOG.some((provider) => provider.key === 'stripe'),
    ).toBe(false);
  });
});
