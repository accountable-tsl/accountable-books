import { z } from "zod";
import { dbBaseFields } from "../../core/validation/schemas";
import { SnakeToCamelCaseObject } from "../../shared/utils/formatting.utils";
import { firmType } from "../accountingFirm/accountingFirm.types";

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

  display_name: z.string().max(256).optional(),
  year_end_day: z.number().optional(),
  year_end_month: z.number().optional(),
  created_by_id: z.string().uuid().optional(),
  last_updated_by_id: z.string().uuid().optional(),
  address: z.string().max(512).nullish(),
  logo_url: z.string().nullish(),
  logo_key: z.string().nullish(),
  description: z.string().max(2000).nullish(),
  website: z.string().max(256).nullish(),
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
    is_platform: z.boolean().default(false).optional(),
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

export const getCompanyResponse = z.object({
  id: z.string().uuid(),
  legalName: z.string(),
  companyType: companyType,
  yearEndDay: z.number(),
  yearEndMonth: z.number(),
  countryId: z.string().uuid(),
  reportingCurrencyId: z.string().uuid(),
  createdById: z.string().uuid(),

  displayName: z.string().nullable(),
  address: z.string().nullable(),
  companyLogo: z.string().nullable(),
  companyLogoKey: z.string().nullable(),
  description: z.string().nullable(),
  website: z.string().nullable(),
  industry: z.string().nullable(),
  companySize: z.string().nullable(),
  revenue: z.string().nullable(),
  companyRegistrationNumber: z.string().nullable(),
  companyTaxId: z.string().nullable(),
  isPlatform: z.boolean(),

  countryCode: z.string().nullable(),
  countryName: z.string().nullable(),
  countryPhoneCode: z.string().nullable(),
  countryFlag: z.string().nullable(),
  countryContinent: z.string().nullable(),

  reportingFramework: reportingFramework.nullable(),
  accountingBasis: accountingBasis,
  isOnboardingComplete: z.boolean(),
  isDemoCompany: z.boolean(),

  reportingCurrencyCode: z.string(),
  reportingCurrencyName: z.string(),
  reportingCurrencySymbol: z.string().nullable(),

  assignedFirmId: z.string().uuid().nullable(),
  assignedFirmName: z.string().nullable(),
  assignedFirmSlug: z.string().nullable(),
  assignedFirmIsPlatform: z.boolean().nullable(),
  assignedFirmLogo: z.string().nullable(),
});

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
  Record<keyof GetCompanyResponse, keyof NewCompany>
> = {
  legalName: "legal_name",
  companyType: "type",
  yearEndDay: "year_end_day",
  yearEndMonth: "year_end_month",
  countryId: "country_id",
  reportingCurrencyId: "reporting_currency_id",

  displayName: "display_name",
  address: "address",
  companyLogo: "logo_url",
  companyLogoKey: "logo_key",
  description: "description",
  website: "website",
  industry: "industry",
  companySize: "team_size",
  revenue: "revenue",
  companyRegistrationNumber: "registration_number",
  companyTaxId: "tax_id",
  isPlatform: "is_platform",
  isDemoCompany: "is_demo_company",

  reportingFramework: "reporting_framework",
  accountingBasis: "accounting_basis",

  assignedFirmId: "assigned_firm_id",
};

export const updateCompanySchema = getCompanyResponse
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
    slug: z.string().max(50).optional(),
    firmType: firmType.optional(),
  })
  .partial();

export type UpdateCompanySchema = z.infer<typeof updateCompanySchema>;
