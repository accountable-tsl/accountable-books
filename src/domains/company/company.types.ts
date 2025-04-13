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
  display_name: z.string().max(256).optional(),
  type: companyType,
  year_end_day: z.number().optional(),
  year_end_month: z.number().optional(),
  reporting_currency_id: z.string().uuid(),
  country_id: z.string().uuid(),
  created_by_id: z.string().uuid().optional(),
  address: z.string().max(256).nullish(),
  logo_url: z.string().max(256).nullish(),
  description: z.string().max(512).nullish(),
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
  assigned_firm_id: z.string().uuid(),
});

export const company = newCompany.merge(dbBaseFields);

export type CompanyType = z.infer<typeof companyType>;
export type ReportingFramework = z.infer<typeof reportingFramework>;
export type NewCompanyInput = z.infer<typeof newCompanyInput>;
export type NewCompany = z.infer<typeof newCompany>;
export type Company = z.infer<typeof company>;
