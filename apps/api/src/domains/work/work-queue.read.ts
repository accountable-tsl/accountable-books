import type {
  WorkQueueItem,
  WorkQueueResponse,
  WorkQueueSubject,
} from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { toYMD } from '../../shared/utils/date.utils.js';
import { loadEffectiveOwnerUserIds } from './work-ownership.js';
import {
  TARGET_TYPE_BANK_TRANSACTION,
  TARGET_TYPE_CATEGORIZATION_CANDIDATE,
} from './work.types.js';

interface WorkItemRow {
  id: string;
  work_type: string;
  status: 'open' | 'closed';
  title: string | null;
  firm_company_id: string;
  client_company_id: string;
  client_display_name: string | null;
  assigned_user_id: string | null;
  active_subject_count: number;
  primary_action: string | null;
  available_actions: unknown;
  required_capabilities: unknown;
  destination: unknown;
}

interface SubjectRow {
  id: string;
  work_item_id: string;
  canonical_subject_key: string;
  target_type: string;
  target_id: string;
  candidate_bank_transaction_id: string | null;
  sort_date: Date | string | null;
  amount: string | number | null;
}

interface WorkQueueViewer {
  userId: string;
  roleKey: string | null;
  roleScope: string | null;
  accessOrigin: string | null;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

function toYmdOrNull(value: Date | string | null): string | null {
  if (value == null) return null;
  return toYMD(value instanceof Date ? value : new Date(value));
}

/**
 * Firm-scoped read of the materialized work queue: grouped rows with their
 * exact active subjects. The work tables are projections; this read never
 * recomputes accounting truth.
 */
export async function getWorkQueue(input: {
  firmCompanyId: string;
  viewer?: WorkQueueViewer;
  trx?: Knex.Transaction;
}): Promise<WorkQueueResponse> {
  const client = input.trx ?? knexClient;

  const itemRows = (await client<WorkItemRow>('app.work_items as wi')
    .leftJoin('app.companies as cc', 'cc.id', 'wi.client_company_id')
    .where('wi.firm_company_id', input.firmCompanyId)
    .andWhere('wi.status', 'open')
    .andWhere('wi.is_deleted', false)
    .modify((query) => {
      if (isFirmStaffViewer(input.viewer)) {
        query.andWhere((staffScope) => {
          staffScope
            .whereNull('wi.assigned_user_id')
            .orWhere('wi.assigned_user_id', input.viewer!.userId);
        });
      }
    })
    .select(
      'wi.id',
      'wi.work_type',
      'wi.status',
      'wi.title',
      'wi.firm_company_id',
      'wi.client_company_id',
      'wi.assigned_user_id',
      'wi.active_subject_count',
      'wi.primary_action',
      'wi.available_actions',
      'wi.required_capabilities',
      'wi.destination',
      client.raw(
        'COALESCE(cc.display_name, cc.legal_name) AS client_display_name',
      ),
    )
    .orderBy('wi.first_seen_at', 'asc')) as WorkItemRow[];

  const itemIds = itemRows.map((row) => row.id);
  const clientCompanyIds = [
    ...new Set(itemRows.map((row) => row.client_company_id)),
  ];
  const clientAssignees = await loadEffectiveOwnerUserIds(
    client,
    clientCompanyIds,
  );
  const subjectRows = itemIds.length
    ? await client<SubjectRow>('app.work_item_subjects as s')
        .leftJoin('categorization_candidates as cc', function joinCandidate() {
          this.on(client.raw('cc.id::text = s.target_id'))
            .andOn(
              's.target_type',
              '=',
              client.raw('?', [TARGET_TYPE_CATEGORIZATION_CANDIDATE]),
            )
            .andOn('cc.company_id', '=', 's.client_company_id');
        })
        .whereIn('s.work_item_id', itemIds)
        .andWhere('s.status', 'active')
        .andWhere('s.is_deleted', false)
        .select(
          's.id',
          's.work_item_id',
          's.canonical_subject_key',
          's.target_type',
          's.target_id',
          'cc.bank_transaction_id as candidate_bank_transaction_id',
          's.sort_date',
          's.amount',
        )
        .orderBy('s.sort_date', 'asc')
    : [];

  const subjectsByItem = new Map<string, WorkQueueSubject[]>();
  for (const row of subjectRows) {
    const subject: WorkQueueSubject = {
      subjectId: row.id,
      canonicalSubjectKey: row.canonical_subject_key,
      targetType: row.target_type,
      targetId: row.target_id,
      candidateId:
        row.target_type === TARGET_TYPE_CATEGORIZATION_CANDIDATE
          ? row.target_id
          : null,
      bankTransactionId:
        row.target_type === TARGET_TYPE_BANK_TRANSACTION
          ? row.target_id
          : row.candidate_bank_transaction_id,
      sortDate: toYmdOrNull(row.sort_date),
      amount: row.amount == null ? null : Number(row.amount),
    };
    const list = subjectsByItem.get(row.work_item_id) ?? [];
    list.push(subject);
    subjectsByItem.set(row.work_item_id, list);
  }

  const items: WorkQueueItem[] = itemRows.map((row) => {
    const subjects = subjectsByItem.get(row.id) ?? [];
    const storedDestination =
      row.destination && typeof row.destination === 'object'
        ? (row.destination as Record<string, unknown>)
        : {};
    const bankTransactionIds = subjects
      .map((subject) => subject.bankTransactionId)
      .filter((id): id is string => id != null);
    const candidateIds = subjects
      .map((subject) => subject.candidateId)
      .filter((id): id is string => id != null);

    return {
      workItemId: row.id,
      workType: row.work_type,
      status: row.status,
      title: row.title,
      firmCompanyId: row.firm_company_id,
      clientCompanyId: row.client_company_id,
      clientDisplayName: row.client_display_name,
      assignedUserId: row.assigned_user_id,
      effectiveOwnerUserId:
        row.assigned_user_id ??
        clientAssignees.get(row.client_company_id) ??
        null,
      activeSubjectCount: Number(row.active_subject_count ?? 0),
      primaryAction: row.primary_action,
      availableActions: toStringArray(row.available_actions),
      requiredCapabilities: toStringArray(row.required_capabilities),
      destination: {
        workspace:
          typeof storedDestination.workspace === 'string'
            ? storedDestination.workspace
            : 'categorization',
        filterMode:
          typeof storedDestination.filterMode === 'string'
            ? storedDestination.filterMode
            : 'work_item_subjects',
        filters: { bankTransactionIds, candidateIds },
      },
      subjects,
    };
  });

  return { firmCompanyId: input.firmCompanyId, items };
}

/**
 * Resolve the active bank-transaction ids under a work item, including
 * candidate-targeted review subjects, for deep-linking the categorization
 * workspace to exactly that row's source transactions.
 *
 * Scoping/security: ids are returned only when the work item exists, belongs to
 * `clientCompanyId`, is open, and is not soft-deleted. Any mismatch (wrong
 * company, missing, closed, deleted) returns an empty array, so a stale or
 * forged work_item_id can never leak another client's transactions.
 * Only active, non-deleted subjects are returned, so solved subjects never
 * resurface. This is a routing/filter convenience over current domain truth —
 * never the source of accounting correctness.
 */
export async function getActiveWorkItemBankTransactionIds(input: {
  workItemId: string;
  clientCompanyId: string;
  trx?: Knex.Transaction;
}): Promise<string[]> {
  const client = input.trx ?? knexClient;

  const workItem = await client('app.work_items')
    .where({
      id: input.workItemId,
      client_company_id: input.clientCompanyId,
      status: 'open',
      is_deleted: false,
    })
    .first('id');

  if (!workItem) {
    return [];
  }

  const rows = await client<{
    target_type: string;
    target_id: string;
    candidate_bank_transaction_id: string | null;
  }>('app.work_item_subjects as s')
    .leftJoin('categorization_candidates as cc', function joinCandidate() {
      this.on(client.raw('cc.id::text = s.target_id'))
        .andOn(
          's.target_type',
          '=',
          client.raw('?', [TARGET_TYPE_CATEGORIZATION_CANDIDATE]),
        )
        .andOn('cc.company_id', '=', 's.client_company_id');
    })
    .where({
      's.work_item_id': input.workItemId,
      's.status': 'active',
      's.is_deleted': false,
    })
    .select(
      's.target_type',
      's.target_id',
      'cc.bank_transaction_id as candidate_bank_transaction_id',
    );

  return rows
    .map((row) =>
      row.target_type === TARGET_TYPE_BANK_TRANSACTION
        ? row.target_id
        : row.candidate_bank_transaction_id,
    )
    .filter((id): id is string => id != null);
}

function isFirmStaffViewer(viewer: WorkQueueViewer | undefined): boolean {
  return viewer?.roleScope === 'firm' && viewer.roleKey === 'staff';
}
