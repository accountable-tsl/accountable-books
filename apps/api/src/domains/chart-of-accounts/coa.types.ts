import type { Knex } from 'knex';
import { z } from 'zod';

import { dbBaseFields } from '../../core/types/core.js';
import { type SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';

export const coaSource = z.enum(['user', 'system', 'template']);
export type CoaSource = z.infer<typeof coaSource>;

// coa
export const newCoaInput = z.object({
  name: z.string().max(256),
  is_active: z.boolean().prefault(true).optional(),
  code: z.string().nullish(),
  description: z.string().max(512).nullish(),
  locked: z.boolean().prefault(false).nullish(),
  source: coaSource.prefault('user').nullish(),

  account_type_key: z.string().max(256),
});

export const newCoa = newCoaInput.omit({ account_type_key: true }).extend({
  account_type_id: z.uuid(),
  currency_id: z.uuid(),
  company_id: z.uuid(),
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().optional(),
  version_seq: z.int().positive().nullish(),
});
export const coa = z.object({
  ...newCoa.shape,
  ...dbBaseFields.shape,
});

export type NewCoaInput = z.infer<typeof newCoaInput>;
export type NewCoaInputCamel = SnakeToCamelCaseObject<NewCoaInput>;
export type NewCoa = z.infer<typeof newCoa>;
export type Coa = z.infer<typeof coa>;

export type FetchCoaInput = {
  companyId: string;
  ids?: string[];
  codes?: string[];
  active?: boolean;
  accountTypeKeys?: string[];
  trx?: Knex.Transaction;
  includeDeleted?: boolean;
};

// Update COA schemas and types - separate schemas for each action
export const updateCoaAction = z.enum([
  'delete',
  'archive',
  'unarchive',
  'edit',
]);
export type UpdateCoaAction = z.infer<typeof updateCoaAction>;

export const coaUpdateInput = z.object({
  id: z.string(),

  // Fields for edit action
  code: z.string().max(256).nullish().optional(),
  name: z.string().max(256).optional(),
  description: z.string().max(512).nullish().optional(),
  accountTypeKey: z.uuid().optional(),
  isActive: z.boolean().optional(),
  isDeleted: z.boolean().optional(),

  versionSeq: z.bigint().optional(),
});
export type CoaUpdateInput = z.infer<typeof coaUpdateInput>;

export const resolvedCoaUpdateInput = coaUpdateInput
  .omit({ accountTypeKey: true })
  .extend({
    id: z.uuid(),
    accountTypeId: z.uuid().optional(),
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
  versionSeq: bigint;

  hasTransactions: boolean;
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
  defaultMonetary: boolean;
};

export type CoaSnapshotVersion = {
  id: string;
  company_id: string;
  checksum: string;
  snapshot_version: bigint;
  created_by_id: string;
  updated_by_id?: string | null;
  notes?: string | null;
  metadata?: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
  is_deleted: boolean;
};

export type CoaValidationStatus =
  | 'active'
  | 'inactive'
  | 'deleted'
  | 'not_found';

export type CoaValidationResult = {
  id: string;
  exists: boolean;
  status: CoaValidationStatus;
  name?: string;
  code?: string;
  isLocked?: boolean;
  accountTypeKey?: string;
};

export type CoaValidationResponse = {
  valid: CoaValidationResult[];
  invalid: CoaValidationResult[];
  allValid: boolean;
};
