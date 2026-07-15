import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  NG_USER_EMAIL,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { knexClient } from '../../../db/knexClient.js';
import {
  devEmailProvider,
  registerCommsProvider,
} from '../../../features/comms/providers/index.js';
import {
  lockKeyMaterializerScope,
  tryAcquireAdvisoryXactLock,
} from '../../../shared/services/advisoryLocks.service.js';
import { NOTIFICATION_TYPE } from '../../notifications/notifications.types.js';
import {
  dispatchPendingIntents,
  OUTBOX_INTENT,
  writeOutbox,
} from '../../outbox/index.js';
import { materializeWork } from '../work-materialization.js';
import { resolveFirmCompanyId } from '../work-ownership.js';
import { getWorkQueue } from '../work-queue.read.js';
import {
  ACTION_INTENT_REJECT_SUGGESTION,
  ACTION_INTENT_REVIEW_SUGGESTION,
  buildCategorizeGroupKey,
  buildScopeKey,
  WORK_TYPE_CATEGORIZE_TRANSACTIONS,
  WORK_TYPE_REVIEW_SUGGESTIONS,
} from '../work.types.js';

async function createFreshBankAccount(
  trx: Knex.Transaction,
  companyId: string,
  userId: string,
): Promise<string> {
  const existing = await trx('bank_accounts')
    .where({ company_id: companyId, is_deleted: false })
    .first('bank_id', 'coa_id');
  if (!existing) {
    throw new Error('Demo company has no bank account to template from');
  }
  const company = await trx('companies')
    .where({ id: companyId })
    .first('reporting_currency_id');

  const [account] = await trx('bank_accounts')
    .insert({
      display_name: 'WorkQueue Materializer Account',
      bank_id: existing.bank_id,
      currency_id: company.reporting_currency_id,
      company_id: companyId,
      coa_id: existing.coa_id,
      created_by_id: userId,
    })
    .returning('id');

  return account.id;
}

async function insertUnpostedTransactions(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    userId: string;
    bankAccountId: string;
    count: number;
  },
): Promise<string[]> {
  const [batch] = await trx('bank_transaction_batches')
    .insert({
      bank_account_id: input.bankAccountId,
      company_id: input.companyId,
      start_date: '2025-03-01',
      end_date: '2025-03-31',
      source: 'manual_entry',
      fingerprint: randomUUID(),
      import_row_count: input.count,
      created_by_id: input.userId,
    })
    .returning('id');

  const rows = Array.from({ length: input.count }).map((_, index) => ({
    bank_account_id: input.bankAccountId,
    company_id: input.companyId,
    bank_transaction_batch_id: batch.id,
    transaction_date: `2025-03-${String(index + 1).padStart(2, '0')}`,
    transaction_at: new Date(
      `2025-03-${String(index + 1).padStart(2, '0')}T12:00:00Z`,
    ),
    amount: -(index + 1) * 10,
    system_exchange_rate: 1,
    idempotency_key: randomUUID(),
    created_by_id: input.userId,
  }));

  const inserted = await trx('bank_transactions').insert(rows).returning('id');
  return inserted.map((row) => row.id as string);
}

async function pickPostableCoaId(
  trx: Knex.Transaction,
  companyId: string,
): Promise<string> {
  const bankCoaIds = (
    await trx('bank_accounts').where({ company_id: companyId }).select('coa_id')
  ).map((row) => row.coa_id);

  const coa = await trx('coa')
    .where({
      company_id: companyId,
      is_active: true,
      locked: false,
      is_deleted: false,
    })
    .whereNotIn('id', bankCoaIds)
    .first('id');

  if (!coa) {
    throw new Error('No postable COA found for demo company');
  }

  return coa.id;
}

function toTestYmd(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

async function insertPendingCandidate(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    bankTransactionId: string;
    coaId?: string;
    source?: 'rule' | 'ml' | 'ml_heuristic';
    confidence?: number;
  },
): Promise<string> {
  const bankTxn = await trx('bank_transactions as bt')
    .join('bank_accounts as ba', 'ba.id', 'bt.bank_account_id')
    .where('bt.id', input.bankTransactionId)
    .first(
      'bt.transaction_date',
      'bt.amount',
      'bt.system_exchange_rate',
      'ba.currency_id',
      'ba.coa_id as bank_account_coa_id',
    );
  if (!bankTxn) {
    throw new Error('Bank transaction not found for candidate fixture');
  }

  const transactionDate = toTestYmd(bankTxn.transaction_date);
  const bankAmount = Number(bankTxn.amount);
  const runId = randomUUID();
  const coaId = input.coaId ?? (await pickPostableCoaId(trx, input.companyId));

  const [task] = await trx('categorization_tasks')
    .insert({
      bank_transaction_id: input.bankTransactionId,
      bank_transaction_date: transactionDate,
      company_id: input.companyId,
      enriched_transaction: {},
      enrichment_version: 'test',
      source: 'manual',
      metadata: {},
    })
    .returning('id');

  const [prediction] = await trx('categorization_predictions')
    .insert({
      categorization_task_id: task.id,
      run_id: runId,
      bank_transaction_id: input.bankTransactionId,
      bank_transaction_date: transactionDate,
      company_id: input.companyId,
      source: input.source ?? 'ml',
      confidence: input.confidence ?? 0.85,
      metadata: {},
    })
    .returning('id');

  const [candidate] = await trx('categorization_candidates')
    .insert({
      categorization_task_id: task.id,
      run_id: runId,
      bank_transaction_id: input.bankTransactionId,
      bank_transaction_date: transactionDate,
      prediction_id: prediction.id,
      company_id: input.companyId,
      source: input.source ?? 'ml',
      description: 'Suggested categorization',
      confidence: input.confidence ?? 0.85,
      review_state: 'pending_review',
      metadata: {},
    })
    .returning('id');

  await trx('categorization_candidate_lines').insert([
    {
      candidate_id: candidate.id,
      fs_date: transactionDate,
      source_currency_id: bankTxn.currency_id,
      signed_native_amount: bankAmount,
      system_exchange_rate: Number(bankTxn.system_exchange_rate),
      custom_exchange_rate: Number(bankTxn.system_exchange_rate),
      transaction_side: bankAmount > 0 ? 'debit' : 'credit',
      coa_id: bankTxn.bank_account_coa_id,
      is_bank_leg: true,
      description: 'Bank leg',
    },
    {
      candidate_id: candidate.id,
      fs_date: transactionDate,
      source_currency_id: bankTxn.currency_id,
      signed_native_amount: -bankAmount,
      system_exchange_rate: Number(bankTxn.system_exchange_rate),
      custom_exchange_rate: Number(bankTxn.system_exchange_rate),
      transaction_side: -bankAmount > 0 ? 'debit' : 'credit',
      coa_id: coaId,
      is_bank_leg: false,
      description: 'Suggested line',
    },
  ]);

  return candidate.id;
}

async function replaceClientAssignee(
  trx: Knex.Transaction,
  input: {
    clientCompanyId: string;
    firmStaffUserId: string;
    actorUserId: string;
  },
): Promise<void> {
  await trx('app.firm_user_client_assignments')
    .where({ client_company_id: input.clientCompanyId, is_deleted: false })
    .update({
      is_deleted: true,
      deleted_at: trx.fn.now(),
      updated_by_id: input.actorUserId,
    });

  await trx('app.firm_user_client_assignments').insert({
    client_company_id: input.clientCompanyId,
    firm_staff_user_id: input.firmStaffUserId,
    created_by_id: input.actorUserId,
  });
}

async function insertQueueOnlyWorkItem(
  trx: Knex.Transaction,
  input: {
    firmCompanyId: string;
    clientCompanyId: string;
    assignedUserId: string | null;
    groupKey: string;
  },
): Promise<string> {
  const [item] = await trx('app.legacy_work_items')
    .insert({
      firm_company_id: input.firmCompanyId,
      client_company_id: input.clientCompanyId,
      work_type: WORK_TYPE_CATEGORIZE_TRANSACTIONS,
      status: 'open',
      assigned_user_id: input.assignedUserId,
      scope_type: 'company',
      scope_key: `company:${input.clientCompanyId}`,
      title: 'Categorize 1 transaction',
      primary_action: 'categorize',
      destination: JSON.stringify({
        workspace: 'categorization',
        filterMode: 'work_item_subjects',
      }),
      required_capabilities: JSON.stringify(['categorization.post']),
      available_actions: JSON.stringify(['categorize']),
      group_key: input.groupKey,
      active_subject_count: 1,
      subject_count: 1,
    })
    .returning('id');

  const targetId = randomUUID();
  await trx('app.work_item_subjects').insert({
    work_item_id: item.id,
    client_company_id: input.clientCompanyId,
    canonical_subject_key: `categorize:bank_transaction:${targetId}`,
    required_action_intent: 'categorize',
    target_type: 'bank_transaction',
    target_id: targetId,
  });

  return item.id;
}

describe('materializeWork (bank_account scope)', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;
  let bankAccountId: string;
  let firmCompanyId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
    userId = await getTestUserId(trx, US_USER_EMAIL);
    bankAccountId = await createFreshBankAccount(trx, companyId, userId);
    firmCompanyId = await resolveFirmCompanyId(trx, companyId);
    await trx('app.legacy_work_items')
      .where({ client_company_id: companyId })
      .del();
    await replaceClientAssignee(trx, {
      clientCompanyId: companyId,
      firmStaffUserId: userId,
      actorUserId: userId,
    });
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('materializes one categorize_transactions item with five subjects', async () => {
    const ids = await insertUnpostedTransactions(trx, {
      companyId,
      userId,
      bankAccountId,
      count: 5,
    });

    const result = await materializeWork(
      { type: 'bank_account', clientCompanyId: companyId, bankAccountId },
      trx,
    );
    expect(result.status).toBe('reconciled');
    if (result.status === 'reconciled') {
      expect(result.activeSubjectCount).toBe(5);
      expect(result.closed).toBe(false);
    }

    const queue = await getWorkQueue({ firmCompanyId, trx });
    const items = queue.items.filter(
      (item) => item.clientCompanyId === companyId,
    );
    expect(items).toHaveLength(1);

    const item = items[0];
    expect(item.workType).toBe('categorize_transactions');
    expect(item.title).toBe('Categorize 5 transactions');
    expect(item.assignedUserId).toBe(userId);
    expect(item.effectiveOwnerUserId).toBe(userId);
    expect(item.activeSubjectCount).toBe(5);
    expect(item.subjects).toHaveLength(5);
    expect(item.primaryAction).toBe('categorize');
    expect(item.requiredCapabilities).toContain('categorization.post');
    expect(item.destination.workspace).toBe('categorization');

    const subjectTargets = item.subjects
      .map((subject) => subject.bankTransactionId)
      .sort();
    expect(subjectTargets).toEqual([...ids].sort());
  });

  it('is idempotent: re-running does not duplicate subjects', async () => {
    await insertUnpostedTransactions(trx, {
      companyId,
      userId,
      bankAccountId,
      count: 5,
    });

    const scope = {
      type: 'bank_account' as const,
      clientCompanyId: companyId,
      bankAccountId,
    };
    await materializeWork(scope, trx);
    const second = await materializeWork(scope, trx);

    expect(second.status).toBe('reconciled');
    if (second.status === 'reconciled') {
      expect(second.activeSubjectCount).toBe(5);
    }

    const queue = await getWorkQueue({ firmCompanyId, trx });
    const items = queue.items.filter(
      (item) => item.clientCompanyId === companyId,
    );
    expect(items).toHaveLength(1);
    expect(items[0].subjects).toHaveLength(5);

    const activeSubjectCount = await trx('app.work_item_subjects')
      .where({ work_item_id: items[0].workItemId, status: 'active' })
      .count<{ c: string }>({ c: 'id' })
      .first();
    expect(Number(activeSubjectCount?.c)).toBe(5);
  });

  it('writes one notification intent for a newly inserted assigned work item and not on rematerialization', async () => {
    await insertUnpostedTransactions(trx, {
      companyId,
      userId,
      bankAccountId,
      count: 2,
    });

    const scope = {
      type: 'bank_account' as const,
      clientCompanyId: companyId,
      bankAccountId,
    };

    const first = await materializeWork(scope, trx);
    expect(first.status).toBe('reconciled');
    if (first.status !== 'reconciled' || !first.workItemId) {
      throw new Error('Expected assigned work item to materialize');
    }

    const [intent] = await trx('app.outbox').where({
      intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED,
      status: 'pending',
    });
    expect(intent).toBeDefined();
    expect(intent.scope_key).toContain(NOTIFICATION_TYPE.WORK_ASSIGNED);

    const payload = intent.payload as {
      event?: {
        recipientUserId?: string;
        firmCompanyId?: string;
        clientCompanyId?: string;
        policyOwnerCompanyId?: string;
        eventType?: string;
        attentionKey?: string;
        attentionTransition?: string;
        workItemId?: string;
        idempotencyKey?: string;
      };
    };
    expect(payload.event).toMatchObject({
      recipientUserId: userId,
      firmCompanyId,
      clientCompanyId: companyId,
      policyOwnerCompanyId: firmCompanyId,
      eventType: NOTIFICATION_TYPE.WORK_ASSIGNED,
      attentionKey: `work_item:${first.workItemId}:assignee:${userId}`,
      attentionTransition: 'opened',
      workItemId: first.workItemId,
    });
    expect(payload.event?.idempotencyKey).toContain(first.workItemId);

    await trx('app.outbox').where({ id: intent.id }).update({
      status: 'processed',
      completed_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });

    const second = await materializeWork(scope, trx);
    expect(second.status).toBe('reconciled');

    const allNotificationIntents = await trx('app.outbox').where({
      intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED,
    });
    expect(allNotificationIntents).toHaveLength(1);
  });

  it('writes a routine update notification intent when assigned work changes', async () => {
    await insertUnpostedTransactions(trx, {
      companyId,
      userId,
      bankAccountId,
      count: 1,
    });

    const scope = {
      type: 'bank_account' as const,
      clientCompanyId: companyId,
      bankAccountId,
    };

    const first = await materializeWork(scope, trx);
    expect(first.status).toBe('reconciled');
    if (first.status !== 'reconciled' || !first.workItemId) {
      throw new Error('Expected assigned work item to materialize');
    }

    await insertUnpostedTransactions(trx, {
      companyId,
      userId,
      bankAccountId,
      count: 1,
    });
    await materializeWork(scope, trx);

    const notificationIntents = await trx('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED,
      })
      .orderBy('created_at', 'asc');
    expect(notificationIntents).toHaveLength(2);

    const updatePayload = notificationIntents[1].payload as {
      event?: {
        attentionKey?: string;
        attentionTransition?: string;
        idempotencyKey?: string;
        title?: string;
        workItemId?: string;
      };
    };
    expect(updatePayload.event).toMatchObject({
      attentionKey: `work_item:${first.workItemId}:assignee:${userId}`,
      attentionTransition: 'routine_update',
      title: 'Categorize 2 transactions',
      workItemId: first.workItemId,
    });
    expect(updatePayload.event?.idempotencyKey).toContain('updated');
  });

  it('writes a resolve notification intent when assigned work closes', async () => {
    const [bankTransactionId] = await insertUnpostedTransactions(trx, {
      companyId,
      userId,
      bankAccountId,
      count: 1,
    });

    const scope = {
      type: 'bank_account' as const,
      clientCompanyId: companyId,
      bankAccountId,
    };

    const first = await materializeWork(scope, trx);
    expect(first.status).toBe('reconciled');
    if (first.status !== 'reconciled' || !first.workItemId) {
      throw new Error('Expected assigned work item to materialize');
    }

    await trx('bank_transactions').where({ id: bankTransactionId }).update({
      is_deleted: true,
      deleted_at: trx.fn.now(),
      deletion_origin: 'provider_sync',
      deletion_reason: 'test resolved source',
    });
    const second = await materializeWork(scope, trx);
    expect(second.status).toBe('reconciled');
    if (second.status === 'reconciled') {
      expect(second.closed).toBe(true);
    }

    const [resolveIntent] = await trx('app.outbox').where({
      intent_type: OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED,
    });
    expect(resolveIntent).toBeDefined();
    expect(resolveIntent.payload).toMatchObject({
      recipientUserId: userId,
      attentionKey: `work_item:${first.workItemId}:assignee:${userId}`,
      companyId,
    });
    expect(String(resolveIntent.payload.idempotencyKey)).toContain('resolved');
  });

  it('resolves old assignee attention and opens reassigned attention when ownership changes', async () => {
    const nextAssigneeId = await getTestUserId(trx, NG_USER_EMAIL);
    await insertUnpostedTransactions(trx, {
      companyId,
      userId,
      bankAccountId,
      count: 2,
    });

    const scope = {
      type: 'bank_account' as const,
      clientCompanyId: companyId,
      bankAccountId,
    };

    const first = await materializeWork(scope, trx);
    expect(first.status).toBe('reconciled');
    if (first.status !== 'reconciled' || !first.workItemId) {
      throw new Error('Expected first assigned work item to materialize');
    }

    await replaceClientAssignee(trx, {
      clientCompanyId: companyId,
      firmStaffUserId: nextAssigneeId,
      actorUserId: userId,
    });

    const second = await materializeWork(scope, trx);
    expect(second.status).toBe('reconciled');
    if (second.status !== 'reconciled' || !second.workItemId) {
      throw new Error('Expected reassigned work item to materialize');
    }
    expect(second.workItemId).not.toBe(first.workItemId);

    const oldWorkItem = await trx('app.legacy_work_items')
      .where({ id: first.workItemId })
      .first('status', 'assigned_user_id', 'active_subject_count');
    expect(oldWorkItem?.status).toBe('closed');
    expect(oldWorkItem?.assigned_user_id).toBe(userId);
    expect(Number(oldWorkItem?.active_subject_count)).toBe(0);

    const newWorkItem = await trx('app.legacy_work_items')
      .where({ id: second.workItemId })
      .first('status', 'assigned_user_id', 'active_subject_count');
    expect(newWorkItem?.status).toBe('open');
    expect(newWorkItem?.assigned_user_id).toBe(nextAssigneeId);
    expect(Number(newWorkItem?.active_subject_count)).toBe(2);

    const notificationIntents = await trx('app.outbox')
      .where({ intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED })
      .orderBy('id', 'asc');
    expect(notificationIntents).toHaveLength(2);

    const openedPayload = notificationIntents[0].payload as {
      event?: {
        recipientUserId?: string;
        eventType?: string;
        attentionTransition?: string;
        attentionKey?: string;
        workItemId?: string;
      };
    };
    expect(openedPayload.event).toMatchObject({
      recipientUserId: userId,
      eventType: NOTIFICATION_TYPE.WORK_ASSIGNED,
      attentionTransition: 'opened',
      attentionKey: `work_item:${first.workItemId}:assignee:${userId}`,
      workItemId: first.workItemId,
    });

    const reassignedPayload = notificationIntents[1].payload as {
      event?: {
        recipientUserId?: string;
        eventType?: string;
        attentionTransition?: string;
        attentionKey?: string;
        workItemId?: string;
        idempotencyKey?: string;
        data?: { sourceAssignedUserIds?: string[] };
      };
    };
    expect(reassignedPayload.event).toMatchObject({
      recipientUserId: nextAssigneeId,
      eventType: NOTIFICATION_TYPE.WORK_REASSIGNED,
      attentionTransition: 'reassigned',
      attentionKey: `work_item:${second.workItemId}:assignee:${nextAssigneeId}`,
      workItemId: second.workItemId,
      data: { sourceAssignedUserIds: [userId] },
    });
    expect(reassignedPayload.event?.idempotencyKey).toContain('reassigned');

    const [resolveIntent] = await trx('app.outbox').where({
      intent_type: OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED,
    });
    expect(resolveIntent).toBeDefined();
    expect(resolveIntent.payload).toMatchObject({
      recipientUserId: userId,
      attentionKey: `work_item:${first.workItemId}:assignee:${userId}`,
      companyId,
    });

    await materializeWork(scope, trx);
    const replayNotificationIntents = await trx('app.outbox').where({
      intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED,
    });
    expect(replayNotificationIntents).toHaveLength(2);
    const replayResolutionIntents = await trx('app.outbox').where({
      intent_type: OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED,
    });
    expect(replayResolutionIntents).toHaveLength(1);
  });

  it('does not write a notification intent for unassigned pool work', async () => {
    await trx('app.firm_user_client_assignments')
      .where({ client_company_id: companyId, is_deleted: false })
      .update({
        is_deleted: true,
        deleted_at: trx.fn.now(),
        updated_by_id: userId,
      });
    await insertUnpostedTransactions(trx, {
      companyId,
      userId,
      bankAccountId,
      count: 1,
    });

    const result = await materializeWork(
      { type: 'bank_account', clientCompanyId: companyId, bankAccountId },
      trx,
    );
    expect(result.status).toBe('reconciled');

    const notificationIntents = await trx('app.outbox').where({
      intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED,
    });
    expect(notificationIntents).toHaveLength(0);
  });

  it('materializes pending candidates as review_suggestions instead of categorize subjects', async () => {
    const [candidateTxnId, uncategorizedTxnId] =
      await insertUnpostedTransactions(trx, {
        companyId,
        userId,
        bankAccountId,
        count: 2,
      });
    const candidateId = await insertPendingCandidate(trx, {
      companyId,
      bankTransactionId: candidateTxnId,
    });

    const result = await materializeWork(
      { type: 'bank_account', clientCompanyId: companyId, bankAccountId },
      trx,
    );
    expect(result.status).toBe('reconciled');
    if (result.status === 'reconciled') {
      expect(result.activeSubjectCount).toBe(2);
    }

    const queue = await getWorkQueue({ firmCompanyId, trx });
    const items = queue.items.filter(
      (item) => item.clientCompanyId === companyId,
    );
    const categorizeItem = items.find(
      (item) => item.workType === WORK_TYPE_CATEGORIZE_TRANSACTIONS,
    );
    const reviewItem = items.find(
      (item) => item.workType === WORK_TYPE_REVIEW_SUGGESTIONS,
    );

    expect(categorizeItem?.title).toBe('Categorize 1 transaction');
    expect(categorizeItem?.subjects).toHaveLength(1);
    expect(categorizeItem?.subjects[0].bankTransactionId).toBe(
      uncategorizedTxnId,
    );

    expect(reviewItem?.title).toBe('Review 1 suggestion');
    expect(reviewItem?.primaryAction).toBe(ACTION_INTENT_REVIEW_SUGGESTION);
    expect(reviewItem?.availableActions).toEqual([
      ACTION_INTENT_REVIEW_SUGGESTION,
      ACTION_INTENT_REJECT_SUGGESTION,
    ]);
    expect(reviewItem?.subjects).toHaveLength(1);
    expect(reviewItem?.subjects[0]).toMatchObject({
      candidateId,
      bankTransactionId: candidateTxnId,
      targetType: 'categorization_candidate',
      targetId: candidateId,
    });
    expect(reviewItem?.destination.filters).toMatchObject({
      bankTransactionIds: [candidateTxnId],
      candidateIds: [candidateId],
    });
  });

  it('ends review_suggestion work and restores categorize work when a candidate closes without posting', async () => {
    const [bankTransactionId] = await insertUnpostedTransactions(trx, {
      companyId,
      userId,
      bankAccountId,
      count: 1,
    });
    const candidateId = await insertPendingCandidate(trx, {
      companyId,
      bankTransactionId,
    });
    const scope = {
      type: 'bank_account' as const,
      clientCompanyId: companyId,
      bankAccountId,
    };

    await materializeWork(scope, trx);
    await trx('categorization_candidates')
      .where({ id: candidateId })
      .update({ review_state: 'closed' });
    await materializeWork(scope, trx);

    const queue = await getWorkQueue({ firmCompanyId, trx });
    const items = queue.items.filter(
      (item) => item.clientCompanyId === companyId,
    );
    expect(
      items.find((item) => item.workType === WORK_TYPE_REVIEW_SUGGESTIONS),
    ).toBeUndefined();

    const categorizeItem = items.find(
      (item) => item.workType === WORK_TYPE_CATEGORIZE_TRANSACTIONS,
    );
    expect(categorizeItem?.title).toBe('Categorize 1 transaction');
    expect(categorizeItem?.subjects[0].bankTransactionId).toBe(
      bankTransactionId,
    );

    const oldReviewSubject = await trx('app.work_item_subjects')
      .where({
        canonical_subject_key: `review_suggestion:categorization_candidate:${candidateId}`,
      })
      .first('status', 'ended_reason');
    expect(oldReviewSubject?.status).toBe('ended');
    expect(oldReviewSubject?.ended_reason).toBe('source_resolved');
  });

  it('keeps one open grouped item when client assignee changes and closes legacy owner-keyed rows', async () => {
    await insertUnpostedTransactions(trx, {
      companyId,
      userId,
      bankAccountId,
      count: 3,
    });

    const scope = {
      type: 'bank_account' as const,
      clientCompanyId: companyId,
      bankAccountId,
    };

    // Simulate a legacy open row keyed by the old owner-in-group_key scheme.
    const legacyOwner = randomUUID();
    const legacyGroupKey = `${WORK_TYPE_CATEGORIZE_TRANSACTIONS}:${companyId}:${legacyOwner}:categorization`;
    const [legacyRow] = await trx('app.legacy_work_items')
      .insert({
        firm_company_id: firmCompanyId,
        client_company_id: companyId,
        work_type: WORK_TYPE_CATEGORIZE_TRANSACTIONS,
        status: 'open',
        scope_type: 'bank_account',
        scope_key: buildScopeKey(scope),
        primary_action: 'categorize',
        destination: JSON.stringify({
          workspace: 'categorization',
          filterMode: 'work_item_subjects',
        }),
        required_capabilities: JSON.stringify(['categorization.post']),
        available_actions: JSON.stringify(['categorize']),
        group_key: legacyGroupKey,
        active_subject_count: 3,
        subject_count: 3,
      })
      .returning('id');

    await materializeWork(scope, trx);

    const canonicalGroupKey = buildCategorizeGroupKey({
      clientCompanyId: companyId,
      effectiveOwnerUserId: userId,
    });
    const openRows = await trx('app.legacy_work_items')
      .where({
        client_company_id: companyId,
        work_type: WORK_TYPE_CATEGORIZE_TRANSACTIONS,
        status: 'open',
      })
      .select('id', 'group_key', 'active_subject_count');

    expect(openRows).toHaveLength(1);
    expect(openRows[0].group_key).toBe(canonicalGroupKey);
    expect(openRows[0].id).not.toBe(legacyRow.id);
    expect(Number(openRows[0].active_subject_count)).toBe(3);

    const legacy = await trx('app.legacy_work_items')
      .where({ id: legacyRow.id })
      .first('status', 'active_subject_count');
    expect(legacy?.status).toBe('closed');
    expect(Number(legacy?.active_subject_count)).toBe(0);

    const queue = await getWorkQueue({ firmCompanyId, trx });
    const items = queue.items.filter(
      (item) => item.clientCompanyId === companyId,
    );
    expect(items).toHaveLength(1);
    expect(items[0].subjects).toHaveLength(3);
  });

  it('recreates an open grouped item when the previous row with the same group key was soft-deleted', async () => {
    await insertUnpostedTransactions(trx, {
      companyId,
      userId,
      bankAccountId,
      count: 2,
    });

    const groupKey = buildCategorizeGroupKey({
      clientCompanyId: companyId,
      effectiveOwnerUserId: userId,
    });
    const [deletedRow] = await trx('app.legacy_work_items')
      .insert({
        firm_company_id: firmCompanyId,
        client_company_id: companyId,
        work_type: WORK_TYPE_CATEGORIZE_TRANSACTIONS,
        status: 'open',
        assigned_user_id: userId,
        scope_type: 'company',
        scope_key: `company:${companyId}`,
        title: 'Categorize 2 transactions',
        primary_action: 'categorize',
        destination: JSON.stringify({
          workspace: 'categorization',
          filterMode: 'work_item_subjects',
        }),
        required_capabilities: JSON.stringify(['categorization.post']),
        available_actions: JSON.stringify(['categorize']),
        group_key: groupKey,
        active_subject_count: 2,
        subject_count: 2,
        is_deleted: true,
        deleted_at: trx.fn.now(),
      })
      .returning('id');

    const result = await materializeWork(
      { type: 'bank_account', clientCompanyId: companyId, bankAccountId },
      trx,
    );
    expect(result.status).toBe('reconciled');
    if (result.status !== 'reconciled' || !result.workItemId) {
      throw new Error('Expected replacement work item to materialize');
    }
    expect(result.workItemId).not.toBe(deletedRow.id);

    const rows = await trx('app.legacy_work_items')
      .where({ group_key: groupKey })
      .select('id', 'is_deleted', 'status');
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === deletedRow.id)?.is_deleted).toBe(true);
    expect(rows.find((row) => row.id === result.workItemId)?.is_deleted).toBe(
      false,
    );
  });

  it('filters staff queue reads to assigned and unassigned work while managers and admins see all work', async () => {
    await insertUnpostedTransactions(trx, {
      companyId,
      userId,
      bankAccountId,
      count: 1,
    });
    const scope = {
      type: 'bank_account' as const,
      clientCompanyId: companyId,
      bankAccountId,
    };
    const result = await materializeWork(scope, trx);
    expect(result.status).toBe('reconciled');
    if (result.status !== 'reconciled' || !result.workItemId) {
      throw new Error('Expected work item to materialize');
    }

    const otherUserId = await getTestUserId(trx, NG_USER_EMAIL);
    const unassignedItemId = await insertQueueOnlyWorkItem(trx, {
      firmCompanyId,
      clientCompanyId: companyId,
      assignedUserId: null,
      groupKey: `${WORK_TYPE_CATEGORIZE_TRANSACTIONS}:${companyId}:unassigned:${randomUUID()}`,
    });
    const otherUserItemId = await insertQueueOnlyWorkItem(trx, {
      firmCompanyId,
      clientCompanyId: companyId,
      assignedUserId: otherUserId,
      groupKey: `${WORK_TYPE_CATEGORIZE_TRANSACTIONS}:${companyId}:${otherUserId}:${randomUUID()}`,
    });

    const staffQueue = await getWorkQueue({
      firmCompanyId,
      trx,
      viewer: {
        userId,
        roleKey: 'staff',
        roleScope: 'firm',
        accessOrigin: 'explicit_firm',
      },
    });
    const staffItemIds = staffQueue.items.map((item) => item.workItemId);
    expect(staffItemIds).toContain(result.workItemId);
    expect(staffItemIds).toContain(unassignedItemId);
    expect(staffItemIds).not.toContain(otherUserItemId);

    for (const roleKey of ['manager', 'admin'] as const) {
      const queue = await getWorkQueue({
        firmCompanyId,
        trx,
        viewer: {
          userId,
          roleKey,
          roleScope: 'firm',
          accessOrigin: 'explicit_firm',
        },
      });
      const itemIds = queue.items.map((item) => item.workItemId);
      expect(itemIds).toContain(result.workItemId);
      expect(itemIds).toContain(unassignedItemId);
      expect(itemIds).toContain(otherUserItemId);
    }
  });

  it('ignores soft-deleted active-looking subjects and recreates the canonical active subject', async () => {
    await insertUnpostedTransactions(trx, {
      companyId,
      userId,
      bankAccountId,
      count: 1,
    });

    const scope = {
      type: 'bank_account' as const,
      clientCompanyId: companyId,
      bankAccountId,
    };
    await materializeWork(scope, trx);
    const [subject] = await trx('app.work_item_subjects')
      .where({
        client_company_id: companyId,
        status: 'active',
        is_deleted: false,
      })
      .select('id', 'canonical_subject_key');

    await trx('app.work_item_subjects').where({ id: subject.id }).update({
      is_deleted: true,
      deleted_at: trx.fn.now(),
    });

    await materializeWork(scope, trx);
    const activeSubjects = await trx('app.work_item_subjects')
      .where({
        canonical_subject_key: subject.canonical_subject_key,
        status: 'active',
        is_deleted: false,
      })
      .select('id');
    expect(activeSubjects).toHaveLength(1);
    expect(activeSubjects[0].id).not.toBe(subject.id);

    const queue = await getWorkQueue({ firmCompanyId, trx });
    const subjectIds = queue.items.flatMap((item) =>
      item.subjects.map((s) => s.subjectId),
    );
    expect(subjectIds).toContain(activeSubjects[0].id);
    expect(subjectIds).not.toContain(subject.id);
  });

  it('closes orphaned categorize rows even when the current owner-keyed row does not exist and no subjects are desired', async () => {
    const [orphanRow] = await trx('app.legacy_work_items')
      .insert({
        firm_company_id: firmCompanyId,
        client_company_id: companyId,
        work_type: WORK_TYPE_CATEGORIZE_TRANSACTIONS,
        status: 'open',
        assigned_user_id: userId,
        scope_type: 'company',
        scope_key: `company:${companyId}`,
        title: 'Categorize 1 transaction',
        primary_action: 'categorize',
        destination: JSON.stringify({
          workspace: 'categorization',
          filterMode: 'work_item_subjects',
        }),
        required_capabilities: JSON.stringify(['categorization.post']),
        available_actions: JSON.stringify(['categorize']),
        group_key: `${WORK_TYPE_CATEGORIZE_TRANSACTIONS}:${companyId}:${randomUUID()}:categorization`,
        active_subject_count: 1,
        subject_count: 1,
      })
      .returning('id');

    const result = await materializeWork(
      { type: 'bank_account', clientCompanyId: companyId, bankAccountId },
      trx,
    );
    expect(result.status).toBe('reconciled');
    if (result.status === 'reconciled') {
      expect(result.workItemId).toBeNull();
    }

    const orphan = await trx('app.legacy_work_items')
      .where({ id: orphanRow.id })
      .first('status', 'active_subject_count');
    expect(orphan?.status).toBe('closed');
    expect(Number(orphan?.active_subject_count)).toBe(0);
  });
});

// End-to-end seam: import → durable outbox intent → real dispatcher drain →
// materialized queue row. The dispatcher opens its OWN transactions, so it
// cannot see data written in a rolled-back test transaction; this test therefore
// COMMITS its fixtures and drains ONLY its own scope through the real
// `dispatchPendingIntents`, then removes every committed row in `finally`.
//
// It lives in this file (not a separate one) so it runs sequentially with the
// other tests that read `bizDemoUS` work items — no parallel file reads those
// rows, so the brief window where this test's committed work item exists never
// overlaps another reader.
describe('outbox dispatch seam (committed end-to-end)', () => {
  it('claims the intent, materializes, and surfaces the grouped queue row', async () => {
    const setup = await getTestDb().transaction();
    let companyId: string;
    let userId: string;
    let firmCompanyId: string;
    try {
      companyId = await getTestCompanyId(setup, 'bizDemoUS');
      userId = await getTestUserId(setup, US_USER_EMAIL);
      firmCompanyId = await resolveFirmCompanyId(setup, companyId);
    } finally {
      await setup.rollback();
    }

    // Defensive: clear any committed categorize rows left by a prior failed run
    // of this test (the only test that commits such rows for this client).
    const clearCommittedWorkItems = async () => {
      await knexClient('app.legacy_work_items')
        .where({
          client_company_id: companyId,
          work_type: WORK_TYPE_CATEGORIZE_TRANSACTIONS,
        })
        .del(); // cascades work_item_subjects
    };
    await clearCommittedWorkItems();

    const importTrx = await getTestDb().transaction();
    let bankAccountId = '';
    let txnIds: string[] = [];
    let scopeKey = '';
    let notificationScopeKey = '';
    let notificationCommsScopeKey = '';
    let notificationWorkItemId = '';
    let notificationCorrelationId = '';
    let insertedAssignmentId = '';
    const previousEmailProvider = process.env.EMAIL_PROVIDER;
    try {
      registerCommsProvider(devEmailProvider);
      process.env.EMAIL_PROVIDER = 'dev';

      const existingOwner = await importTrx('app.firm_user_client_assignments')
        .where({ client_company_id: companyId, is_deleted: false })
        .first('id');
      if (!existingOwner) {
        const [assignment] = await importTrx('app.firm_user_client_assignments')
          .insert({
            client_company_id: companyId,
            firm_staff_user_id: userId,
            created_by_id: userId,
          })
          .returning('id');
        insertedAssignmentId = assignment.id;
      }

      bankAccountId = await createFreshBankAccount(
        importTrx,
        companyId,
        userId,
      );
      txnIds = await insertUnpostedTransactions(importTrx, {
        companyId,
        userId,
        bankAccountId,
        count: 4,
      });
      const scope = {
        type: 'bank_account' as const,
        clientCompanyId: companyId,
        bankAccountId,
      };
      scopeKey = buildScopeKey(scope);
      await writeOutbox(importTrx, {
        intentType: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
        scopeKey,
        payload: { scope, change: { type: 'bank_transactions_changed' } },
      });
      await importTrx.commit();
    } catch (error) {
      await importTrx.rollback();
      throw error;
    }

    try {
      // Drain ONLY this scope through the real dispatcher seam (claim → dispatch
      // → materialize → mark processed), each on its own committed transaction.
      const result = await dispatchPendingIntents(10, { scopeKey });
      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);

      // The intent is durably marked processed.
      const intentRow = await knexClient('app.outbox')
        .where({ scope_key: scopeKey })
        .first('status', 'completed_at');
      expect(intentRow?.status).toBe('processed');
      expect(intentRow?.completed_at).not.toBeNull();

      // The committed queue read shows the grouped row with the exact subjects.
      const queue = await getWorkQueue({ firmCompanyId });
      const item = queue.items.find((i) =>
        i.subjects.some((s) => txnIds.includes(s.bankTransactionId ?? '')),
      );
      expect(item).toBeDefined();
      expect(item?.clientCompanyId).toBe(companyId);
      expect(item?.title).toBe('Categorize 4 transactions');
      expect(item?.subjects.map((s) => s.bankTransactionId).sort()).toEqual(
        [...txnIds].sort(),
      );
      notificationWorkItemId = item!.workItemId;

      const notificationIntent = await knexClient('app.outbox')
        .where({
          intent_type: OUTBOX_INTENT.NOTIFICATION_REQUESTED,
          status: 'pending',
        })
        .andWhereRaw(`payload->'event'->>'workItemId' = ?`, [
          notificationWorkItemId,
        ])
        .first('scope_key', 'payload');
      expect(notificationIntent).toBeDefined();
      notificationScopeKey = notificationIntent!.scope_key;

      const notificationDispatch = await dispatchPendingIntents(10, {
        scopeKey: notificationScopeKey,
      });
      expect(notificationDispatch).toMatchObject({
        processed: 1,
        failed: 0,
      });

      const notifications = await knexClient('app.notifications').where({
        recipient_user_id: userId,
        client_company_id: companyId,
        event_type: NOTIFICATION_TYPE.WORK_ASSIGNED,
        work_item_id: notificationWorkItemId,
      });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].policy_owner_company_id).toBe(firmCompanyId);
      expect(notifications[0].idempotency_key).toContain(
        notificationWorkItemId,
      );

      const commsIntent = await knexClient('app.outbox')
        .where({
          intent_type: OUTBOX_INTENT.NOTIFICATION_COMMS_REQUESTED,
          status: 'pending',
        })
        .andWhereRaw(`payload->'payload'->'correlation'->>'source' = ?`, [
          'notification',
        ])
        .andWhereRaw(`payload->'payload'->>'eventType' = ?`, [
          NOTIFICATION_TYPE.WORK_ASSIGNED,
        ])
        .first('scope_key', 'payload');
      expect(commsIntent).toBeDefined();
      notificationCommsScopeKey = commsIntent!.scope_key;
      notificationCorrelationId = String(
        (
          commsIntent!.payload as {
            payload?: { correlation?: { id?: unknown } };
          }
        ).payload?.correlation?.id,
      );
      expect(notificationCorrelationId).toBeTruthy();

      const commsDispatch = await dispatchPendingIntents(10, {
        scopeKey: notificationCommsScopeKey,
      });
      expect(commsDispatch).toMatchObject({ processed: 1, failed: 0 });

      const commsDeliveries = await knexClient('app.comms_deliveries')
        .whereRaw(`correlation->>'source' = ?`, ['notification'])
        .andWhereRaw(`correlation->>'id' = ?`, [notificationCorrelationId]);
      expect(commsDeliveries).toHaveLength(1);

      await knexClient.transaction(async (trx) => {
        await writeOutbox(trx, {
          intentType: OUTBOX_INTENT.NOTIFICATION_REQUESTED,
          scopeKey: notificationScopeKey,
          payload: notificationIntent!.payload as Record<string, unknown>,
        });
      });
      const duplicateDispatch = await dispatchPendingIntents(10, {
        scopeKey: notificationScopeKey,
      });
      expect(duplicateDispatch).toMatchObject({ processed: 1, failed: 0 });

      const afterDuplicate = await knexClient('app.notifications').where({
        recipient_user_id: userId,
        event_type: NOTIFICATION_TYPE.WORK_ASSIGNED,
        work_item_id: notificationWorkItemId,
      });
      expect(afterDuplicate).toHaveLength(1);

      await knexClient.transaction(async (trx) => {
        await writeOutbox(trx, {
          intentType: OUTBOX_INTENT.NOTIFICATION_COMMS_REQUESTED,
          scopeKey: notificationCommsScopeKey,
          payload: commsIntent!.payload as Record<string, unknown>,
        });
      });
      const duplicateCommsDispatch = await dispatchPendingIntents(10, {
        scopeKey: notificationCommsScopeKey,
      });
      expect(duplicateCommsDispatch).toMatchObject({
        processed: 1,
        failed: 0,
      });

      const commsAfterDuplicate = await knexClient('app.comms_deliveries')
        .whereRaw(`correlation->>'source' = ?`, ['notification'])
        .andWhereRaw(`correlation->>'id' = ?`, [notificationCorrelationId]);
      expect(commsAfterDuplicate).toHaveLength(1);
    } finally {
      // Critical cleanup: the per-client work item is the only committed row
      // other bizDemoUS tests read, so it must go (cascades its subjects). The
      // outbox row is tidied too. The throwaway bank account/batch/transactions
      // are left behind — bank_transactions are soft-delete-only (a trigger
      // blocks hard deletes), and this residue is inert: it sits on a unique
      // account the per-account materializer never re-touches and the queue read
      // never sees (matching the existing committed-data import test).
      const notificationRows = notificationWorkItemId
        ? await knexClient('app.notifications')
            .where({
              recipient_user_id: userId,
              work_item_id: notificationWorkItemId,
              event_type: NOTIFICATION_TYPE.WORK_ASSIGNED,
            })
            .select('id')
        : [];
      if (notificationCorrelationId) {
        await knexClient('app.comms_deliveries')
          .whereRaw(`correlation->>'source' = ?`, ['notification'])
          .andWhereRaw(`correlation->>'id' = ?`, [notificationCorrelationId])
          .del();
      }
      if (notificationRows.length > 0) {
        await knexClient('app.notifications')
          .whereIn(
            'id',
            notificationRows.map((row) => row.id),
          )
          .del();
      }
      await clearCommittedWorkItems();
      await knexClient('app.outbox')
        .whereIn(
          'scope_key',
          [scopeKey, notificationScopeKey, notificationCommsScopeKey].filter(
            Boolean,
          ),
        )
        .del();
      if (insertedAssignmentId) {
        await knexClient('app.firm_user_client_assignments')
          .where({ id: insertedAssignmentId })
          .del();
      }
      if (previousEmailProvider === undefined) {
        delete process.env.EMAIL_PROVIDER;
      } else {
        process.env.EMAIL_PROVIDER = previousEmailProvider;
      }
    }
  });
});

// Concurrency serialization needs no domain data: a concurrent holder of the
// scope lock forces materializeWork to defer rather than reconcile in parallel.
describe('materializeWork concurrency', () => {
  it('defers when the scope lock is already held by a concurrent holder', async () => {
    const db = getTestDb();
    const scope = {
      type: 'bank_account' as const,
      clientCompanyId: randomUUID(),
      bankAccountId: randomUUID(),
    };
    const lockKey = lockKeyMaterializerScope(buildScopeKey(scope));

    const holder = await db.transaction();
    const worker = await db.transaction();
    try {
      expect(await tryAcquireAdvisoryXactLock(holder, lockKey)).toBe(true);

      const result = await materializeWork(scope, worker);
      expect(result.status).toBe('deferred');
      if (result.status === 'deferred') {
        expect(result.refetch).toBe(true);
      }
    } finally {
      await worker.rollback().catch(() => undefined);
      await holder.rollback().catch(() => undefined);
    }
  });
});
