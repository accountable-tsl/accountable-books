import type { Knex } from 'knex';
import { z } from 'zod';

import { getLogger } from '../../shared/utils/logger.js';
import { writeAuditEvent } from '../audit/audit.model.js';
import {
  checkBankConnectionHealth,
  checkDraftJournals,
  checkLaterPeriodsClosed,
  checkOpenClientQueries,
  checkUncategorizedTransactions,
} from './condition-checks.js';
import { getConditionBlockTargets } from './task-condition-map.js';
import { getUpstreamDependencies } from './task-dependencies.js';
import { getTaskDef, TASK_REGISTRY } from './task-registry.js';

import type { ConditionCheckResult, PeriodRange } from './condition-checks.js';
import type { TaskTypeCode } from './task-registry.js';

const logger = getLogger({ component: 'task-evaluation-service' });

const SENTINEL_UUID = '00000000-0000-0000-0000-000000000000';
const COMPLETED_STATUSES = ['completed', 'skipped', 'not_applicable'];
/** Delimiter for blocker cache key (taskId + code + blockingTaskId). Must not appear in codes or UUIDs. */
const BLOCKER_KEY_SEP = '\x01';

// ── Types ─────────────────────────────────────────────────────────────

export type EvaluateContext = {
  firmCompanyId: string;
  clientCompanyId: string;
  domainArea: 'bookkeeping';
};

type TaskRow = {
  id: string;
  task_type: string;
  status: string;
  workflow_run_id: string | null;
  source_entity_id: string | null;
  is_blocked: boolean;
  has_warnings: boolean;
};

type BlockerIntent = {
  taskId: string;
  blockerType: 'system_condition' | 'upstream_task';
  code: string;
  severity: 'hard' | 'warning';
  message: string;
  details: Record<string, unknown> | null;
  blockingTaskId: string | null;
};

// ── Entry point ──────────────────────────────────────────────────────

export async function evaluateForClient(
  ctx: EvaluateContext,
  trx: Knex.Transaction,
): Promise<void> {
  const { firmCompanyId, clientCompanyId } = ctx;

  // 1. Resolve periods (open monthly periods, bounded to keep scope reasonable)
  const periods = await resolvePeriods(clientCompanyId, trx);

  // 2. Ensure workflow runs
  const workflowRunIdByPeriodKey = await ensureWorkflowRuns(
    firmCompanyId,
    clientCompanyId,
    periods,
    trx,
  );

  // 3. Run company-level condition checks once
  const bankHealth = await checkBankConnectionHealth(clientCompanyId, trx);
  const clientQueries = await checkOpenClientQueries(clientCompanyId, trx);

  // 4. Company-level tasks (respond_to_queries)
  await upsertCompanyTask(ctx, clientQueries, trx);

  // 5. Bank-account-level tasks (reconnect_bank)
  await upsertBankAccountTasks(ctx, bankHealth, trx);

  // 6. Period-scoped tasks
  const periodConditions: Map<string, ConditionCheckResult[]> = new Map();
  for (const period of periods) {
    const key = periodKey(period);
    const workflowRunId = workflowRunIdByPeriodKey.get(key);
    if (!workflowRunId) continue;

    const conditions = await runPeriodConditionChecks(
      clientCompanyId,
      period,
      trx,
    );
    periodConditions.set(key, conditions);

    await upsertPeriodTasks(ctx, period, workflowRunId, conditions, trx);
  }

  // 7 + 8. Compute and write blockers for all tasks of this client
  const allTasks = await trx('engagement_tasks')
    .where({ client_company_id: clientCompanyId, is_deleted: false })
    .whereNotIn('status', COMPLETED_STATUSES)
    .select(
      'id',
      'task_type',
      'status',
      'workflow_run_id',
      'source_entity_id',
      'is_blocked',
      'has_warnings',
    );

  const blockerIntents: BlockerIntent[] = [];

  for (const task of allTasks as TaskRow[]) {
    // System condition blockers
    const taskConditions = getConditionsForTask(
      task,
      bankHealth,
      clientQueries,
      periodConditions,
      workflowRunIdByPeriodKey,
    );
    for (const cond of taskConditions) {
      if (!cond.isActive) continue;
      for (const target of getConditionBlockTargets(cond.code)) {
        if (target.taskType !== task.task_type) continue;
        blockerIntents.push({
          taskId: task.id,
          blockerType: 'system_condition',
          code: cond.code,
          severity: target.severity,
          message: cond.message,
          details: cond.details as Record<string, unknown>,
          blockingTaskId: null,
        });
      }
    }

    // Upstream task blockers
    const upstreams = getUpstreamDependencies(task.task_type as TaskTypeCode);
    for (const { upstream, severity } of upstreams) {
      const upstreamTasks = findUpstreamTasks(
        allTasks as TaskRow[],
        upstream,
        task,
      );
      for (const ut of upstreamTasks) {
        if (COMPLETED_STATUSES.includes(ut.status)) continue;
        blockerIntents.push({
          taskId: task.id,
          blockerType: 'upstream_task',
          code: `upstream_${upstream}`,
          severity,
          message: `Blocked by: ${getTaskDef(upstream).displayName}`,
          details: null,
          blockingTaskId: ut.id,
        });
      }
      if (upstreamTasks.length === 0) {
        const upstreamDef = getTaskDef(upstream);
        if (!upstreamDef.autoDetect) {
          blockerIntents.push({
            taskId: task.id,
            blockerType: 'upstream_task',
            code: `awaiting_${upstream}`,
            severity,
            message: `Waiting for: ${upstreamDef.displayName}`,
            details: null,
            blockingTaskId: null,
          });
        }
      }
    }
  }

  // Write blockers
  await writeBlockers(allTasks as TaskRow[], blockerIntents, trx);

  // 9. Update blocker cache on engagement_tasks
  await updateBlockerCache(allTasks as TaskRow[], trx);

  // 10. Central audit: one summary event per evaluation run
  const taskEvaluationCompletedPayload = z.object({
    firm_company_id: z.string().uuid(),
    client_company_id: z.string().uuid(),
    domain_area: z.string(),
    period_count: z.number().int().nonnegative(),
    task_count: z.number().int().nonnegative(),
    active_blocker_count: z.number().int().nonnegative(),
  });
  await writeAuditEvent(
    taskEvaluationCompletedPayload,
    {
      companyId: clientCompanyId,
      entityType: 'task_evaluation',
      entityId: clientCompanyId,
      action: 'task_evaluation.completed',
      schemaVersion: '1.0.0',
      actorType: 'system',
      actorId: null,
      userId: null,
      eventAt: new Date().toISOString(),
      source: 'worker',
      payload: {
        firm_company_id: firmCompanyId,
        client_company_id: clientCompanyId,
        domain_area: ctx.domainArea,
        period_count: periods.length,
        task_count: allTasks.length,
        active_blocker_count: blockerIntents.length,
      },
    },
    trx,
  );

  logger.debug(
    {
      clientCompanyId,
      periods: periods.length,
      tasks: allTasks.length,
      blockers: blockerIntents.length,
    },
    'Evaluation complete',
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function periodKey(p: PeriodRange): string {
  return p.fiscal_calendar_id;
}

async function resolvePeriods(
  clientCompanyId: string,
  trx: Knex.Transaction,
): Promise<PeriodRange[]> {
  const rows = await trx('fiscal_calendar')
    .where({ company_id: clientCompanyId, period_type: 'monthly' })
    .where('status', 'open')
    .orderBy([{ column: 'fiscal_year' }, { column: 'period_number' }])
    .select(
      'id',
      'start_date',
      'end_date',
      'fiscal_year',
      'period_number',
      'period_type',
    );

  return rows.map((r) => ({
    fiscal_calendar_id: r.id,
    start_date: r.start_date,
    end_date: r.end_date,
    fiscal_year: r.fiscal_year,
    period_number: r.period_number,
    period_type: r.period_type,
  }));
}

async function ensureWorkflowRuns(
  firmCompanyId: string,
  clientCompanyId: string,
  periods: PeriodRange[],
  trx: Knex.Transaction,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  for (const p of periods) {
    const key = periodKey(p);
    const existing = await trx('workflow_runs')
      .where({
        client_company_id: clientCompanyId,
        domain_area: 'bookkeeping',
        fiscal_calendar_id: p.fiscal_calendar_id,
        is_deleted: false,
      })
      .select('id')
      .first();

    if (existing) {
      result.set(key, existing.id);
    } else {
      const [row] = await trx('workflow_runs')
        .insert({
          firm_company_id: firmCompanyId,
          client_company_id: clientCompanyId,
          domain_area: 'bookkeeping',
          fiscal_calendar_id: p.fiscal_calendar_id,
          status: 'not_started',
          source: 'system_detected',
        })
        .returning('id');
      result.set(key, row.id);
    }
  }

  return result;
}

async function upsertCompanyTask(
  ctx: EvaluateContext,
  clientQueries: ConditionCheckResult,
  trx: Knex.Transaction,
): Promise<void> {
  const def = getTaskDef('respond_to_queries');
  if (!def.autoDetect) return;

  await upsertTask(trx, {
    firmCompanyId: ctx.firmCompanyId,
    clientCompanyId: ctx.clientCompanyId,
    taskType: 'respond_to_queries',
    taskCategory: def.category,
    scopeType: 'company',
    scopeRef: { companyId: ctx.clientCompanyId },
    workflowRunId: null,
    sourceEntityId: null,
    title: def.displayName,
    priority: def.defaultPriority,
    metrics: clientQueries.details,
    shouldAutoResolve: def.autoResolve && !clientQueries.isActive,
  });
}

async function upsertBankAccountTasks(
  ctx: EvaluateContext,
  bankHealth: ConditionCheckResult,
  trx: Knex.Transaction,
): Promise<void> {
  const def = getTaskDef('reconnect_bank');
  if (!def.autoDetect) return;

  const unhealthyIds = (bankHealth.details.bankAccountIds as string[]) ?? [];

  for (const bankAccountId of unhealthyIds) {
    await upsertTask(trx, {
      firmCompanyId: ctx.firmCompanyId,
      clientCompanyId: ctx.clientCompanyId,
      taskType: 'reconnect_bank',
      taskCategory: def.category,
      scopeType: 'bank_account',
      scopeRef: { companyId: ctx.clientCompanyId, bankAccountId },
      workflowRunId: null,
      sourceEntityId: bankAccountId,
      title: def.displayName,
      priority: def.defaultPriority,
      metrics: {},
      shouldAutoResolve: false,
    });
  }

  // Auto-resolve reconnect_bank tasks for accounts that are healthy again
  if (def.autoResolve) {
    const existingTasks = await trx('engagement_tasks')
      .where({
        client_company_id: ctx.clientCompanyId,
        task_type: 'reconnect_bank',
        is_deleted: false,
      })
      .whereNotIn('status', COMPLETED_STATUSES)
      .select('id', 'source_entity_id');

    for (const task of existingTasks) {
      if (
        task.source_entity_id &&
        !unhealthyIds.includes(task.source_entity_id)
      ) {
        await autoResolveTask(trx, task.id);
      }
    }
  }
}

async function runPeriodConditionChecks(
  clientCompanyId: string,
  period: PeriodRange,
  trx: Knex.Transaction,
): Promise<ConditionCheckResult[]> {
  const [uncategorized, draftJournals, laterPeriods] = await Promise.all([
    checkUncategorizedTransactions(clientCompanyId, period, trx),
    checkDraftJournals(clientCompanyId, period, trx),
    checkLaterPeriodsClosed(clientCompanyId, period, trx),
  ]);
  return [uncategorized, draftJournals, laterPeriods];
}

const AUTO_DETECT_PERIOD_TASKS: TaskTypeCode[] = Array.from(
  TASK_REGISTRY.values(),
)
  .filter((d) => d.scopeType === 'company_period' && d.autoDetect)
  .map((d) => d.code);

async function upsertPeriodTasks(
  ctx: EvaluateContext,
  period: PeriodRange,
  workflowRunId: string,
  conditions: ConditionCheckResult[],
  trx: Knex.Transaction,
): Promise<void> {
  const uncategorized = conditions.find(
    (c) => c.code === 'uncategorized_transactions',
  );
  const draftJournals = conditions.find((c) => c.code === 'draft_journals');

  for (const taskType of AUTO_DETECT_PERIOD_TASKS) {
    const def = getTaskDef(taskType);
    if (!def.autoDetect) continue;

    let metrics: Record<string, unknown> = {};
    let shouldAutoResolve = false;

    if (taskType === 'categorize_transactions') {
      metrics = { uncategorized_count: uncategorized?.details?.count ?? 0 };
      shouldAutoResolve = def.autoResolve && !uncategorized?.isActive;
    } else if (taskType === 'review_ai_categorizations') {
      metrics = { review_count: 0 };
      shouldAutoResolve = false;
    } else if (taskType === 'review_draft_journals') {
      metrics = { draft_journal_count: draftJournals?.details?.count ?? 0 };
      shouldAutoResolve = def.autoResolve && !draftJournals?.isActive;
    }

    await upsertTask(trx, {
      firmCompanyId: ctx.firmCompanyId,
      clientCompanyId: ctx.clientCompanyId,
      taskType,
      taskCategory: def.category,
      scopeType: 'company_period',
      scopeRef: {
        companyId: ctx.clientCompanyId,
        fiscalYear: period.fiscal_year,
        periodNumber: period.period_number,
        periodType: period.period_type,
      },
      workflowRunId,
      sourceEntityId: null,
      title: `${def.displayName} - ${period.fiscal_year}/${String(period.period_number).padStart(2, '0')}`,
      priority: def.defaultPriority,
      metrics,
      shouldAutoResolve,
    });
  }
}

// ── Generic task upsert ──────────────────────────────────────────────

type UpsertTaskInput = {
  firmCompanyId: string;
  clientCompanyId: string;
  taskType: TaskTypeCode;
  taskCategory: string;
  scopeType: string;
  scopeRef: Record<string, unknown>;
  workflowRunId: string | null;
  sourceEntityId: string | null;
  title: string;
  priority: string;
  metrics: Record<string, unknown>;
  shouldAutoResolve: boolean;
};

async function upsertTask(
  trx: Knex.Transaction,
  input: UpsertTaskInput,
): Promise<string> {
  const existing = await trx('engagement_tasks')
    .where({
      client_company_id: input.clientCompanyId,
      task_type: input.taskType,
      is_deleted: false,
    })
    .where(
      trx.raw('COALESCE(workflow_run_id, ?) = ?', [
        SENTINEL_UUID,
        input.workflowRunId ?? SENTINEL_UUID,
      ]),
    )
    .where(
      trx.raw('COALESCE(source_entity_id, ?) = ?', [
        SENTINEL_UUID,
        input.sourceEntityId ?? SENTINEL_UUID,
      ]),
    )
    .select('id', 'status')
    .first();

  if (existing) {
    if (
      input.shouldAutoResolve &&
      !COMPLETED_STATUSES.includes(existing.status)
    ) {
      await autoResolveTask(trx, existing.id);
    } else if (!COMPLETED_STATUSES.includes(existing.status)) {
      await trx('engagement_tasks')
        .where({ id: existing.id })
        .update({
          metrics: JSON.stringify(input.metrics),
          title: input.title,
        });
    }
    return existing.id;
  }

  const status = input.shouldAutoResolve ? 'completed' : 'pending';
  const [row] = await trx('engagement_tasks')
    .insert({
      firm_company_id: input.firmCompanyId,
      client_company_id: input.clientCompanyId,
      workflow_run_id: input.workflowRunId,
      task_type: input.taskType,
      task_category: input.taskCategory,
      scope_type: input.scopeType,
      scope_ref: JSON.stringify(input.scopeRef),
      status,
      priority: input.priority,
      source: 'system_detected',
      source_entity_id: input.sourceEntityId,
      title: input.title,
      metrics: JSON.stringify(input.metrics),
      ...(status === 'completed'
        ? { resolved_at: trx.fn.now(), resolution_type: 'auto' }
        : {}),
    })
    .returning('id');

  await trx('engagement_task_events').insert({
    task_id: row.id,
    event_type: 'created',
    actor_type: 'system',
    new_value: status,
  });

  if (status === 'completed') {
    await trx('engagement_task_events').insert({
      task_id: row.id,
      event_type: 'status_changed',
      actor_type: 'system',
      old_value: 'pending',
      new_value: 'completed',
    });
  }

  return row.id;
}

async function autoResolveTask(
  trx: Knex.Transaction,
  taskId: string,
): Promise<void> {
  const task = await trx('engagement_tasks')
    .where({ id: taskId })
    .select('status')
    .first();

  if (!task || COMPLETED_STATUSES.includes(task.status)) return;

  const oldStatus = task.status;
  await trx('engagement_tasks').where({ id: taskId }).update({
    status: 'completed',
    resolved_at: trx.fn.now(),
    resolution_type: 'auto',
  });

  await trx('engagement_task_events').insert({
    task_id: taskId,
    event_type: 'status_changed',
    actor_type: 'system',
    old_value: oldStatus,
    new_value: 'completed',
  });
}

// ── Blocker computation helpers ──────────────────────────────────────

function getConditionsForTask(
  task: TaskRow,
  bankHealth: ConditionCheckResult,
  clientQueries: ConditionCheckResult,
  periodConditions: Map<string, ConditionCheckResult[]>,
  workflowRunIdByPeriodKey: Map<string, string>,
): ConditionCheckResult[] {
  const results: ConditionCheckResult[] = [];

  // Company-scoped conditions apply to all tasks
  results.push(bankHealth, clientQueries);

  // Period-scoped conditions apply to tasks in that period
  if (task.workflow_run_id) {
    for (const [key, wfId] of workflowRunIdByPeriodKey) {
      if (wfId === task.workflow_run_id) {
        const conds = periodConditions.get(key);
        if (conds) results.push(...conds);
        break;
      }
    }
  }

  return results;
}

function findUpstreamTasks(
  allTasks: TaskRow[],
  upstreamType: TaskTypeCode,
  downstreamTask: TaskRow,
): TaskRow[] {
  return allTasks.filter((t) => {
    if (t.task_type !== upstreamType) return false;
    // Same period (same workflow_run_id) when both are period-scoped
    if (downstreamTask.workflow_run_id && t.workflow_run_id) {
      return t.workflow_run_id === downstreamTask.workflow_run_id;
    }
    // Cross-scope: reconnect_bank (bank_account) blocking categorize_transactions (company_period)
    // Any incomplete reconnect_bank for the same client counts
    return true;
  });
}

// ── Write blockers ──────────────────────────────────────────────────

async function writeBlockers(
  allTasks: TaskRow[],
  intents: BlockerIntent[],
  trx: Knex.Transaction,
): Promise<void> {
  const taskIds = allTasks.map((t) => t.id);
  if (taskIds.length === 0) return;

  const existingBlockers = await trx('engagement_task_blockers')
    .whereIn('task_id', taskIds)
    .select('id', 'task_id', 'code', 'blocking_task_id', 'is_active');

  const existingByKey = new Map<string, { id: string; is_active: boolean }>();
  for (const b of existingBlockers) {
    const bKey = [b.task_id, b.code, b.blocking_task_id ?? SENTINEL_UUID].join(
      BLOCKER_KEY_SEP,
    );
    existingByKey.set(bKey, { id: b.id, is_active: b.is_active });
  }

  const activeKeys = new Set<string>();
  for (const intent of intents) {
    const bKey = [
      intent.taskId,
      intent.code,
      intent.blockingTaskId ?? SENTINEL_UUID,
    ].join(BLOCKER_KEY_SEP);
    activeKeys.add(bKey);
    const existing = existingByKey.get(bKey);

    if (existing) {
      if (!existing.is_active) {
        await trx('engagement_task_blockers')
          .where({ id: existing.id })
          .update({
            is_active: true,
            resolved_at: null,
            severity: intent.severity,
            message: intent.message,
            details: intent.details ? JSON.stringify(intent.details) : null,
          });

        await trx('engagement_task_events').insert({
          task_id: intent.taskId,
          event_type: 'blocker_added',
          actor_type: 'system',
          new_value: intent.code,
        });
      } else {
        await trx('engagement_task_blockers')
          .where({ id: existing.id })
          .update({
            severity: intent.severity,
            message: intent.message,
            details: intent.details ? JSON.stringify(intent.details) : null,
          });
      }
    } else {
      await trx('engagement_task_blockers').insert({
        task_id: intent.taskId,
        blocker_type: intent.blockerType,
        code: intent.code,
        severity: intent.severity,
        message: intent.message,
        details: intent.details ? JSON.stringify(intent.details) : null,
        blocking_task_id: intent.blockingTaskId,
        is_active: true,
      });

      await trx('engagement_task_events').insert({
        task_id: intent.taskId,
        event_type: 'blocker_added',
        actor_type: 'system',
        new_value: intent.code,
      });
    }
  }

  // Resolve blockers that are no longer active
  for (const [bKey, existing] of existingByKey) {
    if (!activeKeys.has(bKey) && existing.is_active) {
      await trx('engagement_task_blockers')
        .where({ id: existing.id })
        .update({ is_active: false, resolved_at: trx.fn.now() });

      const parts = bKey.split(BLOCKER_KEY_SEP);
      const taskId = parts[0];
      const code = parts[1];

      await trx('engagement_task_events').insert({
        task_id: taskId,
        event_type: 'blocker_resolved',
        actor_type: 'system',
        old_value: code,
      });
    }
  }
}

async function updateBlockerCache(
  allTasks: TaskRow[],
  trx: Knex.Transaction,
): Promise<void> {
  const taskIds = allTasks.map((t) => t.id);
  if (taskIds.length === 0) return;

  const activeBlockers = await trx('engagement_task_blockers')
    .whereIn('task_id', taskIds)
    .where({ is_active: true })
    .select('task_id', 'code', 'severity', 'message');

  const blockersByTask = new Map<
    string,
    Array<{ code: string; severity: string; message: string }>
  >();
  for (const b of activeBlockers) {
    const list = blockersByTask.get(b.task_id) ?? [];
    list.push({ code: b.code, severity: b.severity, message: b.message });
    blockersByTask.set(b.task_id, list);
  }

  // TODO: batch UPDATE (e.g. CASE WHEN or multi-row upsert) if task count grows
  for (const task of allTasks) {
    const list = blockersByTask.get(task.id) ?? [];
    const isBlocked = list.some((b) => b.severity === 'hard');
    const hasWarnings = list.some((b) => b.severity === 'warning');
    const blockingSummary = list.map((b) => ({
      code: b.code,
      severity: b.severity,
      message: b.message,
    }));

    await trx('engagement_tasks')
      .where({ id: task.id })
      .update({
        is_blocked: isBlocked,
        has_warnings: hasWarnings,
        blocking_summary: JSON.stringify(blockingSummary),
      });
  }
}
