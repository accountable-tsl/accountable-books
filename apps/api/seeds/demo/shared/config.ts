export const COUNTRY_CODES = {
  US: 'US',
  NG: 'NG',
} as const;
export type DemoCountryCode = (typeof COUNTRY_CODES)[keyof typeof COUNTRY_CODES];

export const COMPANY_TYPES = {
  INDIVIDUAL: 'individual',
  BUSINESS: 'business',
  ACCOUNTING_FIRM: 'accounting_firm',
} as const;
export type DemoCompanyType = (typeof COMPANY_TYPES)[keyof typeof COMPANY_TYPES];

export const CURRENCY_CODES = {
  USD: 'USD',
  NGN: 'NGN',
} as const;
export type DemoCurrencyCode = (typeof CURRENCY_CODES)[keyof typeof CURRENCY_CODES];

export type DemoFilter = {
  countryCodes?: DemoCountryCode[];
  companyTypes?: DemoCompanyType[];
  companyIds?: string[];
};
