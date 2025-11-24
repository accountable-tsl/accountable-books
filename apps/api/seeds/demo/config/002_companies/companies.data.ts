import {
  COMPANY_TYPES,
  DEMO_COUNTRIES,
  DEMO_CURRENCIES,
  type DemoCompanyType,
  type DemoCountry,
  type DemoCurrency,
  type DemoFilter,
} from '../../shared/config.js';
import { resolveFiltersToIds } from '../../shared/utils.js';
import { type DemoUser, NG_USER, US_USER } from '../001_users/users.data.js';

type BaseDemoCompany = {
  name: string;
  shortCode: string;
  currency: DemoCurrency;
  country: DemoCountry;
  companyType: DemoCompanyType;
  createdBy: DemoUser;
  accountingBasis?: 'modified_accrual_basis' | 'modified_cash_basis';
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
  country: DEMO_COUNTRIES.US,
  currency: DEMO_CURRENCIES.USD,
  createdBy: US_USER,
};

const US_BIZ: DemoCompany = {
  ...USBaseCompany,
  name: 'Green Tech Demo Inc.',
  shortCode: 'bizDemoUS',
  companyType: COMPANY_TYPES.BUSINESS,
};

const US_FIRM: DemoCompany = {
  ...USBaseCompany,
  companyType: COMPANY_TYPES.ACCOUNTING_FIRM,
  name: 'Smith and Co. Demo CPA',
  shortCode: 'firmDemoUS',
  slug: 'us-demo',
};

const US_IND: DemoCompany = {
  ...USBaseCompany,
  companyType: COMPANY_TYPES.INDIVIDUAL,
  name: "Uma's Finances",
  shortCode: 'indDemoUS',
};

export const US_DEMO_COMPANIES = [US_BIZ, US_FIRM, US_IND];

const NGBaseCompany = {
  country: DEMO_COUNTRIES.NG,
  currency: DEMO_CURRENCIES.NGN,
  createdBy: NG_USER,
};

const NG_BIZ: DemoCompany = {
  ...NGBaseCompany,
  companyType: COMPANY_TYPES.BUSINESS,
  name: '9ja Fusion Demo Ltd',
  shortCode: 'bizDemoNG',
};

const NG_FIRM: DemoCompany = {
  ...NGBaseCompany,
  companyType: COMPANY_TYPES.ACCOUNTING_FIRM,
  name: 'Lagos Accounting Firm',
  shortCode: 'firmDemoNG',
  slug: 'ng-demo',
};

const NG_IND: DemoCompany = {
  ...NGBaseCompany,
  companyType: COMPANY_TYPES.INDIVIDUAL,
  name: "Ronke's Finances",
  shortCode: 'indDemoNG',
  accountingBasis: 'modified_cash_basis',
};
export const NG_DEMO_COMPANIES = [NG_BIZ, NG_FIRM, NG_IND];

export const DEMO_COMPANIES: DemoCompany[] = [
  ...US_DEMO_COMPANIES,
  ...NG_DEMO_COMPANIES,
];
export const DEMO_COMPANIES_IDS = DEMO_COMPANIES.map((c) => c.shortCode);

export type DemoCompaniesMap = {
  company: DemoCompany;
  user: DemoUser;
  country: DemoCountry;
  currency: DemoCurrency;
  companyType: DemoCompanyType;
};

export const generateDemoCompaniesMap = (
  filters?: DemoFilter,
): DemoCompaniesMap[] => {
  const companyIds = filters
    ? resolveFiltersToIds(filters)
    : DEMO_COMPANIES_IDS;

  const usMap = US_DEMO_COMPANIES.map((company) => ({
    company,
    user: US_USER,
    country: DEMO_COUNTRIES.US,
    currency: DEMO_CURRENCIES.USD,
    companyType: company.companyType,
  }));
  const ngMap = NG_DEMO_COMPANIES.map((company) => ({
    company,
    user: NG_USER,
    country: DEMO_COUNTRIES.NG,
    currency: DEMO_CURRENCIES.NGN,
    companyType: company.companyType,
  }));
  const map = [...usMap, ...ngMap];

  const filteredMap = map.filter((item) =>
    companyIds.includes(item.company.shortCode),
  );
  return filteredMap;
};

export const DEMO_COMPANIES_MAP: DemoCompaniesMap[] =
  generateDemoCompaniesMap();
