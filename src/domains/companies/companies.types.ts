import { z } from "zod";
import { dbBaseFields } from "../../core/validation/schemas";
import { SnakeToCamelCaseObject } from "../../shared/utils/formatting.utils";

export const companyType = z.enum([
  "business",
  "individual",
  "accounting_firm",
]);
export const reportingFramework = z.enum(["ifrs", "us_gaap"]);
export const accountingBasis = z.enum([
  "modified_cash_basis",
  "modified_accrual_basis",
]);

const stripSlugIfNotAccountingFirm = (data: any) => {
  if (data.type !== "accounting_firm") {
    const { slug, ...rest } = data;
    return rest;
  }
  return data;
};

export const newCompanyInput = z.object({
  legal_name: z.string().max(256),
  country_id: z.string().uuid(),
  type: companyType,
  reporting_currency_id: z.string().uuid(),
  accounting_basis: accountingBasis.optional(),
  is_onboarding_complete: z.boolean().default(false).optional(),

  display_name: z.string().max(256).optional(),
  year_end_day: z.number().optional(),
  year_end_month: z.number().optional(),
  created_by_id: z.string().optional(),
  address: z.string().max(512).nullish(),
  logo_url: z.string().nullish(),
  logo_key: z.string().nullish(),
  description: z.string().max(2000).nullish(),
  website: z.string().url().max(256).nullish(),
  industry: z.string().max(256).nullish(),
  team_size: z.string().max(256).nullish(),
  revenue: z.string().max(256).nullish(),
  reporting_framework: reportingFramework.nullish(),
  id: z.string().uuid().optional(),
  short_code: z.string().max(50).optional(),
  assigned_firm_id: z.string().uuid().optional(),
  load_coa_template: z.boolean().optional(),
  registration_number: z.string().max(256).nullish(),
  tax_id: z.string().max(256).nullish(),
  is_demo_company: z.boolean().default(false).optional(),
  slug: z.string().max(50).optional(),
});

export const newCompany = newCompanyInput
  .extend({
    display_name: z.string().max(256), // legal_name
    accounting_basis: accountingBasis,
    short_code: z.string().max(50),
    year_end_day: z.number(),
    year_end_month: z.number(),
    created_by_id: z.string().uuid(),
    is_demo_company: z.boolean().default(false),
  })
  .omit({ slug: true });

export const company = newCompany
  .merge(dbBaseFields)
  .transform(stripSlugIfNotAccountingFirm);

export type CompanyType = z.infer<typeof companyType>;
export type ReportingFramework = z.infer<typeof reportingFramework>;
export type AccountingBasis = z.infer<typeof accountingBasis>;
export type NewCompanyInput = z.infer<typeof newCompanyInput>;
export type NewCompany = z.infer<typeof newCompany>;
export type Company = z.infer<typeof company>;

export type NewCompanyInputCamel = SnakeToCamelCaseObject<NewCompanyInput>;

export type GetCompanyResponse = {
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
  companyLogoKey: string | null;
  description: string | null;
  website: string | null;
  industry: string | null;
  companySize: string | null;
  revenue: string | null;
  companyRegistrationNumber: string | null;
  companyTaxId: string | null;
  isPlatform: boolean;

  countryCode: string | null;
  countryName: string | null;
  countryPhoneCode: string | null;
  countryFlag: string | null;
  countryContinent: string | null;

  reportingFramework: ReportingFramework | null;
  accountingBasis: AccountingBasis;
  isOnboardingComplete: boolean;
  isDemoCompany: boolean;

  reportingCurrencyCode: string;
  reportingCurrencyName: string;
  reportingCurrencySymbol: string | null;

  assignedFirmId: string | null;
  assignedFirmName: string | null;
  assignedFirmSlug: string | null;
  assignedFirmIsPlatform: boolean | null;
  assignedFirmLogo: string | null;
};

export const fieldToColumnMap: Partial<
  Record<keyof GetCompanyResponse, string>
> = {
  legalName: "legal_name",
  displayName: "display_name",
  address: "address",
  companyType: "type",
  companyLogo: "logo_url",
  companyLogoKey: "logo_key",
  description: "description",
  website: "website",
  industry: "industry",
  companySize: "team_size",
  revenue: "revenue",
  yearEndDay: "year_end_day",
  yearEndMonth: "year_end_month",
  companyRegistrationNumber: "registration_number",
  companyTaxId: "tax_id",

  countryId: "country_id",
  reportingFramework: "reporting_framework",
  accountingBasis: "accounting_basis",
  reportingCurrencyId: "reporting_currency_id",

  assignedFirmId: "assigned_firm_id",
  isPlatform: "is_platform",
};
