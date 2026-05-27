import { describe, expect, it } from 'vitest';

import { validateBillingCatalogV1Seed } from '../catalog-seed.validation.js';

describe('validateBillingCatalogV1Seed', () => {
  it('passes for the locked launch billing catalog snapshot', () => {
    expect(() => validateBillingCatalogV1Seed()).not.toThrow();
  });
});
