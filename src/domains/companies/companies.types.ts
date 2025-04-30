import { z } from "zod";
import { dbBaseFields } from "../../core/validation/schemas";

export const companyType = z.enum([
  "business",
  "individual",
  "accounting_firm",
]);
export const reportingFramework = z.enum(["ifrs", "us_gaap"]);

export const newCompanyInput = z.object({
  legal_name: z.string().max(256),
  country_id: z.string().uuid(),
  type: companyType,
  reporting_currency_id: z.string().uuid(),

  display_name: z.string().max(256).optional(),
  year_end_day: z.number().optional(),
  year_end_month: z.number().optional(),
  created_by_id: z.string().optional(),
  address: z.string().max(512).nullish(),
  logo_url: z.string().max(256).nullish(),
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
});

export const newCompany = newCompanyInput.extend({
  display_name: z.string().max(256), // legal_name
  short_code: z.string().max(50),
  year_end_day: z.number(),
  year_end_month: z.number(),
  created_by_id: z.string().uuid(),
});

export const company = newCompany.merge(dbBaseFields);

export type CompanyType = z.infer<typeof companyType>;
export type ReportingFramework = z.infer<typeof reportingFramework>;
export type NewCompanyInput = z.infer<typeof newCompanyInput>;
export type NewCompany = z.infer<typeof newCompany>;
export type Company = z.infer<typeof company>;

export type getCompanyResponse = {
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
  reportingFramework: ReportingFramework | null;
  isPlatform: boolean;

  countryCode: string | null;
  countryName: string | null;
  countryPhoneCode: string | null;
  countryFlag: string | null;
  countryContinent: string | null;

  reportingCurrencyCode: string;
  reportingCurrencyName: string;
  reportingCurrencySymbol: string | null;

  assignedFirmId: string | null;
  assignedFirmName: string | null;
  assignedFirmSlug: string | null;
  assignedFirmIsPlatform: boolean | null;
  assignedFirmLogo: string | null;
};
