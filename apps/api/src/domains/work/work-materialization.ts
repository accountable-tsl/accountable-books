import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import {
  lockKeyMaterializerScope,
  tryAcquireAdvisoryXactLockWithBackoff,
} from '../../shared/services/advisoryLocks.service.js';
import { getLogger } from '../../shared/utils/logger.js';
import {
  writeNotificationAttentionResolvedIntent,
  writeNotificationRequestedIntent,
} from '../notifications/notification-intent.js';
import { NOTIFICATION_TYPE } from '../notifications/notifications.types.js';
import {
  resolveEffectiveOwnerUserId,
  resolveFirmCompanyId,
} from './work-ownership.js';
import {
  ACTION_INTENT_CATEGORIZE,
  ACTION_INTENT_REJECT_SUGGESTION,
  ACTION_INTENT_REVIEW_SUGGESTION,
  buildCategorizeGroupKey,
  buildReviewSuggestionsGroupKey,
  buildScopeKey,
  CATEGORIZATION_WORKSPACE,
  TARGET_TYPE_BANK_TRANSACTION,
  TARGET_TYPE_CATEGORIZATION_CANDIDATE,
  WORK_TYPE_CATEGORIZE_TRANSACTIONS,
  WORK_TYPE_REVIEW_SUGGESTIONS,
} from './work.types.js';

import type {
  NotificationAttentionTransition,
  NotificationType,
  NotifyEvent,
} from '../notifications/notifications.types.js';
import type { MaterializeResult, MaterializerScope } from './work.types.js';

const logger = getLogger({ component: 'work-materializer' });

interface DesiredSubject {
  canonicalSubjectKey: string;
  requiredActionIntent: string;
  targetType: string;
  targetId: string;
  sortDate: string | Date | null;
  amount: string | number | null;
}

interface WorkTypeReconcileConfig {
  workType: string;
  groupKey: string;
  primaryAction: string;
  availableActions: string[];
}

interface ReconcileWorkTypeResult {
  workItemId: string | null;
  activeSubjectCount: number;
  closed: boolean;
}

interface UpsertOpenWorkItemResult {
  id: string;
  inserted: boolean;
}

interface WorkReassignmentCandidate {
  workItemId: string;
  assignedUserId: string;
}

interface RecomputeWorkItemResult {
  count: number;
  changed: boolean;
  closed: boolean;
  updatedAt: Date | string;
}

/**
 * Reconcile firm-queue work for a scope from current domain facts.
 *
 * Idempotent and serialized per `scope_key` (see the "Materializer Concurrency
 * Model"): it acquires a DB advisory lock for the scope, computes the desired
 * subject set from domain facts ONLY (never from the work tables), upserts
 * desired subjects under the active `canonical_subject_key` uniqueness, ends
 * subjects no longer desired, recomputes grouped counts, and closes a grouped
 * work item only with a conditional update confirming zero active subjects.
 *
 * Pass `trx` to run inside an existing transaction (the outbox worker passes its
 * claim transaction so dispatch + reconcile commit atomically; tests call it
 * directly). Without `trx` it opens its own transaction.
 */
export async function materializeWork(
  scope: MaterializerScope,
  trx?: Knex.Transaction,
): Promise<MaterializeResult> {
  if (trx) {
    return runMaterialize(scope, trx);
  }
  return knexClient.transaction((t) => runMaterialize(scope, t));
}

async function runMaterialize(
  scope: MaterializerScope,
  trx: Knex.Transaction,
): Promise<MaterializeResult> {
  const scopeKey = buildScopeKey(scope);

  // Serialize per scope. Inline callers that cannot acquire the lock quickly
  // return a refetch hint and let the outbox worker finish reconciliation.
  const acquired = await tryAcquireAdvisoryXactLockWithBackoff(
    trx,
    lockKeyMaterializerScope(scopeKey),
  );
  if (!acquired) {
    logger.info(
      { scopeKey },
      'materializeWork deferred: scope lock not acquired',
    );
    return { status: 'deferred', scopeKey, refetch: true };
  }

  switch (scope.type) {
    case 'bank_account':
      return materializeBankAccountScope(scope, scopeKey, trx);
    default:
      throw new Error(
        `Unsupported materializer scope type: ${(scope as MaterializerScope).type}`,
      );
  }
}

async function materializeBankAccountScope(
  scope: Extract<MaterializerScope, { type: 'bank_account' }>,
  scopeKey: string,
  trx: Knex.Transaction,
): Promise<MaterializeResult> {
  const { clientCompanyId, bankAccountId } = scope;
  const firmCompanyId = await resolveFirmCompanyId(trx, clientCompanyId);
  const effectiveOwnerUserId = await resolveEffectiveOwnerUserId(
    trx,
    clientCompanyId,
  );
  const groupedScopeKey = `company:${clientCompanyId}`;

  const desiredSubjects = await loadDesiredBankAccountSubjects(trx, {
    clientCompanyId,
    bankAccountId,
  });
  const categorizeSubjects = desiredSubjects.filter(
    (subject) => subject.requiredActionIntent === ACTION_INTENT_CATEGORIZE,
  );
  const reviewSuggestionSubjects = desiredSubjects.filter(
    (subject) =>
      subject.requiredActionIntent === ACTION_INTENT_REVIEW_SUGGESTION,
  );

  await endUndesiredAccountSubjects(trx, clientCompanyId, bankAccountId);

  const destination = {
    workspace: CATEGORIZATION_WORKSPACE,
    filterMode: 'work_item_subjects',
  };

  const categorizeResult = await reconcileWorkType(trx, {
    firmCompanyId,
    clientCompanyId,
    assignedUserId: effectiveOwnerUserId,
    groupedScopeKey,
    destination,
    subjects: categorizeSubjects,
    config: {
      workType: WORK_TYPE_CATEGORIZE_TRANSACTIONS,
      groupKey: buildCategorizeGroupKey({
        clientCompanyId,
        effectiveOwnerUserId,
      }),
      primaryAction: ACTION_INTENT_CATEGORIZE,
      availableActions: [ACTION_INTENT_CATEGORIZE],
    },
  });

  const reviewResult = await reconcileWorkType(trx, {
    firmCompanyId,
    clientCompanyId,
    assignedUserId: effectiveOwnerUserId,
    groupedScopeKey,
    destination,
    subjects: reviewSuggestionSubjects,
    config: {
      workType: WORK_TYPE_REVIEW_SUGGESTIONS,
      groupKey: buildReviewSuggestionsGroupKey({
        clientCompanyId,
        effectiveOwnerUserId,
      }),
      primaryAction: ACTION_INTENT_REVIEW_SUGGESTION,
      availableActions: [
        ACTION_INTENT_REVIEW_SUGGESTION,
        ACTION_INTENT_REJECT_SUGGESTION,
      ],
    },
  });

  return {
    status: 'reconciled',
    scopeKey,
    workItemId: categorizeResult.workItemId ?? reviewResult.workItemId,
    activeSubjectCount:
      categorizeResult.activeSubjectCount + reviewResult.activeSubjectCount,
    closed: categorizeResult.closed || reviewResult.closed,
  };
}

async function upsertOpenWorkItem(
  trx: Knex.Transaction,
  input: {
    firmCompanyId: string;
    clientCompanyId: string;
    assignedUserId: string | null;
    scopeType: string;
    scopeKey: string;
    destination: Record<string, unknown>;
    config: WorkTypeReconcileConfig;
  },
): Promise<UpsertOpenWorkItemResult> {
  const requiredCapabilities = ['categorization.post'];

  const insertedResult = (await trx.raw(
    `
    INSERT INTO app.work_items (
      firm_company_id, client_company_id, work_type, status, assigned_user_id,
      scope_type, scope_key, primary_action, actionability_state,
      destination, required_capabilities, available_actions, group_key,
      first_seen_at, last_seen_at
    )
    VALUES (?, ?, ?, 'open', ?, ?, ?, ?, 'actionable_now', ?::jsonb, ?::jsonb, ?::jsonb, ?, now(), now())
    ON CONFLICT (group_key) WHERE status = 'open' AND is_deleted = false
    DO NOTHING
    RETURNING id
    `,
    [
      input.firmCompanyId,
      input.clientCompanyId,
      input.config.workType,
      input.assignedUserId,
      input.scopeType,
      input.scopeKey,
      input.config.primaryAction,
      JSON.stringify(input.destination),
      JSON.stringify(requiredCapabilities),
      JSON.stringify(input.config.availableActions),
      input.config.groupKey,
    ],
  )) as { rows: Array<{ id: string }> };

  const inserted = insertedResult.rows[0];
  if (inserted) {
    return { id: inserted.id, inserted: true };
  }

  const [updated] = await trx('app.work_items')
    .where({
      group_key: input.config.groupKey,
      status: 'open',
      is_deleted: false,
    })
    .update({
      assigned_user_id: input.assignedUserId,
      scope_type: input.scopeType,
      scope_key: input.scopeKey,
      last_seen_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    })
    .returning<{ id: string }[]>('id');

  if (!updated) {
    throw new Error(
      `Open work item conflict could not be reloaded for group_key ${input.config.groupKey}`,
    );
  }

  return { id: updated.id, inserted: false };
}

function buildWorkNotificationEvent(input: {
  firmCompanyId: string;
  clientCompanyId: string;
  assignedUserId: string;
  workItemId: string;
  workType: string;
  activeSubjectCount: number;
  eventType: NotificationType;
  transition: NotificationAttentionTransition;
  stateVersion: Date | string;
  sourceAssignedUserIds?: string[];
}): NotifyEvent {
  const title = buildWorkTitle(input.workType, input.activeSubjectCount);
  const transitionKey = workNotificationTransitionKey(input.transition);

  return {
    recipientUserId: input.assignedUserId,
    firmCompanyId: input.firmCompanyId,
    clientCompanyId: input.clientCompanyId,
    policyOwnerCompanyId: input.firmCompanyId,
    eventType: input.eventType,
    attentionKey: buildWorkAssigneeAttentionKey({
      workItemId: input.workItemId,
      assignedUserId: input.assignedUserId,
    }),
    attentionTransition: input.transition,
    priority: 'normal',
    title,
    body: buildWorkNotificationBody(input.transition),
    destination: {
      workspace: 'work_queue',
      workItemId: input.workItemId,
      clientCompanyId: input.clientCompanyId,
      workType: input.workType,
    },
    sourceEntity: { type: 'work_item', id: input.workItemId },
    workItemId: input.workItemId,
    idempotencyKey: [
      'notification',
      input.eventType,
      input.assignedUserId,
      input.workItemId,
      transitionKey,
      toNotificationStateVersion(input.stateVersion),
    ].join(':'),
    data: {
      workType: input.workType,
      activeSubjectCount: input.activeSubjectCount,
      ...(input.sourceAssignedUserIds && input.sourceAssignedUserIds.length > 0
        ? { sourceAssignedUserIds: input.sourceAssignedUserIds }
        : {}),
    },
  };
}

function buildWorkNotificationBody(
  transition: NotificationAttentionTransition,
): string {
  if (transition === 'opened') {
    return 'A new work item has been assigned to you.';
  }
  if (transition === 'reassigned') {
    return 'A work item has been reassigned to you.';
  }
  return 'Assigned work has been updated.';
}

function workNotificationTransitionKey(
  transition: NotificationAttentionTransition,
): string {
  if (transition === 'opened') return 'opened';
  if (transition === 'reassigned') return 'reassigned';
  return 'updated';
}

function buildWorkAssigneeAttentionKey(input: {
  workItemId: string;
  assignedUserId: string;
}): string {
  return `work_item:${input.workItemId}:assignee:${input.assignedUserId}`;
}

function toNotificationStateVersion(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

async function writeWorkAssigneeNotificationIntent(
  trx: Knex.Transaction,
  input: {
    firmCompanyId: string;
    clientCompanyId: string;
    assignedUserId: string | null;
    workItemId: string;
    workType: string;
    activeSubjectCount: number;
    inserted: boolean;
    changed: boolean;
    reassignmentCandidates: WorkReassignmentCandidate[];
    stateVersion: Date | string;
  },
): Promise<void> {
  const reassignmentSourceUserIds = [
    ...new Set(
      input.reassignmentCandidates.map((candidate) => candidate.assignedUserId),
    ),
  ].sort();
  const isReassignment = reassignmentSourceUserIds.length > 0;

  if (
    !input.assignedUserId ||
    input.activeSubjectCount <= 0 ||
    (!input.inserted && !input.changed && !isReassignment)
  ) {
    return;
  }
  let transition: NotificationAttentionTransition = 'routine_update';
  if (isReassignment) {
    transition = 'reassigned';
  } else if (input.inserted) {
    transition = 'opened';
  }
  const eventType: NotificationType = isReassignment
    ? NOTIFICATION_TYPE.WORK_REASSIGNED
    : NOTIFICATION_TYPE.WORK_ASSIGNED;

  await writeNotificationRequestedIntent(
    trx,
    buildWorkNotificationEvent({
      firmCompanyId: input.firmCompanyId,
      clientCompanyId: input.clientCompanyId,
      assignedUserId: input.assignedUserId,
      workItemId: input.workItemId,
      workType: input.workType,
      activeSubjectCount: input.activeSubjectCount,
      eventType,
      transition,
      stateVersion: input.stateVersion,
      sourceAssignedUserIds: reassignmentSourceUserIds,
    }),
  );
}

async function writeWorkAssignedNotificationResolutionIntent(
  trx: Knex.Transaction,
  input: {
    clientCompanyId: string;
    assignedUserId: string | null;
    workItemId: string;
    stateVersion: Date | string;
  },
): Promise<void> {
  if (!input.assignedUserId) {
    return;
  }

  await writeNotificationAttentionResolvedIntent(trx, {
    recipientUserId: input.assignedUserId,
    attentionKey: buildWorkAssigneeAttentionKey({
      workItemId: input.workItemId,
      assignedUserId: input.assignedUserId,
    }),
    companyId: input.clientCompanyId,
    idempotencyKey: [
      'notification',
      NOTIFICATION_TYPE.WORK_ASSIGNED,
      input.assignedUserId,
      input.workItemId,
      'resolved',
      toNotificationStateVersion(input.stateVersion),
    ].join(':'),
  });
}

async function reconcileWorkType(
  trx: Knex.Transaction,
  input: {
    firmCompanyId: string;
    clientCompanyId: string;
    assignedUserId: string | null;
    groupedScopeKey: string;
    destination: Record<string, unknown>;
    subjects: DesiredSubject[];
    config: WorkTypeReconcileConfig;
  },
): Promise<ReconcileWorkTypeResult> {
  if (input.subjects.length === 0) {
    const orphanResult = await closeOrphanedWorkItems(trx, {
      clientCompanyId: input.clientCompanyId,
      workType: input.config.workType,
      keepWorkItemId: null,
    });

    return {
      workItemId: null,
      activeSubjectCount: 0,
      closed: orphanResult.closed,
    };
  }

  const workItem = await upsertOpenWorkItem(trx, {
    firmCompanyId: input.firmCompanyId,
    clientCompanyId: input.clientCompanyId,
    assignedUserId: input.assignedUserId,
    scopeType: 'company',
    scopeKey: input.groupedScopeKey,
    destination: input.destination,
    config: input.config,
  });

  const reassignmentCandidates = await loadWorkReassignmentCandidates(trx, {
    clientCompanyId: input.clientCompanyId,
    workType: input.config.workType,
    assignedUserId: input.assignedUserId,
    keepWorkItemId: workItem.id,
    desiredSubjectKeys: input.subjects.map(
      (subject) => subject.canonicalSubjectKey,
    ),
  });

  await insertDesiredSubjects(trx, {
    workItemId: workItem.id,
    clientCompanyId: input.clientCompanyId,
    subjects: input.subjects,
  });

  const currentResult = await recomputeAndMaybeClose(trx, workItem.id);
  const orphanResult = await closeOrphanedWorkItems(trx, {
    clientCompanyId: input.clientCompanyId,
    workType: input.config.workType,
    keepWorkItemId: workItem.id,
  });

  await writeWorkAssigneeNotificationIntent(trx, {
    firmCompanyId: input.firmCompanyId,
    clientCompanyId: input.clientCompanyId,
    assignedUserId: input.assignedUserId,
    workItemId: workItem.id,
    workType: input.config.workType,
    activeSubjectCount: currentResult.count,
    inserted: workItem.inserted,
    changed: currentResult.changed,
    reassignmentCandidates,
    stateVersion: currentResult.updatedAt,
  });

  if (currentResult.closed) {
    await writeWorkAssignedNotificationResolutionIntent(trx, {
      clientCompanyId: input.clientCompanyId,
      assignedUserId: input.assignedUserId,
      workItemId: workItem.id,
      stateVersion: currentResult.updatedAt,
    });
  }

  return {
    workItemId: workItem.id,
    activeSubjectCount: currentResult.count,
    closed: currentResult.closed || orphanResult.closed,
  };
}

async function loadWorkReassignmentCandidates(
  trx: Knex.Transaction,
  input: {
    clientCompanyId: string;
    workType: string;
    assignedUserId: string | null;
    keepWorkItemId: string;
    desiredSubjectKeys: string[];
  },
): Promise<WorkReassignmentCandidate[]> {
  if (!input.assignedUserId || input.desiredSubjectKeys.length === 0) {
    return [];
  }

  const rows = await trx('app.work_items as wi')
    .join('app.work_item_subjects as s', 's.work_item_id', 'wi.id')
    .where({
      'wi.client_company_id': input.clientCompanyId,
      'wi.work_type': input.workType,
      'wi.status': 'open',
      'wi.is_deleted': false,
      's.status': 'active',
      's.is_deleted': false,
    })
    .whereNot('wi.id', input.keepWorkItemId)
    .whereNotNull('wi.assigned_user_id')
    .whereNot('wi.assigned_user_id', input.assignedUserId)
    .whereIn('s.canonical_subject_key', input.desiredSubjectKeys)
    .groupBy('wi.id', 'wi.assigned_user_id')
    .select('wi.id as work_item_id', 'wi.assigned_user_id as assigned_user_id');

  return rows.map((row) => ({
    workItemId: row.work_item_id as string,
    assignedUserId: row.assigned_user_id as string,
  }));
}

async function loadDesiredBankAccountSubjects(
  trx: Knex.Transaction,
  input: { clientCompanyId: string; bankAccountId: string },
): Promise<DesiredSubject[]> {
  const rows = await trx<{
    bank_transaction_id: string;
    transaction_date: string | Date | null;
    amount: string | number | null;
    candidate_id: string | null;
  }>('bank_transactions as bt')
    .leftJoin('categorization_candidates as cc', function joinCandidate() {
      this.on('cc.bank_transaction_id', '=', 'bt.id')
        .andOn('cc.is_deleted', '=', trx.raw('false'))
        .andOn('cc.review_state', '=', trx.raw(`'pending_review'`));
    })
    .where({
      'bt.bank_account_id': input.bankAccountId,
      'bt.company_id': input.clientCompanyId,
      'bt.is_deleted': false,
    })
    .whereNull('bt.ledger_transaction_id')
    .select(
      'bt.id as bank_transaction_id',
      'bt.transaction_date',
      'bt.amount',
      'cc.id as candidate_id',
    );

  return rows.map((row) => {
    if (row.candidate_id) {
      return {
        canonicalSubjectKey: `${ACTION_INTENT_REVIEW_SUGGESTION}:${TARGET_TYPE_CATEGORIZATION_CANDIDATE}:${row.candidate_id}`,
        requiredActionIntent: ACTION_INTENT_REVIEW_SUGGESTION,
        targetType: TARGET_TYPE_CATEGORIZATION_CANDIDATE,
        targetId: row.candidate_id,
        sortDate: row.transaction_date,
        amount: row.amount,
      };
    }

    return {
      canonicalSubjectKey: `${ACTION_INTENT_CATEGORIZE}:${TARGET_TYPE_BANK_TRANSACTION}:${row.bank_transaction_id}`,
      requiredActionIntent: ACTION_INTENT_CATEGORIZE,
      targetType: TARGET_TYPE_BANK_TRANSACTION,
      targetId: row.bank_transaction_id,
      sortDate: row.transaction_date,
      amount: row.amount,
    };
  });
}

async function endUndesiredAccountSubjects(
  trx: Knex.Transaction,
  clientCompanyId: string,
  bankAccountId: string,
): Promise<void> {
  await trx.raw(
    `
    UPDATE app.work_item_subjects s
    SET status = 'ended', ended_at = now(), ended_reason = 'source_resolved', updated_at = now()
    FROM app.work_items wi, bank_transactions bt
    WHERE s.work_item_id = wi.id
      AND wi.client_company_id = ?
      AND wi.work_type = ?
      AND wi.status = 'open'
      AND wi.is_deleted = false
      AND s.is_deleted = false
      AND s.status = 'active'
      AND s.target_type = ?
      AND s.target_id = bt.id::text
      AND bt.bank_account_id = ?
      AND (
        bt.ledger_transaction_id IS NOT NULL
        OR bt.is_deleted = true
        OR EXISTS (
          SELECT 1
          FROM categorization_candidates cc
          WHERE cc.bank_transaction_id = bt.id
            AND cc.is_deleted = false
            AND cc.review_state = 'pending_review'
        )
      )
    `,
    [
      clientCompanyId,
      WORK_TYPE_CATEGORIZE_TRANSACTIONS,
      TARGET_TYPE_BANK_TRANSACTION,
      bankAccountId,
    ],
  );

  await trx.raw(
    `
    UPDATE app.work_item_subjects s
    SET status = 'ended', ended_at = now(), ended_reason = 'source_resolved', updated_at = now()
    FROM app.work_items wi, categorization_candidates cc, bank_transactions bt
    WHERE s.work_item_id = wi.id
      AND wi.client_company_id = ?
      AND wi.work_type = ?
      AND wi.status = 'open'
      AND wi.is_deleted = false
      AND s.is_deleted = false
      AND s.status = 'active'
      AND s.target_type = ?
      AND s.target_id = cc.id::text
      AND cc.bank_transaction_id = bt.id
      AND bt.bank_account_id = ?
      AND (
        cc.review_state <> 'pending_review'
        OR cc.is_deleted = true
        OR bt.ledger_transaction_id IS NOT NULL
        OR bt.is_deleted = true
      )
    `,
    [
      clientCompanyId,
      WORK_TYPE_REVIEW_SUGGESTIONS,
      TARGET_TYPE_CATEGORIZATION_CANDIDATE,
      bankAccountId,
    ],
  );
}

async function insertDesiredSubjects(
  trx: Knex.Transaction,
  input: {
    workItemId: string;
    clientCompanyId: string;
    subjects: DesiredSubject[];
  },
): Promise<void> {
  if (input.subjects.length === 0) return;

  await trx('app.work_item_subjects')
    .insert(
      input.subjects.map((subject) => ({
        work_item_id: input.workItemId,
        client_company_id: input.clientCompanyId,
        canonical_subject_key: subject.canonicalSubjectKey,
        required_action_intent: subject.requiredActionIntent,
        target_type: subject.targetType,
        target_id: subject.targetId,
        sort_date: subject.sortDate,
        amount: subject.amount,
        status: 'active',
        first_seen_at: trx.fn.now(),
        last_seen_at: trx.fn.now(),
      })),
    )
    .onConflict(
      trx.raw(
        '(canonical_subject_key) WHERE status = ? AND is_deleted = false',
        ['active'],
      ),
    )
    .merge({
      work_item_id: trx.raw('excluded.work_item_id'),
      sort_date: trx.raw('excluded.sort_date'),
      amount: trx.raw('excluded.amount'),
      last_seen_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
}

async function endDeletedActiveSubjects(
  trx: Knex.Transaction,
  workItemId: string,
): Promise<void> {
  await trx('app.work_item_subjects')
    .where({ work_item_id: workItemId, status: 'active', is_deleted: true })
    .update({
      status: 'ended',
      ended_at: trx.fn.now(),
      ended_reason: 'subject_deleted',
      updated_at: trx.fn.now(),
    });
}

async function recomputeAndMaybeClose(
  trx: Knex.Transaction,
  workItemId: string,
): Promise<RecomputeWorkItemResult> {
  await endDeletedActiveSubjects(trx, workItemId);

  const workItem = await trx('app.work_items')
    .where({ id: workItemId })
    .first('work_type', 'active_subject_count', 'title');

  const countRow = (await trx('app.work_item_subjects')
    .where({ work_item_id: workItemId })
    .andWhere('is_deleted', false)
    .select(
      trx.raw(`count(*)::int as total`),
      trx.raw(`count(*) FILTER (WHERE status = 'active')::int as active`),
    )
    .first()) as { total: number; active: number } | undefined;
  const count = Number(countRow?.active ?? 0);
  const total = Number(countRow?.total ?? 0);
  const nextTitle =
    count > 0 ? buildWorkTitle(workItem?.work_type ?? '', count) : null;
  const changed =
    Number(workItem?.active_subject_count ?? 0) !== count ||
    (workItem?.title ?? null) !== nextTitle;

  const [updatedWorkItem] = await trx('app.work_items')
    .where({ id: workItemId })
    .update({
      subject_count: total,
      active_subject_count: count,
      title: nextTitle,
      last_seen_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    })
    .returning<{ updated_at: Date | string }[]>('updated_at');

  let closed = false;
  if (count === 0) {
    // Conditional close: only when no active subjects remain.
    const updated = await trx('app.work_items')
      .where({ id: workItemId, status: 'open', active_subject_count: 0 })
      .update({
        status: 'closed',
        closed_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
    closed = updated > 0;
  }

  return {
    count,
    changed,
    closed,
    updatedAt: updatedWorkItem?.updated_at ?? new Date(),
  };
}

function buildWorkTitle(workType: string, count: number): string {
  switch (workType) {
    case WORK_TYPE_CATEGORIZE_TRANSACTIONS:
      return `Categorize ${count} transaction${count === 1 ? '' : 's'}`;
    case WORK_TYPE_REVIEW_SUGGESTIONS:
      return `Review ${count} suggestion${count === 1 ? '' : 's'}`;
    default:
      return `${count} work subject${count === 1 ? '' : 's'}`;
  }
}

/**
 * Close open work items for a client/work type that lost all active subjects
 * (e.g. after subjects migrate to a new group_key when ownership grouping changes).
 */
async function closeOrphanedWorkItems(
  trx: Knex.Transaction,
  input: {
    clientCompanyId: string;
    workType: string;
    keepWorkItemId: string | null;
  },
): Promise<{ closed: boolean }> {
  const staleRows = await trx('app.work_items')
    .where({
      client_company_id: input.clientCompanyId,
      work_type: input.workType,
      status: 'open',
      is_deleted: false,
    })
    .modify((query) => {
      if (input.keepWorkItemId) {
        query.whereNot('id', input.keepWorkItemId);
      }
    })
    .select('id', 'assigned_user_id');

  let closed = false;
  for (const row of staleRows) {
    const result = await recomputeAndMaybeClose(trx, row.id);
    if (result.closed) {
      closed = true;
      await writeWorkAssignedNotificationResolutionIntent(trx, {
        clientCompanyId: input.clientCompanyId,
        assignedUserId: row.assigned_user_id,
        workItemId: row.id,
        stateVersion: result.updatedAt,
      });
    }
  }

  return { closed };
}
