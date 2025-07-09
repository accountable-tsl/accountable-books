import { z } from "zod";
import { checkSlug } from "../firms/api";

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

export const onboardingStatus = z.enum([
  "not_started",
  "email_verified",
  "company_vitals_needed",
  "first_bank_account_needed",
  "onboarding_complete",
]);
export type OnboardingStatus = z.infer<typeof onboardingStatus>;

export const firmType = z.enum([
  "freelancer",
  "ca_cpa",
  "tax_preparer",
  "international",
]);
export type FirmType = z.infer<typeof firmType>;
export type CompanyStore = {
  companyId: string | null;
  companyType: CompanyType | undefined;
  slug: string | null;
  company: CompanyData | null;
  isLoading: boolean;
  error: string | null;
  onboardingStatus: OnboardingStatus | null;
  fetchCompany: (companyId: string) => void;
  setCompany: (
    company: CompanyData | ((prev: CompanyData | null) => CompanyData | null)
  ) => void;
  setOnboardingStatus: (status: OnboardingStatus) => void;
  clearCompany: () => void;
};

export const baseCompanyData = z.object({
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
export type BaseCompanyData = z.infer<typeof baseCompanyData>;

export const companyOnboardingState = z
  .object({
    steps: z.object({
      company_details_confirmed: z.boolean(),
      first_bank_account_added: z.boolean(),
    }),
    completed_at: z
      .object({
        company_details_confirmed: z.date().nullish(),
        first_bank_account_added: z.date().nullish(),
      })
      .optional(),
    metadata: z.null().nullish(),
  })
  .nullish();

export const companyData = baseCompanyData.extend({
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
  onboardingState: companyOnboardingState,

  countryCode: z.string().nullish(),
  countryName: z.string().nullish(),
  countryPhoneCode: z.string().nullish(),
  countryFlag: z.string().nullish(),
  countryContinent: z.string().nullish(),
  reportingCurrencySymbol: z.string().nullish(),
  isDemoCompany: z.boolean().optional(),
  assignedFirmName: z.string().nullish(),
  assignedFirmSlug: z.string().nullish(),
  assignedFirmIsPlatform: z.boolean().nullish(),
  assignedFirmLogo: z.string().nullish(),
});
export type CompanyData = z.infer<typeof companyData>;

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

export const updateCompanySchema = companyData
  .omit({
    id: true,
    createdById: true,
    isPlatform: true,
    isDemoCompany: true,
    assignedFirmIsPlatform: true,
    assignedFirmLogo: true,
    assignedFirmName: true,
    assignedFirmSlug: true,
  })
  .extend({
    slug: z.string().max(20).optional(),
    firmType: firmType.optional(),
  })
  .partial();

export type UpdateCompanyData = z.infer<typeof updateCompanySchema>;

export const slugSchema = z
  .string()
  .trim()
  .min(3, "Slug must be at least 3 characters ")
  .max(20, "Slug must not exceed 20 characters")
  .refine((v) => !v.startsWith("-") && !v.endsWith("-"), {
    message: "Slug cannot start or end with a hyphen",
  })
  .refine((v) => !v.includes("--"), {
    message: "Slug cannot contain consecutive hyphens",
  })
  .refine((v) => !/\d/.test(v), {
    message: "Slug must not contain numbers",
  })
  .refine((v) => v === v.toLowerCase(), {
    message: "Slug must be all lowercase letters",
  })
  .refine((val) => /^[a-z-]+$/.test(val), {
    message: "Slug must contain only lowercase letters and hyphens",
  });

export const updateCompanyVitalsSchema = companyData
  .omit({
    id: true,
    createdById: true,
    isPlatform: true,
    isDemoCompany: true,
    assignedFirmIsPlatform: true,
    assignedFirmLogo: true,
    assignedFirmName: true,
    onboardingState: true,
  })
  .extend({
    assignedFirmSlug: slugSchema.nullish(),
    displayName: z
      .string()
      .min(2, "Display name must be at least 2 characters")
      .max(256)
      .nullish(),
  });

export type UpdateCompanyVitalsData = z.infer<typeof updateCompanyVitalsSchema>;
