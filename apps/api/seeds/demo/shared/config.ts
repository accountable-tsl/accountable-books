import { COUNTRY_MAP } from '../../../migrations/20250403184419_countries';
import { CURRENCY_MAP } from '../../../migrations/20250403184410_currencies';

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
export const DEMO_COUNTRIES: Record<DemoCountryCode, DemoCountry> = {
  NG: COUNTRY_MAP.get('NG') as DemoCountry,
  US: COUNTRY_MAP.get('US') as DemoCountry,
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
}
export const DEMO_CURRENCIES = {
  USD: CURRENCY_MAP.get('USD') as DemoCurrency,
  NGN: CURRENCY_MAP.get('NGN') as DemoCurrency,
} as const;

export type DemoFilter = {
  countryCodes?: DemoCountryCode[];
  companyTypes?: DemoCompanyType[];
  companyIds?: string[];
};
