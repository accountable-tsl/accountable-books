import { z } from 'zod';

export const materializerScopeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('bank_account'),
    clientCompanyId: z.uuid(),
    bankAccountId: z.uuid(),
  }),
  z.object({
    type: z.literal('company_period'),
    clientCompanyId: z.uuid(),
    periodType: z.string(),
    fiscalYear: z.number().int(),
    periodNumber: z.number().int(),
  }),
  z.object({
    type: z.literal('company'),
    clientCompanyId: z.uuid(),
  }),
  z.object({
    type: z.literal('firm'),
    firmCompanyId: z.uuid(),
  }),
]);

export type MaterializerScope = z.infer<typeof materializerScopeSchema>;

export function buildScopeKey(scope: MaterializerScope): string {
  switch (scope.type) {
    case 'bank_account':
      return `bank_account:${scope.clientCompanyId}:${scope.bankAccountId}`;
    case 'company_period':
      return `company_period:${scope.clientCompanyId}:${scope.periodType}:${scope.fiscalYear}:${scope.periodNumber}`;
    case 'company':
      return `company:${scope.clientCompanyId}`;
    case 'firm':
      return `firm:${scope.firmCompanyId}`;
  }
}

export const workMaterializationPayloadSchema = z.object({
  scope: materializerScopeSchema,
  change: z.object({ type: z.string() }).loose().optional(),
});

export type WorkMaterializationPayload = z.infer<
  typeof workMaterializationPayloadSchema
>;

export const WORK_TYPE_CATEGORIZE_TRANSACTIONS = 'categorize_transactions';
export const WORK_TYPE_REVIEW_SUGGESTIONS = 'review_suggestions';
export const ACTION_INTENT_CATEGORIZE = 'categorize';
export const ACTION_INTENT_REVIEW_SUGGESTION = 'review_suggestion';
export const ACTION_INTENT_REJECT_SUGGESTION = 'reject_suggestion';
export const TARGET_TYPE_BANK_TRANSACTION = 'bank_transaction';
export const TARGET_TYPE_CATEGORIZATION_CANDIDATE = 'categorization_candidate';
export const CATEGORIZATION_WORKSPACE = 'categorization';

export function buildCategorizeGroupKey(input: {
  clientCompanyId: string;
  effectiveOwnerUserId: string | null;
}): string {
  const ownerKey = input.effectiveOwnerUserId ?? 'unassigned';
  return `${WORK_TYPE_CATEGORIZE_TRANSACTIONS}:${input.clientCompanyId}:${ownerKey}:${CATEGORIZATION_WORKSPACE}`;
}

export function buildReviewSuggestionsGroupKey(input: {
  clientCompanyId: string;
  effectiveOwnerUserId: string | null;
}): string {
  const ownerKey = input.effectiveOwnerUserId ?? 'unassigned';
  return `${WORK_TYPE_REVIEW_SUGGESTIONS}:${input.clientCompanyId}:${ownerKey}:${CATEGORIZATION_WORKSPACE}`;
}

export type MaterializeResult =
  | {
      status: 'reconciled';
      scopeKey: string;
      workItemId: string | null;
      activeSubjectCount: number;
      closed: boolean;
    }
  | {
      status: 'deferred';
      scopeKey: string;
      refetch: true;
    };
