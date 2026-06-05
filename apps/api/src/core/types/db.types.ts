import { z } from 'zod';

import { roleKey } from '../../domains/roles/roles.types.js';
import { createCamelCaseSchema } from '../../shared/utils/formatting.utils.js';
import { dbBaseFields, dbUserAuditFields, debitCredit } from './core.js';

import type { SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';

// permission
export const newPermissionInput = z.object({
  action: z.string().min(2),
  resource: z.string().min(2),
  description: z.string().optional(),
  label: z.string().min(2),
  roles: z.array(roleKey).optional(),
});
export const newPermission = newPermissionInput.omit({ roles: true });

export const permission = newPermission.extend({
  id: z.uuid(),
  key: z.string().regex(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type NewPermissionInput = z.infer<typeof newPermission>;
export type Permission = z.infer<typeof permission>;

export type RolePermission = {
  role_id: string;
  permission_id: string;
};

// currency
export const newCurrency = z.object({
  code: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/), // ISO 4217 codes
  name: z.string().min(2).max(100),
  symbol: z.string().min(1).max(8),
  minor_unit: z.number().int().min(0).max(4),
});
export const currency = newCurrency.extend({
  id: z.uuid(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});
export const currencyWithId = newCurrency.extend({ id: z.uuid() });

export type NewCurrencyInput = z.infer<typeof newCurrency>;
export type NewCurrencyWithId = z.infer<typeof currencyWithId>;
export type Currency = z.infer<typeof currency>;

// country
export const newCountry = z.object({
  code: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/),
  name: z.string().min(2).max(128),
  phone_code: z.string().regex(/^\+[0-9]{1,14}$/),
  flag: z.string().max(10).nullish(),
  continent: z.string().max(50).nullish(),
});
export const country = newCountry.extend({
  id: z.uuid(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

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
export const financialStatement = newFinancialStatement.extend({
  id: z.uuid(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

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
export const accountElement = newAccountElement.extend({
  id: z.uuid(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});
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
export const accountTypeLabelRole = z.enum([
  'semantic',
  'mechanical',
  'control',
  'fallback',
]);

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
  default_monetary: z.boolean().default(false),
  label_role: accountTypeLabelRole,
  trainable: z.boolean(),
  is_contra: z.boolean().default(false),
  is_postable_control: z.boolean().default(false),
  accrual_targets: z.array(z.string()).nullish(),
});
export const accountType = newAccountType.extend({
  id: z.uuid(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});
export const accountTypeWithRequiredReportCode = accountType.required({
  id: true,
  report_code: true,
});

export type NewAccountTypeInput = z.infer<typeof newAccountType>;
export type AccountType = z.infer<typeof accountType>;
export type AccountTypeWithRequiredReportCode = z.infer<
  typeof accountTypeWithRequiredReportCode
>;

export const newClientFirmAssignment = z.object({
  client_company_id: z.uuid(),
  accounting_firm_company_id: z.uuid(),
  created_by_id: z.uuid().nullish(),
  updated_by_id: z.uuid().nullish(),
});
type CFI = z.infer<typeof newClientFirmAssignment>;
type CFISnake = SnakeToCamelCaseObject<CFI>;

export type NewClientFirmAssignmentsInput = CFI | CFISnake;
export const newClientFirmAssignmentsInput = createCamelCaseSchema(
  newClientFirmAssignment,
);

export const newClientFirmAssignments = newClientFirmAssignment.extend({
  created_by_id: z.uuid(),
});
export type NewClientFirmAssignments = z.infer<typeof newClientFirmAssignments>;

export const clientFirmAssignments =
  newClientFirmAssignments.merge(dbBaseFields);
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
