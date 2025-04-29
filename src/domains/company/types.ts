import { z } from "zod";

export type CompanyStore = {
  companyId: string | null;
  companyType: CompanyType | null;
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
  displayName?: string;
  name?: string;
  website: string;
  industry: string;
  companySize: string;
  revenue: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  countryPhoneCode: string;
  countryFlag: string;
  countryContinent: string;
  reportingCurrencyId: string;
  reportingCurrencyCode: string;
  reportingCurrencyName: string;
  reportingCurrencySymbol: string;
  assignedFirmName: string;
  assignedFirmSlug: string;
  assignedFirmLogo: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

export const companyType = z.enum([
  "business",
  "accounting_firm",
  "individual",
]);

export type CompanyType = z.infer<typeof companyType>;
