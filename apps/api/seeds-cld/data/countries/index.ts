import { US_CONFIG, US_BANK_DATA, US_CONTACT_DATA } from './us.js';
import { NG_CONFIG, NG_BANK_DATA, NG_CONTACT_DATA } from './ng.js';
import type { CountryConfig } from '../../utils/types.js';

// Country registry for easy access
export const COUNTRIES: Record<string, CountryConfig> = {
  US: US_CONFIG,
  NG: NG_CONFIG,
};

// Country data generators
export const COUNTRY_DATA = {
  US: {
    config: US_CONFIG,
    bank: US_BANK_DATA,
    contact: US_CONTACT_DATA,
  },
  NG: {
    config: NG_CONFIG,
    bank: NG_BANK_DATA,
    contact: NG_CONTACT_DATA,
  },
};

// Helper functions
export function getCountryConfig(countryCode: 'US' | 'NG'): CountryConfig {
  const config = COUNTRIES[countryCode];
  if (!config) {
    throw new Error(`Unsupported country: ${countryCode}`);
  }
  return config;
}

export function getCountryData(countryCode: 'US' | 'NG') {
  const data = COUNTRY_DATA[countryCode];
  if (!data) {
    throw new Error(`Unsupported country: ${countryCode}`);
  }
  return data;
}

export function validateCountryCode(code: string): code is 'US' | 'NG' {
  return code === 'US' || code === 'NG';
}

// Country-specific currency IDs (from database)
export const CURRENCY_IDS = {
  USD: 'f3a1b0b1-c658-4af8-b5d0-b93467829a4d',
  NGN: '1d6a1e31-7e36-4eab-94e1-42f2173ea972',
};

// Country-specific database IDs (from countries table)
export const COUNTRY_IDS = {
  US: '5a60ff99-bd7e-400e-84a6-ebb131789322',
  NG: '84258bff-b7ab-4d9f-83f5-1bd1f4e39ace',
};

// Export all country-specific data
export { US_CONFIG, US_BANK_DATA, US_CONTACT_DATA, NG_CONFIG, NG_BANK_DATA, NG_CONTACT_DATA };
