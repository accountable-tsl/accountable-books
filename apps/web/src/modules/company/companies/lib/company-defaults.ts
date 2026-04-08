import {
  ACCOUNTING_BASIS,
  COMPANY_TYPES,
  DEMO_COMPANIES_IDS,
} from '../model/constants';

import type { CompanyData, CompanyType } from '../model/types';

export function getCompanyTypeDisplay(key: CompanyType): string {
  return COMPANY_TYPES.find((item) => item.key === key)?.type || key;
}

export function getAccountingBasisDisplay(key: string): string {
  return ACCOUNTING_BASIS.find((item) => item.value === key)?.label || key;
}

export function getDefaultCompanyData(): CompanyData {
  return {
    id: '',
    legalName: '',
    companyType: 'business',
    yearEndDay: 31,
    yearEndMonth: 12,
    countryId: '',
    reportingCurrencyId: '',
    createdById: '',
    createdAt: new Date(0).toISOString(),
    defaultTimezone: 'Etc/UTC',
    verification: {
      legalName: { verifiedAt: null },
      address: { verifiedAt: null },
      registrationNumber: { verifiedAt: null },
      taxId: { verifiedAt: null },
    },
    reportingCurrencyCode: '',
    reportingCurrencyName: '',
    assignedFirmId: null,
    isPlatform: false,

    displayName: null,
    address: null,
    companyLogo: null,
    companyLogoKey: null,
    description: null,
    website: null,
    industry: null,
    companySize: null,
    revenue: null,
    companyRegistrationNumber: null,
    companyTaxId: null,
    reportingFramework: null,
    accountingBasis: 'modified_accrual_basis',
    countryCode: null,
    countryName: null,
    countryPhoneCode: null,
    countryFlag: null,
    countryContinent: null,
    reportingCurrencySymbol: null,
    onboardingState: null,
    isDemoCompany: false,
    assignedFirmName: null,
    assignedFirmSlug: null,
    assignedFirmIsPlatform: null,
    assignedFirmLogo: null,
  };
}

export function isDemoCompany(companyId: string): boolean {
  return Object.values(DEMO_COMPANIES_IDS).includes(companyId);
}
