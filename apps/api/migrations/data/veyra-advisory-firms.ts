/**
 * Launch accounting firms seeded once via migration.
 * Stable IDs keep environments aligned; override via env when needed.
 */

export const VEYRA_NG_COMPANY_ID =
  process.env.VEYRA_NG_COMPANY_ID ?? '8a7b6c5d-4e3f-2a1b-9c0d-1e2f3a4b5c6d';

export const VEYRA_US_COMPANY_ID =
  process.env.VEYRA_US_COMPANY_ID ?? '9b8c7d6e-5f4a-4b2c-9d1e-2f3a4b5c6d7e';

export const VEYRA_COUNTRY_IDS = {
  NG: '84258bff-b7ab-4d9f-83f5-1bd1f4e39ace',
  US: '5a60ff99-bd7e-400e-84a6-ebb131789322',
} as const;

export const VEYRA_CURRENCY_IDS = {
  NGN: '1d6a1e31-7e36-4eab-94e1-42f2173ea972',
  USD: 'f3a1b0b1-c658-4af8-b5d0-b93467829a4d',
} as const;

export type VeyraAdvisoryFirmSeed = {
  id: string;
  legalName: string;
  displayName: string;
  shortCode: string;
  slug: string;
  countryId: string;
  reportingCurrencyId: string;
  defaultTimezone: string;
  reportingFramework: 'ifrs' | 'us_gaap';
};

export const VEYRA_ADVISORY_FIRMS: readonly VeyraAdvisoryFirmSeed[] = [
  {
    id: VEYRA_NG_COMPANY_ID,
    legalName: 'Veyra Advisory LLP',
    displayName: 'Veyra Advisory LLP',
    shortCode: 'veyraNG',
    slug: 'veyra-ng',
    countryId: VEYRA_COUNTRY_IDS.NG,
    reportingCurrencyId: VEYRA_CURRENCY_IDS.NGN,
    defaultTimezone: 'Africa/Lagos',
    reportingFramework: 'ifrs',
  },
  {
    id: VEYRA_US_COMPANY_ID,
    legalName: 'Veyra Advisory LLC',
    displayName: 'Veyra Advisory LLC',
    shortCode: 'veyraUS',
    slug: 'veyra-us',
    countryId: VEYRA_COUNTRY_IDS.US,
    reportingCurrencyId: VEYRA_CURRENCY_IDS.USD,
    defaultTimezone: 'America/New_York',
    reportingFramework: 'us_gaap',
  },
] as const;
