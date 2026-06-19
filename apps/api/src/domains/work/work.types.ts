import { z } from 'zod';

/**
 * Materializer scopes. Phase 1 only handles `bank_account`, but the scope is
 * modelled as a discriminated union so later phases can reconcile
 * `company_period`, `company`, and `firm` scopes through the same
 * `materializeWork(scope)` entry point and the same per-scope advisory lock.
 */
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

/**
 * Stable `scope_key` for a materializer scope. Matches the formats documented
 * in the build map's "Materializer Concurrency Model".
 */
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

/**
 * Outbox intent types. Free-form on the column; this registry keeps the
 * application's known values in one place. Later phases add
 * `activity_event_requested`, `notification_requested`, and
 * `transaction_sync_requested` here with no schema change.
 */
export const OUTBOX_INTENT = {
  WORK_MATERIALIZATION_REQUESTED: 'work_materialization_requested',
  ACTIVITY_EVENT_REQUESTED: 'activity_event_requested',
} as const;

export type OutboxIntentType =
  (typeof OUTBOX_INTENT)[keyof typeof OUTBOX_INTENT];

/**
 * Payload for a `work_materialization_requested` intent. Carries the full scope
 * so the dispatcher can reconcile without re-parsing the scope_key, plus an
 * optional change descriptor for telemetry. Reconciliation always reads current
 * domain facts, never the change descriptor, so duplicate/stale intents are
 * safe.
 */
export const workMaterializationPayloadSchema = z.object({
  scope: materializerScopeSchema,
  change: z.object({ type: z.string() }).loose().optional(),
});

export type WorkMaterializationPayload = z.infer<
  typeof workMaterializationPayloadSchema
>;

// Phase 1 work vocabulary.
export const WORK_TYPE_CATEGORIZE_TRANSACTIONS = 'categorize_transactions';
export const WORK_TYPE_REVIEW_SUGGESTIONS = 'review_suggestions';
export const ACTION_INTENT_CATEGORIZE = 'categorize';
export const ACTION_INTENT_REVIEW_SUGGESTION = 'review_suggestion';
export const ACTION_INTENT_REJECT_SUGGESTION = 'reject_suggestion';
export const TARGET_TYPE_BANK_TRANSACTION = 'bank_transaction';
export const TARGET_TYPE_CATEGORIZATION_CANDIDATE = 'categorization_candidate';
export const CATEGORIZATION_WORKSPACE = 'categorization';

/**
 * Stable grouping identity for a `categorize_transactions` work item. Phase 1
 * groups by (client_company_id, effective_owner, destination_workspace). Fiscal
 * period is deferred.
 */
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
      /** Hint for inline callers to refetch; outbox worker will retry. */
      refetch: true;
    };
