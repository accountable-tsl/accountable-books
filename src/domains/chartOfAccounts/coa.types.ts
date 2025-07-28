import { z } from "zod";
import { dbBaseFields } from "../../core/types/core";
import { SnakeToCamelCaseObject } from "../../shared/utils/formatting.utils";
import type { Knex } from "knex";

export const coaSource = z.enum(["user", "system", "template"]);
export type CoaSource = z.infer<typeof coaSource>;

// coa
export const newCoaInput = z.object({
  name: z.string().max(256),
  is_active: z.boolean().default(true).optional(),
  code: z.string().max(256).nullish(),
  description: z.string().max(512).nullish(),
  locked: z.boolean().default(false).nullish(),
  source: coaSource.default("user").nullish(),

  account_type_key: z.string().max(256),
  // account_type_label: z.string().uuid().nullish(),

  // account_type_id: z.string().uuid().optional(),
  // company_id: z.string().uuid().optional(),
  // created_by_id: z.string().uuid().optional(),
});

export const newCoa = newCoaInput.omit({ account_type_key: true }).extend({
  account_type_id: z.string().uuid(),
  currency_id: z.string().uuid(),
  company_id: z.string().uuid(),
  created_by_id: z.string().uuid(),
  updated_by_id: z.string().uuid().optional(),
});
export const coa = newCoa.merge(dbBaseFields);

export type NewCoaInput = z.infer<typeof newCoaInput>;
export type NewCoaInputCamel = SnakeToCamelCaseObject<NewCoaInput>;
export type NewCoa = z.infer<typeof newCoa>;
export type Coa = z.infer<typeof coa>;

export type FetchCoaInput = {
  companyId: string;
  id?: string;
  code?: string;
  active?: boolean;
  accountTypeKey?: string;
  trx?: Knex.Transaction;
};

// Update COA schemas and types - separate schemas for each action
export const updateCoaAction = z.enum([
  "delete",
  "archive",
  "unarchive",
  "edit",
]);
export type UpdateCoaAction = z.infer<typeof updateCoaAction>;

export const coaUpdateInput = z.object({
  id: z.string(),

  // Fields for edit action
  code: z.string().max(256).nullish().optional(),
  name: z.string().max(256).optional(),
  description: z.string().max(512).nullish().optional(),
  accountTypeKey: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
});
export type CoaUpdateInput = z.infer<typeof coaUpdateInput>;

export const resolvedCoaUpdateInput = coaUpdateInput
  .omit({ accountTypeKey: true })
  .extend({
    id: z.string().uuid(),
    accountTypeId: z.string().uuid().optional(),
  });
export type ResolvedCoaUpdateInput = z.infer<typeof resolvedCoaUpdateInput>;

export const coaUpdateOptions = z.object({
  companyId: z.string(),
  updatedById: z.string(),
  operation: updateCoaAction,
});
export type CoaUpdateOptions = z.infer<typeof coaUpdateOptions>;

export type SimpleCoaRecord = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  isLocked: boolean;
  isDeleted: boolean;

  accountTypeId: string;
  accountTypeKey: string;
};

export type UpdateCoaResponse = {
  updatedAccounts: Array<{ id: string; name?: string }>;
  errors: Array<{ id: string; error: string }>;
};

export type CoaResponse = {
  id: string;
  code?: string;
  name: string;
  description?: string;
  source?: CoaSource;
  defaultSide: string;

  accountTypeId: string;
  accountTypeKey: string;
  accountTypeLabel: string;

  reportCode?: string;

  // accountElementId: string;
  accountElementKey: string;
  accountElementLabel: string;

  // parentAccountElementId?: string;
  parentAccountElementKey?: string;
  parentAccountElementLabel?: string;

  // accountCurrencyId: string;
  accountCurrencyCode: string;
  accountCurrencySymbol: string;

  // reportingCurrencyId: string;
  reportingCurrencyCode: string;
  reportingCurrencySymbol: string;

  gaapFsLabel: string;
  ifrsFsLabel: string;

  isLocked: boolean;
  isActive: boolean;
  isDeleted: boolean;
  hasTransactions: boolean;
};
