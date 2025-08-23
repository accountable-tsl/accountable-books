import { describe, expect, test } from 'vitest';
import { resolveFiltersToIds } from './utils.js';
import { DEMO_COMPANIES, US_DEMO_COMPANIES } from '../config/002_companies/companies.data.js';

describe('resolveFiltersToIds', () => {
  test('returns empty array for empty filter', () => {
    const result = resolveFiltersToIds({});
    expect(result).toEqual([]);
  });

  test('returns all US company IDs when filtering by US country', () => {
    const result = resolveFiltersToIds({ countryCodes: ['US'] });
    const expectedIds = DEMO_COMPANIES.filter((c) => c.countryCode === 'US').map((c) => c.id);

    expect(result).toHaveLength(3);
    expect(result.sort()).toEqual(expectedIds.sort());
  });

  test('returns all NG company IDs when filtering by NG country', () => {
    const result = resolveFiltersToIds({ countryCodes: ['NG'] });
    const expectedIds = DEMO_COMPANIES.filter((c) => c.countryCode === 'NG').map((c) => c.id);

    expect(result).toHaveLength(3);
    expect(result.sort()).toEqual(expectedIds.sort());
  });

  test('returns all business company IDs when filtering by business type', () => {
    const result = resolveFiltersToIds({ companyTypes: ['business'] });
    const expectedIds = DEMO_COMPANIES.filter((c) => c.companyType === 'business').map((c) => c.id);

    expect(result).toHaveLength(2);
    expect(result.sort()).toEqual(expectedIds.sort());
  });

  test('returns all individual company IDs when filtering by individual type', () => {
    const result = resolveFiltersToIds({ companyTypes: ['individual'] });
    const expectedIds = DEMO_COMPANIES.filter((c) => c.companyType === 'individual').map(
      (c) => c.id,
    );

    expect(result).toHaveLength(2);
    expect(result.sort()).toEqual(expectedIds.sort());
  });

  test('returns valid company ID when filtering by existing company ID', () => {
    const validId = US_DEMO_COMPANIES[0].id;
    const result = resolveFiltersToIds({ companyIds: [validId] });

    expect(result).toEqual([validId]);
  });

  test('filters out invalid company IDs', () => {
    const validId = US_DEMO_COMPANIES[0].id;
    const invalidId = 'invalid-company-id';
    const result = resolveFiltersToIds({ companyIds: [validId, invalidId] });

    expect(result).toEqual([validId]);
  });

  test('returns empty array for only invalid company IDs', () => {
    const result = resolveFiltersToIds({ companyIds: ['invalid-id-1', 'invalid-id-2'] });

    expect(result).toEqual([]);
  });

  test('combines multiple filters with OR logic', () => {
    const result = resolveFiltersToIds({
      countryCodes: ['NG'],
      companyTypes: ['individual'],
    });

    const ngCompanies = DEMO_COMPANIES.filter((c) => c.countryCode === 'NG').map((c) => c.id);
    const individualCompanies = DEMO_COMPANIES.filter((c) => c.companyType === 'individual').map(
      (c) => c.id,
    );
    const expectedIds = [...new Set([...ngCompanies, ...individualCompanies])];

    expect(result.sort()).toEqual(expectedIds.sort());
  });

  test('handles multiple country codes', () => {
    const result = resolveFiltersToIds({ countryCodes: ['US', 'NG'] });

    expect(result).toHaveLength(6); // All companies
    expect(result.sort()).toEqual(DEMO_COMPANIES.map((c) => c.id).sort());
  });

  test('handles multiple company types', () => {
    const result = resolveFiltersToIds({ companyTypes: ['business', 'individual'] });
    const expectedIds = DEMO_COMPANIES.filter(
      (c) => c.companyType === 'business' || c.companyType === 'individual',
    ).map((c) => c.id);

    expect(result).toHaveLength(4);
    expect(result.sort()).toEqual(expectedIds.sort());
  });

  test('returns unique IDs when filters overlap', () => {
    const usBusinessId = US_DEMO_COMPANIES[1].id;
    const result = resolveFiltersToIds({
      countryCodes: ['US'],
      companyTypes: ['business'],
      companyIds: [usBusinessId],
    });

    // Should not duplicate the US business company ID
    const uniqueIds = [...new Set(result)];
    expect(result).toEqual(uniqueIds);
  });
});
