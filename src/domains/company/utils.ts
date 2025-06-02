import { ACCOUNTING_BASIS, COMPANY_TYPES } from "./constants";
import { CompanyData, CompanyType } from "./types";

export const getCompanyTypeDisplay = (key: CompanyType) => {
  return COMPANY_TYPES.find((item) => item.key === key)?.type || key;
};

export const getAccountingBasisDisplay = (key: string) => {
  return ACCOUNTING_BASIS.find((item) => item.value === key)?.label || key;
};

export const getDefaultCompanyData = (): CompanyData => ({
  id: "",
  legalName: "",
  companyType: "business",
  yearEndDay: 31,
  yearEndMonth: 12,
  countryId: "",
  reportingCurrencyId: "",
  createdById: "",
  reportingCurrencyCode: "",
  reportingCurrencyName: "",
  assignedFirmId: "",

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
  accountingBasis: null,
  countryCode: null,
  countryName: null,
  countryPhoneCode: null,
  countryFlag: null,
  countryContinent: null,
  reportingCurrencySymbol: null,
  assignedFirmName: null,
  assignedFirmSlug: null,
  assignedFirmIsPlatform: null,
  assignedFirmLogo: null,
  onboardingStatus: "not_started",
});
