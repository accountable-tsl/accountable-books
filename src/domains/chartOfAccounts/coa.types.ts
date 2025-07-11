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
  source: coaSource.nullish(),

  account_type_key: z.string().max(256).nullish(),
  account_type_label: z.string().uuid().nullish(),

  account_type_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  created_by_id: z.string().uuid().optional(),
});

export const newCoa = newCoaInput.extend({
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
  sortBy?: "code" | "name";
  trx?: Knex.Transaction;
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

  accountElementId: string;
  accountElementKey: string;
  accountElementLabel: string;

  parentAccountElementId?: string;
  parentAccountElementKey?: string;
  parentAccountElementLabel?: string;

  accountCurrencyId: string;
  accountCurrencyCode: string;
  accountCurrencySymbol: string;

  reportingCurrencyId: string;
  reportingCurrencyCode: string;
  reportingCurrencySymbol: string;

  gaapFsLabel: string;
  ifrsFsLabel: string;

  isLocked: boolean;
  isActive: boolean;
  isDeleted: boolean;
  hasTransactions: boolean;
};
