import { z } from "zod";

export const companyType = z.enum([
  "business",
  "accounting_firm",
  "individual",
]);
export type CompanyType = z.infer<typeof companyType>;

export const accountingBasis = z.enum([
  "modified_cash_basis",
  "modified_accrual_basis",
]);
export type AccountingBasis = z.infer<typeof accountingBasis>;

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

const BaseCompanyDataSchema = z.object({
  id: z.string(),
  legalName: z.string(),
  companyType: companyType,
  yearEndDay: z.number().min(1).max(31),
  yearEndMonth: z.number().min(1).max(12),
  countryId: z.string(),
  reportingCurrencyId: z.string(),
  createdById: z.string(),
  reportingCurrencyCode: z.string(),
  reportingCurrencyName: z.string(),
  assignedFirmId: z.string(),
  isPlatform: z.boolean().optional(),
});
export type BaseCompanyData = z.infer<typeof BaseCompanyDataSchema>;

// export type CompanyData = {
//   id: string;
//   legalName: string;
//   companyType: CompanyType;
//   yearEndDay: number;
//   yearEndMonth: number;
//   countryId: string;
//   reportingCurrencyId: string;
//   createdById: string;

//   displayName: string | null;
//   address: string | null;
//   companyLogo: string | null;
//   description: string | null;
//   website: string | null;
//   industry: string | null;
//   companySize: string | null;
//   revenue: string | null;
//   companyRegistrationNumber: string | null;
//   companyTaxId: string | null;
//   reportingFramework: string | null;
//   isPlatform: boolean;

//   countryCode: string | null;
//   countryName: string | null;
//   countryPhoneCode: string | null;
//   countryFlag: string | null;
//   countryContinent: string | null;

//   reportingCurrencyCode: string;
//   reportingCurrencyName: string;
//   reportingCurrencySymbol: string | null;

//   assignedFirmId: string;
//   assignedFirmName: string | null;
//   assignedFirmSlug: string | null;
//   assignedFirmIsPlatform: boolean | null;
//   assignedFirmLogo: string | null;
// };

const CompanyDataSchema = BaseCompanyDataSchema.extend({
  displayName: z.string().nullish(),
  address: z.string().nullish(),
  companyLogo: z.string().nullish(),
  companyLogoKey: z.string().nullish(),
  description: z.string().nullish(),
  website: z.string().nullish(),
  industry: z.string().nullish(),
  companySize: z.string().nullish(),
  revenue: z.string().nullish(),
  companyRegistrationNumber: z.string().nullish(),
  companyTaxId: z.string().nullish(),
  reportingFramework: z.string().nullish(),
  accountingBasis: accountingBasis.nullish(),
  countryCode: z.string().nullish(),
  countryName: z.string().nullish(),
  countryPhoneCode: z.string().nullish(),
  countryFlag: z.string().nullish(),
  countryContinent: z.string().nullish(),
  reportingCurrencySymbol: z.string().nullish(),
  assignedFirmName: z.string().nullish(),
  assignedFirmSlug: z.string().nullish(),
  assignedFirmIsPlatform: z.boolean().nullish(),
  assignedFirmLogo: z.string().nullish(),
});

export type CompanyData = z.infer<typeof CompanyDataSchema>;
