import { z } from 'zod';

export const coaSource = z.enum(['user', 'system', 'template']);
export type CoaSource = z.infer<typeof coaSource>;

export type FetchCoaInput = {
  companyId: string;
  accountId?: string;
  accountCode?: string;
  active?: boolean;
  accountTypeKey?: string;
  includeDeleted?: boolean;
};
export type CoaResponse = {
  id: string;
  code?: string;
  name: string;
  description?: string;
  source?: CoaSource;
  defaultSide: string;

  // accountTypeId: string;
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

  isActive: boolean;
  isDeleted: boolean;
  isLocked: boolean;
  hasTransactions: boolean;
  isBankLinked: boolean;
  canArchive: boolean;
  canDelete: boolean;
};

export type QuickFilterOptions = {
  label: string;
  value: string;
  count?: number;
};

// Action Bar
export type ActionSummary = {
  total: number;
  locked: number;
  archived: number;
  deleted: number;
  undeletable: number;
};

export type AnalyzeSelectionResponse = {
  canDelete: boolean;
  canArchive: boolean;
  canExport: boolean;
  summary: ActionSummary;
};

export const editCoaRequest = z.object({
  id: z.string(),
  name: z.string().optional(),
  code: z.string().nullish(),
  description: z.string().nullish(),
  accountTypeKey: z.string().optional(),
});
export type EditCoaRequest = z.infer<typeof editCoaRequest>;

export interface CoaUpdateResponse {
  updatedAccounts: Array<{ id: string; name?: string }>;
  errors: Array<{
    id: string;
    error: string;
    impact?: CoaLifecycleImpact;
  }>;
  warnings?: Array<{ id: string; impact: CoaLifecycleImpact }>;
  invalidatedDerivedData?: {
    predictions: number;
    candidates: number;
  };
}

export type CoaLifecycleImpact = {
  coaId: string;
  bankAccounts: number;
  draftJournals: number;
  recurringTemplates: number;
  categorizationRules: number;
  predictions: number;
  candidates: number;
};

export type CoaLifecycleOperation = 'archive' | 'delete';

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
  availableActions: string[];
};

export type CoaLifecyclePreflightResponse = {
  operation: CoaLifecycleOperation;
  impactFingerprint: string;
  accounts: CoaLifecycleAccountPreflight[];
  canExecuteWithoutResolution: boolean;
};

export type CoaLifecycleResolution =
  | {
      referenceType: 'draft_journal';
      sourceCoaId: string;
      referenceIds: string[];
      action: 'replace' | 'void';
      replacementCoaId?: string;
    }
  | {
      referenceType: 'recurring_template';
      sourceCoaId: string;
      referenceIds: string[];
      action: 'replace' | 'close';
      replacementCoaId?: string;
    }
  | {
      referenceType: 'categorization_rule';
      sourceCoaId: string;
      referenceIds: string[];
      action: 'replace' | 'disable';
      replacementCoaId?: string;
    };

export type CoaLifecycleExecuteInput = {
  operation: CoaLifecycleOperation;
  accountIds: string[];
  impactFingerprint: string;
  acknowledgeUnresolvedArchiveReferences?: boolean;
  resolutions?: CoaLifecycleResolution[];
};

export const createCoaSchema = z.object({
  name: z.string().min(1).max(256),
  isActive: z.boolean().prefault(true).optional(),
  code: z.string().max(256).nullish(),
  description: z.string().max(512).nullish(),
  accountTypeKey: z.string().min(1, 'Account Type is required'),
});

export type CreateCoa = z.infer<typeof createCoaSchema>;
