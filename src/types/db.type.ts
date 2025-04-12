import Decimal from "decimal.js";
import { z } from "zod";
import { zDate, zEmail } from "./generic";
import { coaTemplateName } from "../models/coaTemplate.model";

//Custom decimal handler
export const DecimalInput = z.union([
  z.string(),
  z.number(),
  z.instanceof(Decimal),
]);

export const DecimalSchema = z
  .union([z.string(), z.number(), z.instanceof(Decimal)])
  .transform((val) => new Decimal(val.toString()));

// Base
export const dbStandardFields = z.object({
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
  is_deleted: z.boolean().optional(),
  deleted_at: z.date().optional(),
});
export type StandardFields = z.infer<typeof dbStandardFields>;

export const dbBaseFields = z
  .object({ id: z.string().uuid() })
  .merge(dbStandardFields);

// role
export const roleName = z.enum([
  "super_admin",
  "admin",
  "bookkeeper",
  "client",
]);

export const newRole = z.object({
  name: roleName,
  description: z.string().optional(),
});

export const role = newRole.merge(dbBaseFields);

export type RoleName = z.infer<typeof roleName>;
export type NewRoleInput = z.infer<typeof newRole>;
export type Role = z.infer<typeof role>;

// permission
export const newPermission = z.object({
  key: z.string().regex(/^[a-z_]+:[a-z_]+$/), // "resource:action"
  action: z.string().min(2),
  resource: z.string().min(2),
  description: z.string().nullish(),
  label: z.string().min(2),
});

export const permission = newPermission.merge(dbBaseFields);

export type NewPermissionInput = z.infer<typeof newPermission>;
export type Permission = z.infer<typeof permission>;

// currency
export const newCurrency = z.object({
  code: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/), // ISO 4217 codes
  name: z.string().min(2).max(50),
  symbol: z.string().min(1).max(5),
});
export const currency = newCurrency.merge(dbBaseFields);
export const currencyWithId = newCurrency.extend({ id: z.string().uuid() });

export type NewCurrencyInput = z.infer<typeof newCurrency>;
export type NewCurrencyWithId = z.infer<typeof currencyWithId>;
export type Currency = z.infer<typeof currency>;

// country
export const newCountry = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .min(2)
    .max(3)
    .transform((val) => val.toUpperCase()),
  name: z.string(),
  phone_code: z.string().max(10),
  flag: z.string().max(10).nullish(),
  continent: z.string().max(50).nullish(),
});
export const country = newCountry.merge(dbBaseFields);

export type NewCountryInput = z.infer<typeof newCountry>;
export type Country = z.infer<typeof country>;

// exchange_rate
export const newExchangeRate = z.object({
  date: z.coerce.date(),
  from_currency_id: z.string().uuid(),
  to_currency_id: z.string().uuid(),
  rate: DecimalInput,
});
export const exchangeRate = newExchangeRate.merge(dbBaseFields);

export type NewExchangeRateInput = z.infer<typeof newExchangeRate>;
export type ExchangeRate = z.infer<typeof exchangeRate>;

// financial_statement
export const fsKey = z.enum(["is", "bs", "cf"]);
export const newFinancialStatement = z.object({
  key: fsKey,
  us_gaap_label: z.string().min(2).max(256),
  ifrs_label: z.string().min(2).max(256),
  default_label: z.string().min(2).max(256),
});
export const financialStatement = newFinancialStatement.merge(dbBaseFields);

export type FinancialStatementKey = z.infer<typeof fsKey>;
export type NewFinancialStatementInput = z.infer<typeof newFinancialStatement>;
export type FinancialStatement = z.infer<typeof financialStatement>;

// debit_credit
export const debitCredit = z.enum(["debit", "credit"]);
export type DebitCredit = z.infer<typeof debitCredit>;

// account_element
export const newAccountElement = z.object({
  key: z.string().max(64),
  label: z.string().max(256),
  default_side: debitCredit,
  description: z.string().max(512).nullish(),
  report_code: z
    .string()
    .regex(
      /^(BS|IS)(\.[A-Z]{3}){1,2}$/,
      "Report code must follow BS|IS.XXX or BS|IS.XXX.XXX format"
    )
    .max(64)
    .nullish(),
  parent_id: z.string().uuid().nullable(),
  financial_statement_id: z.string().uuid(),
});
export const accountElement = newAccountElement.merge(dbBaseFields);
export const accountElementWithRequiredReportCode = accountElement.required({
  id: true,
  report_code: true,
});

export type NewAccountElementInput = z.infer<typeof newAccountElement>;
export type AccountElement = z.infer<typeof accountElement>;
export type AccountElementWithRequiredReportCode = z.infer<
  typeof accountElementWithRequiredReportCode
>;
// account_type
export const newAccountType = z.object({
  key: z.string().max(64),
  label: z.string().max(256),
  description: z.string().max(512).nullish(),
  account_element_id: z.string().uuid(),
  report_code: z
    .string()
    .regex(
      /^(BS|IS)(\.[A-Z]{3}){3,4}$/,
      "Report code must follow BS|IS.XXX.XXX.XXX or BS|IS.XXX.XXX.XXX.XXX format"
    )
    .max(64)
    .nullish(),
});
export const accountType = newAccountType.merge(dbBaseFields);
export const accountTypeWithRequiredReportCode = accountType.required({
  id: true,
  report_code: true,
});

export type NewAccountTypeInput = z.infer<typeof newAccountType>;
export type AccountType = z.infer<typeof accountType>;
export type AccountTypeWithRequiredReportCode = z.infer<
  typeof accountTypeWithRequiredReportCode
>;

// coa_template
export const newCoaTemplate = z.object({
  template_name: coaTemplateName,
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(256, "Max account name length exceeded"),
  code: z.string().min(1, "Code is required").max(256).nullish(),
  description: z.string().max(512).nullish(),
  account_type_id: z.string().uuid("Account Type ID is required"),
  is_active: z.boolean().default(true),
});
export const coaTemplate = newCoaTemplate.merge(dbBaseFields);

export type CoaTemplateName = z.infer<typeof coaTemplateName>;
export type NewCoaTemplateInput = z.infer<typeof newCoaTemplate>;
export type CoaTemplate = z.infer<typeof coaTemplate>;

// user
export const userStatus = z.enum(["active", "inactive", "invited", "disabled"]);
export const userInviteStatus = z.enum(["pending", "accepted", "declined"]);
export const authProvider = z.enum(["local"]);
export const newUser = z.object({
  firstname: z.string().min(1).max(256),
  lastname: z.string().min(1).max(256).nullish(),
  email: zEmail(),
  password_hash: z.string().min(8).optional(),
  phone_number: z.string().max(50).nullish(),
  avatar_url: z.string().nullish(),
  status: userStatus,

  email_verified: z.boolean().default(false),
  email_verification_expiry: zDate.nullish(),
  email_verified_at: zDate.nullish(),
  email_verification_token_hash: z.string().nullish(),

  invite_status: userInviteStatus.nullish(),
  invited_by_id: z.string().uuid().nullish(),
  invited_at: zDate.nullish(),
  invite_expiry: zDate.nullish(),

  failed_login_attempts: z.number().default(0),
  last_login_at: zDate.nullish(),
  last_failed_login_at: zDate.nullish(),

  auth_provider: authProvider.default("local").nullish(),
  provider_user_id: z.string().nullish(),
});

export const newUserDirect = newUser.extend({
  password: z.string().min(8),
  status: z.literal("active"),
});

export const newUserInvite = newUser.extend({
  password: z.undefined(),
  status: z.literal("invited"),
});

export const user = newUser.merge(dbBaseFields);
export type NewUserDirect = z.infer<typeof newUserDirect>;
export type NewUserInvite = z.infer<typeof newUserInvite>;
export type UserStatus = z.infer<typeof userStatus>;
export type UserInviteStatus = z.infer<typeof userInviteStatus>;
export type NewUserInput = z.infer<typeof newUser>;
export type User = z.infer<typeof user>;

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
  website: z.string().max(256).nullish(),
  industry: z.string().max(256).nullish(),
  team_size: z.string().max(256).nullish(),
  revenue: z.string().max(256).nullish(),
  reporting_framework: reportingFramework.nullish(),
  id: z.string().uuid().optional(),
  short_code: z.string().max(50).optional(),
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

export const firmType = z.enum([
  "freelancer",
  "ca_cpa",
  "tax_preparer",
  "international",
]);
// accounting_firm
export const newAccountingFirm = z.object({
  legal_name: z.string().max(256),
  country_id: z.string().uuid(),
  company_id: z.string().uuid(),
  created_by_id: z.string().uuid(),

  firm_type: firmType.nullish(),
  firm_size: z.string().max(256).nullish(),
  website: z.string().max(256).nullish(),
  revenue: z.string().max(256).nullish(),
  logo_url: z.string().max(256).nullish(),
});
export const accountingFirm = newAccountingFirm.merge(dbBaseFields);

export type FirmType = z.infer<typeof firmType>;
export type NewAccountingFirmInput = z.infer<typeof newAccountingFirm>;
export type AccountingFirm = z.infer<typeof accountingFirm>;

export const newUserCompanyRole = z.object({
  user_id: z.string().uuid(),
  company_id: z.string().uuid(),
  role_id: z.string().uuid(),
});
export const userCompanyRole = newUserCompanyRole.merge(dbBaseFields);

export type NewUserCompanyRole = z.infer<typeof newUserCompanyRole>;
export type UserCompanyRole = z.infer<typeof userCompanyRole>;

// coa
export const newCoa = z.object({
  company_id: z.string().uuid(),
  name: z.string().max(256),
  account_type_id: z.string().uuid(),
  currency_id: z.string().uuid(),
  created_by_id: z.string().uuid(),
  is_active: z.boolean().default(true),
  code: z.string().max(256).nullish(),
  description: z.string().max(512).nullish(),
});
export const coa = newCoa.merge(dbBaseFields);

export type NewCoa = z.infer<typeof newCoa>;
export type Coa = z.infer<typeof coa>;
