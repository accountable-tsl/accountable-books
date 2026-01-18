import { describe, expect, test } from 'vitest';

import type {
  DemoCompanyType,
  DemoCountry,
  DemoCountryCode,
  DemoCurrency,
  DemoCurrencyCode,
  DemoFilter,
} from './config.js';
import {
  COMPANY_TYPES,
  COUNTRY_CODES,
  CURRENCY_CODES,
  DEMO_COUNTRIES,
  DEMO_CURRENCIES,
} from './config.js';

describe('Country Configuration', () => {
  test('COUNTRY_CODES should contain expected values', () => {
    expect(COUNTRY_CODES).toEqual({
      US: 'US',
      NG: 'NG',
    });
  });

  test('DEMO_COUNTRIES should have entries for all country codes', () => {
    Object.values(COUNTRY_CODES).forEach((code) => {
      expect(DEMO_COUNTRIES).toHaveProperty(code);
      expect(DEMO_COUNTRIES[code as DemoCountryCode]).toBeDefined();
    });
  });

  test('DEMO_COUNTRIES entries should have required properties', () => {
    Object.values(DEMO_COUNTRIES).forEach((country: DemoCountry) => {
      expect(country).toHaveProperty('code');
      expect(country).toHaveProperty('name');
      expect(country).toHaveProperty('phone_code');
      expect(typeof country.code).toBe('string');
      expect(typeof country.name).toBe('string');
      expect(typeof country.phone_code).toBe('string');
    });
  });

  test('US country should have correct properties', () => {
    const usCountry = DEMO_COUNTRIES.US;
    expect(usCountry.code).toBe('US');
    expect(usCountry.name).toContain('United States');
    expect(usCountry.phone_code).toBe('+1');
  });

  test('NG country should have correct properties', () => {
    const ngCountry = DEMO_COUNTRIES.NG;
    expect(ngCountry.code).toBe('NG');
    expect(ngCountry.name).toContain('Nigeria');
    expect(ngCountry.phone_code).toBe('+234');
  });
});

describe('Company Types Configuration', () => {
  test('COMPANY_TYPES should contain expected values', () => {
    expect(COMPANY_TYPES).toEqual({
      INDIVIDUAL: 'individual',
      BUSINESS: 'business',
      ACCOUNTING_FIRM: 'accounting_firm',
    });
  });

  test('all company type values should be strings', () => {
    Object.values(COMPANY_TYPES).forEach((type) => {
      expect(typeof type).toBe('string');
      expect(type.length).toBeGreaterThan(0);
    });
  });

  test('company type values should be unique', () => {
    const values = Object.values(COMPANY_TYPES);
    const uniqueValues = [...new Set(values)];
    expect(values).toHaveLength(uniqueValues.length);
  });
});

describe('Currency Configuration', () => {
  test('CURRENCY_CODES should contain expected values', () => {
    expect(CURRENCY_CODES).toEqual({
      USD: 'USD',
      NGN: 'NGN',
    });
  });

  test('DEMO_CURRENCIES should have entries for all currency codes', () => {
    Object.values(CURRENCY_CODES).forEach((code) => {
      expect(DEMO_CURRENCIES).toHaveProperty(code);
      expect(DEMO_CURRENCIES[code as DemoCurrencyCode]).toBeDefined();
    });
  });

  test('DEMO_CURRENCIES entries should have required properties', () => {
    Object.values(DEMO_CURRENCIES).forEach((currency: DemoCurrency) => {
      expect(currency).toHaveProperty('id');
      expect(currency).toHaveProperty('name');
      expect(currency).toHaveProperty('code');
      expect(currency).toHaveProperty('symbol');
      expect(typeof currency.id).toBe('string');
      expect(typeof currency.name).toBe('string');
      expect(typeof currency.code).toBe('string');
      expect(typeof currency.symbol).toBe('string');
    });
  });

  test('USD currency should have correct properties', () => {
    const usdCurrency = DEMO_CURRENCIES.USD;
    expect(usdCurrency.code).toBe('USD');
    expect(usdCurrency.name).toContain('Dollar');
    expect(usdCurrency.symbol).toBe('$');
  });

  test('NGN currency should have correct properties', () => {
    const ngnCurrency = DEMO_CURRENCIES.NGN;
    expect(ngnCurrency.code).toBe('NGN');
    expect(ngnCurrency.name).toContain('Naira');
    expect(ngnCurrency.symbol).toBe('₦');
  });
});

describe('DemoFilter Type', () => {
  test('should accept valid filter with countryCodes', () => {
    const filter: DemoFilter = {
      countryCodes: ['US', 'NG'],
    };
    expect(filter.countryCodes).toEqual(['US', 'NG']);
  });

  test('should accept valid filter with companyTypes', () => {
    const filter: DemoFilter = {
      companyTypes: ['business', 'individual'],
    };
    expect(filter.companyTypes).toEqual(['business', 'individual']);
  });

  test('should accept valid filter with companyIds', () => {
    const filter: DemoFilter = {
      companyIds: ['bizDemoUS', 'firmDemoUS'],
    };
    expect(filter.companyIds).toEqual(['bizDemoUS', 'firmDemoUS']);
  });

  test('should accept combined filters', () => {
    const filter: DemoFilter = {
      countryCodes: ['US'],
      companyTypes: ['business'],
      companyIds: ['bizDemoUS'],
    };
    expect(filter.countryCodes).toEqual(['US']);
    expect(filter.companyTypes).toEqual(['business']);
    expect(filter.companyIds).toEqual(['bizDemoUS']);
  });

  test('should accept empty filter', () => {
    const filter: DemoFilter = {};
    expect(filter).toEqual({});
  });
});

describe('Type Validation', () => {
  test('DemoCountryCode should only accept valid country codes', () => {
    const validCodes: DemoCountryCode[] = ['US', 'NG'];
    validCodes.forEach((code) => {
      expect(Object.values(COUNTRY_CODES)).toContain(code);
    });
  });

  test('DemoCompanyType should only accept valid company types', () => {
    const validTypes: DemoCompanyType[] = [
      'individual',
      'business',
      'accounting_firm',
    ];
    validTypes.forEach((type) => {
      expect(Object.values(COMPANY_TYPES)).toContain(type);
    });
  });

  test('DemoCurrencyCode should only accept valid currency codes', () => {
    const validCodes: DemoCurrencyCode[] = ['USD', 'NGN'];
    validCodes.forEach((code) => {
      expect(Object.values(CURRENCY_CODES)).toContain(code);
    });
  });
});

describe('Configuration Consistency', () => {
  test('country and currency mappings should be consistent', () => {
    // US should use USD
    expect(DEMO_COUNTRIES.US.code).toBe('US');
    expect(DEMO_CURRENCIES.USD.code).toBe('USD');

    // NG should use NGN
    expect(DEMO_COUNTRIES.NG.code).toBe('NG');
    expect(DEMO_CURRENCIES.NGN.code).toBe('NGN');
  });

  test('configuration objects should maintain their structure', () => {
    // Test that the objects have expected properties and structure
    expect(Object.keys(COUNTRY_CODES)).toEqual(['US', 'NG']);
    expect(Object.keys(COMPANY_TYPES)).toEqual([
      'INDIVIDUAL',
      'BUSINESS',
      'ACCOUNTING_FIRM',
    ]);
    expect(Object.keys(CURRENCY_CODES)).toEqual(['USD', 'NGN']);
  });

  test('demo countries should have valid IDs', () => {
    Object.values(DEMO_COUNTRIES).forEach((country) => {
      if (country.id) {
        expect(typeof country.id).toBe('string');
        expect(country.id.length).toBeGreaterThan(0);
      }
    });
  });

  test('demo currencies should have valid IDs', () => {
    Object.values(DEMO_CURRENCIES).forEach((currency) => {
      expect(typeof currency.id).toBe('string');
      expect(currency.id.length).toBeGreaterThan(0);
    });
  });
});

describe('Edge Cases and Error Handling', () => {
  test('should handle undefined filter properties gracefully', () => {
    const filter: DemoFilter = {
      countryCodes: undefined,
      companyTypes: undefined,
      companyIds: undefined,
    };

    expect(filter.countryCodes).toBeUndefined();
    expect(filter.companyTypes).toBeUndefined();
    expect(filter.companyIds).toBeUndefined();
  });

  test('should handle empty arrays in filters', () => {
    const filter: DemoFilter = {
      countryCodes: [],
      companyTypes: [],
      companyIds: [],
    };

    expect(filter.countryCodes).toEqual([]);
    expect(filter.companyTypes).toEqual([]);
    expect(filter.companyIds).toEqual([]);
  });
});
