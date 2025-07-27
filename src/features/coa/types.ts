import { z } from "zod";

export const coaSource = z.enum(["user", "system", "template"]);
export type CoaSource = z.infer<typeof coaSource>;

export type FetchCoaInput = {
  companyId: string;
  accountId?: string;
  accountCode?: string;
  active?: boolean;
  accountTypeKey?: string;
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
  isArchived: boolean;
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

/**
 * Account update
 * Bulk delete allowed
 * Bulk archive allowed
 * Bulk edit not allowed
 */

export const updateCOASchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    ids: z.array(z.string().uuid()).min(1),
  }),
  z.object({
    action: z.literal("archive"),
    ids: z.array(z.string().uuid()).min(1),
  }),
  z.object({
    action: z.literal("edit"),
    id: z.string().uuid(),
    data: z.object({
      code: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      accountTypeId: z.string().uuid().optional(),
    }),
  }),
]);

export type UpdateCOAInput = z.infer<typeof updateCOASchema>;

// export type UpdateAccountResponse = {
//   success: boolean;
//   message?: string;
//   data?: CoaResponse;
// };
