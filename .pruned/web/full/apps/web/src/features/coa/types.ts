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
  errors: Array<{ id: string; error: string }>;
}

export const createCoaSchema = z.object({
  name: z.string().min(1).max(256),
  isActive: z.boolean().default(true).optional(),
  code: z.string().max(256).nullish(),
  description: z.string().max(512).nullish(),
  accountTypeKey: z.string().min(1, 'Account Type is required'),
});

export type CreateCoa = z.infer<typeof createCoaSchema>;
