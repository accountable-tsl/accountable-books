import {
  COMPANY_TYPES,
  COUNTRY_CODES,
  CURRENCY_CODES,
  DemoCompanyType,
  DemoCountryCode,
  DemoCurrencyCode,
  DemoFilter,
} from '../../shared/config';
import { resolveFiltersToIds } from '../../shared/utils';
import { DemoUser, NG_USER, US_USER } from '../001_users/users.data';

type BaseDemoCompany = {
  id: string;
  name: string;
  shortCode: string;
  currencyCode: DemoCurrencyCode;
  countryCode: DemoCountryCode;
  companyType: DemoCompanyType;
  createdBy: string;
};
export type DemoCompany =
  | (BaseDemoCompany & {
      companyType: Omit<DemoCompanyType, 'accounting_firm'>;
    })
  | (BaseDemoCompany & {
      companyType: (typeof COMPANY_TYPES)['ACCOUNTING_FIRM'];
      slug: string;
    });

const USBaseCompany = {
  countryCode: COUNTRY_CODES.US,
  currencyCode: CURRENCY_CODES.USD,
  createdBy: US_USER.id,
};

const US_BIZ: DemoCompany = {
  ...USBaseCompany,
  id: '00000000-0000-4000-8000-000000000011',
  name: 'Green Tech Demo Inc.',
  shortCode: 'bizDemoUS',
  companyType: COMPANY_TYPES.BUSINESS,
};

const US_FIRM: DemoCompany = {
  ...USBaseCompany,
  id: '00000000-0000-4000-8000-000000000012',
  companyType: COMPANY_TYPES.ACCOUNTING_FIRM,
  name: 'Smith and Co. Demo CPA',
  shortCode: 'firmDemoUS',
  slug: 'us-demo',
};

const US_IND: DemoCompany = {
  ...USBaseCompany,
  id: '00000000-0000-4000-8000-000000000013',
  companyType: COMPANY_TYPES.INDIVIDUAL,
  name: "Uma's Finances",
  shortCode: 'indDemoUS',
};

export const US_DEMO_COMPANIES = [US_BIZ, US_FIRM, US_IND];

const NGBaseCompany = {
  countryCode: COUNTRY_CODES.NG,
  currencyCode: CURRENCY_CODES.NGN,
  createdBy: NG_USER.id,
};

const NG_BIZ: DemoCompany = {
  ...NGBaseCompany,
  id: '00000000-0000-4000-8000-000000000021',
  companyType: COMPANY_TYPES.BUSINESS,
  name: '9ja Fusion Demo Ltd',
  shortCode: 'bizDemoNG',
};

const NG_FIRM: DemoCompany = {
  ...NGBaseCompany,
  id: '00000000-0000-4000-8000-000000000022',
  companyType: COMPANY_TYPES.ACCOUNTING_FIRM,
  name: 'Lagos Accounting Firm',
  shortCode: 'firmDemoNG',
  slug: 'ng-demo',
};

const NG_IND: DemoCompany = {
  ...NGBaseCompany,
  id: '00000000-0000-4000-8000-000000000023',
  companyType: COMPANY_TYPES.INDIVIDUAL,
  name: "Ronke's Finances",
  shortCode: 'indDemoNG',
};
export const NG_DEMO_COMPANIES = [NG_BIZ, NG_FIRM, NG_IND];

export const DEMO_COMPANIES: DemoCompany[] = [...US_DEMO_COMPANIES, ...NG_DEMO_COMPANIES];
export const DEMO_COMPANIES_IDS = DEMO_COMPANIES.map((c) => c.id);

export type DemoCompaniesMap = {
  company: DemoCompany;
  user: DemoUser;
  countryCode: DemoCountryCode;
  currencyCode: DemoCurrencyCode;
  companyType: DemoCompanyType;
};

export const generateDemoCompaniesMap = (filters?: DemoFilter): DemoCompaniesMap[] => {
  const companyIds = filters ? resolveFiltersToIds(filters) : DEMO_COMPANIES_IDS;

  const usMap = US_DEMO_COMPANIES.map((company) => ({
    company,
    user: US_USER,
    countryCode: COUNTRY_CODES.US,
    currencyCode: CURRENCY_CODES.USD,
    companyType: company.companyType,
  }));
  const ngMap = NG_DEMO_COMPANIES.map((company) => ({
    company,
    user: NG_USER,
    countryCode: COUNTRY_CODES.NG,
    currencyCode: CURRENCY_CODES.NGN,
    companyType: company.companyType,
  }));
  const map = [...usMap, ...ngMap];

  const filteredMap = map.filter((item) => companyIds.includes(item.company.id));
  return filteredMap;
};

export const DEMO_COMPANIES_MAP: DemoCompaniesMap[] = generateDemoCompaniesMap();
