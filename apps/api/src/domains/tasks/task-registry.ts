import { z } from 'zod';

// ── Enums ────────────────────────────────────────────────────────────

export const taskCategory = z.enum([
  'categorization',
  'journals',
  'review',
  'client_action',
]);
export type TaskCategory = z.infer<typeof taskCategory>;

export const taskScopeType = z.enum([
  'company',
  'company_period',
  'bank_account',
]);
export type TaskScopeType = z.infer<typeof taskScopeType>;

export const taskPriority = z.enum(['urgent', 'high', 'normal', 'low']);
export type TaskPriority = z.infer<typeof taskPriority>;

export const taskStatus = z.enum([
  'pending',
  'in_progress',
  'completed',
  'skipped',
  'not_applicable',
]);
export type TaskStatus = z.infer<typeof taskStatus>;

export const taskSource = z.enum(['system_detected', 'manual']);
export type TaskSource = z.infer<typeof taskSource>;

export const blockerType = z.enum([
  'system_condition',
  'client_action',
  'upstream_task',
]);
export type BlockerType = z.infer<typeof blockerType>;

export const blockerSeverity = z.enum(['hard', 'warning']);
export type BlockerSeverity = z.infer<typeof blockerSeverity>;

export const taskEventType = z.enum([
  'created',
  'assigned',
  'status_changed',
  'comment',
  'blocker_added',
  'blocker_resolved',
  'due_date_changed',
  'priority_changed',
]);
export type TaskEventType = z.infer<typeof taskEventType>;

export const taskActorType = z.enum(['user', 'system', 'ai']);
export type TaskActorType = z.infer<typeof taskActorType>;

export const workflowDomainArea = z.enum(['bookkeeping', 'tax', 'audit']);
export type WorkflowDomainArea = z.infer<typeof workflowDomainArea>;

export const workflowRunStatus = z.enum([
  'not_started',
  'in_progress',
  'review_requested',
  'under_review',
  'approved',
  'sent',
  'closed',
]);
export type WorkflowRunStatus = z.infer<typeof workflowRunStatus>;

// ── Task type codes ──────────────────────────────────────────────────

export const taskTypeCode = z.enum([
  'categorize_transactions',
  'review_ai_categorizations',
  'review_draft_journals',
  'prepare_period_for_review',
  'request_review',
  'approve_period',
  'send_reports',
  'close_period',
  'reconnect_bank',
  'respond_to_queries',
]);
export type TaskTypeCode = z.infer<typeof taskTypeCode>;

// ── Task definition ──────────────────────────────────────────────────

export type TaskDef = {
  code: TaskTypeCode;
  category: TaskCategory;
  displayName: string;
  scopeType: TaskScopeType;
  autoDetect: boolean;
  autoResolve: boolean;
  defaultPriority: TaskPriority;
};

// ── Registry ─────────────────────────────────────────────────────────

const defs: TaskDef[] = [
  {
    code: 'categorize_transactions',
    category: 'categorization',
    displayName: 'Categorize transactions',
    scopeType: 'company_period',
    autoDetect: true,
    autoResolve: true,
    defaultPriority: 'high',
  },
  {
    code: 'review_ai_categorizations',
    category: 'categorization',
    displayName: 'Review AI categorizations',
    scopeType: 'company_period',
    autoDetect: true,
    autoResolve: true,
    defaultPriority: 'normal',
  },
  {
    code: 'review_draft_journals',
    category: 'journals',
    displayName: 'Review draft journals',
    scopeType: 'company_period',
    autoDetect: true,
    autoResolve: true,
    defaultPriority: 'normal',
  },
  {
    code: 'prepare_period_for_review',
    category: 'review',
    displayName: 'Prepare period for review',
    scopeType: 'company_period',
    autoDetect: true,
    autoResolve: false,
    defaultPriority: 'normal',
  },
  {
    code: 'request_review',
    category: 'review',
    displayName: 'Request internal review',
    scopeType: 'company_period',
    autoDetect: false,
    autoResolve: false,
    defaultPriority: 'normal',
  },
  {
    code: 'approve_period',
    category: 'review',
    displayName: 'Approve period',
    scopeType: 'company_period',
    autoDetect: true,
    autoResolve: false,
    defaultPriority: 'high',
  },
  {
    code: 'send_reports',
    category: 'review',
    displayName: 'Send client reports',
    scopeType: 'company_period',
    autoDetect: true,
    autoResolve: false,
    defaultPriority: 'normal',
  },
  {
    code: 'close_period',
    category: 'review',
    displayName: 'Close period',
    scopeType: 'company_period',
    autoDetect: true,
    autoResolve: false,
    defaultPriority: 'normal',
  },
  {
    code: 'reconnect_bank',
    category: 'client_action',
    displayName: 'Reconnect bank account',
    scopeType: 'bank_account',
    autoDetect: true,
    autoResolve: true,
    defaultPriority: 'urgent',
  },
  {
    code: 'respond_to_queries',
    category: 'client_action',
    displayName: 'Respond to client queries',
    scopeType: 'company',
    autoDetect: true,
    autoResolve: true,
    defaultPriority: 'normal',
  },
];

export const TASK_REGISTRY: ReadonlyMap<TaskTypeCode, TaskDef> = new Map(
  defs.map((d) => [d.code, d]),
);

export function getTaskDef(code: TaskTypeCode): TaskDef {
  const def = TASK_REGISTRY.get(code);
  if (!def) throw new Error(`Unknown task type: ${code}`);
  return def;
}
