import { z } from "zod";

export type CompanyStore = {
  companyId: string | null;
  companyType: CompanyType | undefined;
  slug: string | null;
  company: CompanyData | null;
  isLoading: boolean;
  error: string | null;
  fetchCompany: (companyId: string) => void;
  setCompany: (company: CompanyData) => void;
  clearCompany: () => void;
};

export type CompanyData = {
  id: string;
  legalName: string;
  companyType: CompanyType;
  yearEndDay: number;
  yearEndMonth: number;
  countryId: string;
  reportingCurrencyId: string;
  createdById: string;

  displayName: string | null;
  address: string | null;
  companyLogo: string | null;
  description: string | null;
  website: string | null;
  industry: string | null;
  companySize: string | null;
  revenue: string | null;
  companyRegistrationNumber: string | null;
  companyTaxId: string | null;
  reportingFramework: string | null;
  isPlatform: boolean;

  countryCode: string | null;
  countryName: string | null;
  countryPhoneCode: string | null;
  countryFlag: string | null;
  countryContinent: string | null;

  reportingCurrencyCode: string;
  reportingCurrencyName: string;
  reportingCurrencySymbol: string | null;

  assignedFirmId: string;
  assignedFirmName: string | null;
  assignedFirmSlug: string | null;
  assignedFirmIsPlatform: boolean | null;
  assignedFirmLogo: string | null;
};

export const companyType = z.enum([
  "business",
  "accounting_firm",
  "individual",
]);

export type CompanyType = z.infer<typeof companyType>;
