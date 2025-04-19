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
