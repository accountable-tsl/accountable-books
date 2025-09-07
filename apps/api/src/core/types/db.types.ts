import { roleKey } from '../../domains/roles/roles.types.js';
import {
  createCamelCaseSchema,
  type SnakeToCamelCaseObject,
} from '../../shared/utils/formatting.utils.js';
import { dbBaseFields, debitCredit } from './core.js';
import { z } from 'zod';

// permission
export const newPermissionInput = z.object({
  key: z.string().regex(/^[a-z_]+:[a-z_]+$/), // "resource:action"
  action: z.string().min(2),
  resource: z.string().min(2),
  description: z.string().optional(),
  label: z.string().min(2),
  roles: z.array(roleKey).optional(),
});
export const newPermission = newPermissionInput.omit({ roles: true });

export const permission = newPermission.merge(dbBaseFields);

export type NewPermissionInput = z.infer<typeof newPermission>;
export type Permission = z.infer<typeof permission>;

export type RolePermission = {
  role_id: string;
  permission_id: string;
  granted_at?: string;
};

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
export const currencyWithId = newCurrency.extend({ id: z.uuid() });

export type NewCurrencyInput = z.infer<typeof newCurrency>;
export type NewCurrencyWithId = z.infer<typeof currencyWithId>;
export type Currency = z.infer<typeof currency>;

// country
export const newCountry = z.object({
  id: z.uuid().optional(),
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

// financial_statement
export const fsKey = z.enum(['is', 'bs', 'cf']);
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
// export const debitCredit = z.enum(["debit", "credit"]);
// export type DebitCredit = z.infer<typeof debitCredit>;

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
      'Report code must follow BS|IS.XXX or BS|IS.XXX.XXX format',
    )
    .max(64)
    .nullish(),
  parent_id: z.uuid().nullable(),
  financial_statement_id: z.uuid(),
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
  account_element_id: z.uuid(),
  report_code: z
    .string()
    .regex(
      /^(BS|IS)(\.[A-Z]{3}){3,4}$/,
      'Report code must follow BS|IS.XXX.XXX.XXX or BS|IS.XXX.XXX.XXX.XXX format',
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
export type AccountTypeWithRequiredReportCode = z.infer<typeof accountTypeWithRequiredReportCode>;

export const newClientFirmAssignment = z.object({
  client_company_id: z.uuid(),
  accounting_firm_company_id: z.uuid(),
  created_by_id: z.uuid().nullish(),
  updated_by_id: z.uuid().nullish(),
});
type CFI = z.infer<typeof newClientFirmAssignment>;
type CFISnake = SnakeToCamelCaseObject<CFI>;

export type NewClientFirmAssignmentsInput = CFI | CFISnake;
export const newClientFirmAssignmentsInput = createCamelCaseSchema(newClientFirmAssignment);

export const newClientFirmAssignments = newClientFirmAssignment.extend({
  created_by_id: z.uuid(),
});
export type NewClientFirmAssignments = z.infer<typeof newClientFirmAssignments>;

export const clientFirmAssignments = newClientFirmAssignments.merge(dbBaseFields);
export type ClientFirmAssignments = z.infer<typeof clientFirmAssignments>;

// firm_user_client_assignments (fuca)
const newFucaBase = z.object({
  firm_staff_user_id: z.uuid(),
  client_company_id: z.uuid(),
  updated_by_id: z.uuid().nullish(),
  created_by_id: z.uuid().nullish(),
});

export const newFucaInput = createCamelCaseSchema(newFucaBase);
export type NewFucaInput = SnakeToCamelCaseObject<z.infer<typeof newFucaBase>>;

export const newFuca = newFucaBase.extend({
  created_by_id: z.uuid(),
});
export type NewFuca = z.infer<typeof newFuca>;

export const fuca = newFuca.merge(dbBaseFields);
export type Fuca = z.infer<typeof fuca>;
