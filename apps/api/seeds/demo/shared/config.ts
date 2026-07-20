import { getCountryFromCatalogByCode } from '../../../src/bootstrap/catalogs/countries/countries.js';
import { getCurrencyFromCatalogByCode } from '../../../src/bootstrap/catalogs/currencies/currencies.js';

export const COUNTRY_CODES = {
  US: 'US',
  NG: 'NG',
} as const;
export type DemoCountryCode =
  (typeof COUNTRY_CODES)[keyof typeof COUNTRY_CODES];

export interface DemoCountry {
  code: DemoCountryCode;
  name: string;
  phone_code: string;
  id?: string;
  flag?: string | null;
  continent?: string | null;
}

function getDemoCountry(code: DemoCountryCode): DemoCountry {
  const country = getCountryFromCatalogByCode(code);
  if (!country) {
    throw new Error(`Missing country catalog entry for ${code}`);
  }

  return {
    id: country.id,
    code,
    name: country.name,
    phone_code: country.phoneCode,
    flag: country.flag,
    continent: country.continent,
  };
}

export const DEMO_COUNTRIES: Record<DemoCountryCode, DemoCountry> = {
  NG: getDemoCountry('NG'),
  US: getDemoCountry('US'),
} as const;

export const COMPANY_TYPES = {
  INDIVIDUAL: 'individual',
  BUSINESS: 'business',
  ACCOUNTING_FIRM: 'accounting_firm',
} as const;
export type DemoCompanyType =
  (typeof COMPANY_TYPES)[keyof typeof COMPANY_TYPES];

export const CURRENCY_CODES = {
  USD: 'USD',
  NGN: 'NGN',
} as const;
export type DemoCurrencyCode =
  (typeof CURRENCY_CODES)[keyof typeof CURRENCY_CODES];

export interface DemoCurrency {
  id: string;
  name: string;
  code: DemoCurrencyCode;
  symbol: string;
  minorUnit: number;
}

function getDemoCurrency(code: DemoCurrencyCode): DemoCurrency {
  const currency = getCurrencyFromCatalogByCode(code);
  if (!currency) {
    throw new Error(`Missing currency catalog entry for ${code}`);
  }

  return {
    id: currency.id,
    name: currency.name,
    code,
    symbol: currency.symbol,
    minorUnit: currency.minorUnit,
  };
}

export const DEMO_CURRENCIES = {
  USD: getDemoCurrency('USD'),
  NGN: getDemoCurrency('NGN'),
} as const;

export type DemoFilter = {
  countryCodes?: DemoCountryCode[];
  companyTypes?: DemoCompanyType[];
  companyIds?: string[];
};
