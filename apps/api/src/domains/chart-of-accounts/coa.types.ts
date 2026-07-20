import type { Knex } from 'knex';
import { z } from 'zod';

import { dbBaseFields } from '../../core/types/core.js';
import { type SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';

export const coaSource = z.enum(['user', 'system', 'template']);
export type CoaSource = z.infer<typeof coaSource>;

export const coaNameInput = z.string().trim().min(1).max(256);
export const coaCodeInput = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().max(256).nullable().optional());

export const newCoaInput = z.object({
  name: coaNameInput,
  is_active: z.boolean().prefault(true).optional(),
  code: coaCodeInput,
  description: z.string().max(512).nullish(),
  locked: z.boolean().prefault(false).optional(),
  source: coaSource.prefault('user').optional(),

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
  code: coaCodeInput,
  name: coaNameInput.optional(),
  description: z.string().max(512).nullish().optional(),
  accountTypeKey: z.string().trim().min(1).max(256).optional(),
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
  isBankLinked: boolean;

  accountTypeId: string;
  accountTypeKey: string;
  versionSeq: bigint;

  hasTransactions: boolean;
};

export type UpdateCoaResponse = {
  updatedAccounts: Array<{ id: string; name?: string }>;
  errors: Array<{
    id: string;
    error: string;
    impact?: CoaLifecycleImpact;
  }>;
  warnings?: CoaLifecycleWarning[];
  invalidatedDerivedData?: CoaDerivedDataInvalidation;
};

export type CoaLifecycleImpact = {
  coaId: string;
  bankAccounts: number;
  draftJournals: number;
  recurringTemplates: number;
  categorizationRules: number;
  predictions: number;
  candidates: number;
};

export type CoaLifecycleWarning = {
  id: string;
  impact: CoaLifecycleImpact;
};

export type CoaDerivedDataInvalidation = {
  predictions: number;
  candidates: number;
};

export const coaLifecycleOperation = z.enum(['archive', 'delete']);
export type CoaLifecycleOperation = z.infer<typeof coaLifecycleOperation>;

export const coaLifecycleReferenceType = z.enum([
  'draft_journal',
  'recurring_template',
  'categorization_rule',
]);
export type CoaLifecycleReferenceType = z.infer<
  typeof coaLifecycleReferenceType
>;

export const coaLifecycleResolution = z.discriminatedUnion('referenceType', [
  z.object({
    referenceType: z.literal('draft_journal'),
    sourceCoaId: z.uuid(),
    referenceIds: z.array(z.uuid()).min(1),
    action: z.enum(['replace', 'void']),
    replacementCoaId: z.uuid().optional(),
  }),
  z.object({
    referenceType: z.literal('recurring_template'),
    sourceCoaId: z.uuid(),
    referenceIds: z.array(z.uuid()).min(1),
    action: z.enum(['replace', 'close']),
    replacementCoaId: z.uuid().optional(),
  }),
  z.object({
    referenceType: z.literal('categorization_rule'),
    sourceCoaId: z.uuid(),
    referenceIds: z.array(z.uuid()).min(1),
    action: z.enum(['replace', 'disable']),
    replacementCoaId: z.uuid().optional(),
  }),
]);
export type CoaLifecycleResolution = z.infer<typeof coaLifecycleResolution>;

export const coaLifecyclePreflightInput = z.object({
  operation: coaLifecycleOperation,
  accountIds: z.array(z.uuid()).min(1),
});
export type CoaLifecyclePreflightInput = z.infer<
  typeof coaLifecyclePreflightInput
>;

export const coaLifecycleExecuteInput = coaLifecyclePreflightInput.extend({
  impactFingerprint: z.string().length(64),
  acknowledgeUnresolvedArchiveReferences: z.boolean().default(false).optional(),
  resolutions: z.array(coaLifecycleResolution).default([]).optional(),
});
export type CoaLifecycleExecuteInput = z.infer<typeof coaLifecycleExecuteInput>;

export type CoaLifecycleReference = {
  id: string;
  label: string;
  resolvable?: boolean;
};

export type CoaLifecycleAccountPreflight = {
  id: string;
  name: string;
  blockers: string[];
  references: {
    bankAccounts: CoaLifecycleReference[];
    ledgerEntries: { count: number };
    draftJournals: CoaLifecycleReference[];
    recurringTemplates: CoaLifecycleReference[];
    categorizationRules: CoaLifecycleReference[];
    predictions: { count: number };
    candidates: { count: number };
  };
  availableActions: Array<
    | 'acknowledge_archive'
    | 'replace_draft_journals'
    | 'void_draft_journals'
    | 'replace_recurring_templates'
    | 'close_recurring_templates'
    | 'replace_categorization_rules'
    | 'disable_categorization_rules'
  >;
};

export type CoaLifecyclePreflightResponse = {
  operation: CoaLifecycleOperation;
  impactFingerprint: string;
  accounts: CoaLifecycleAccountPreflight[];
  canExecuteWithoutResolution: boolean;
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
  isBankLinked: boolean;
  canArchive: boolean;
  canDelete: boolean;
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
