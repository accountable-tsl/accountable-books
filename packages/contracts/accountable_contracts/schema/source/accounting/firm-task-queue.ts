import { z } from 'zod';

export const firmTaskStatusSchema = z.enum(['pending', 'in_progress']);
export type FirmTaskStatus = z.infer<typeof firmTaskStatusSchema>;

export const firmTaskPrioritySchema = z.enum([
  'urgent',
  'high',
  'normal',
  'low',
]);
export type FirmTaskPriority = z.infer<typeof firmTaskPrioritySchema>;

export const firmTaskActionabilityStateSchema = z.enum([
  'actionable_now',
  'blocked_by_client',
  'blocked_by_dependency',
  'informational',
]);
export type FirmTaskActionabilityState = z.infer<
  typeof firmTaskActionabilityStateSchema
>;

export const firmViewerRoleSchema = z.enum(['staff', 'manager', 'admin']);
export type FirmViewerRole = z.infer<typeof firmViewerRoleSchema>;

export const firmEngagementTaskTypeSchema = z.enum([
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
export type FirmEngagementTaskType = z.infer<
  typeof firmEngagementTaskTypeSchema
>;

export const firmEngagementTaskCategorySchema = z.enum([
  'categorization',
  'journals',
  'review',
  'client_action',
]);
export type FirmEngagementTaskCategory = z.infer<
  typeof firmEngagementTaskCategorySchema
>;

export const firmEngagementTaskScopeTypeSchema = z.enum([
  'company',
  'company_period',
  'bank_account',
]);
export type FirmEngagementTaskScopeType = z.infer<
  typeof firmEngagementTaskScopeTypeSchema
>;

export const firmTaskAssigneeSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  initials: z.string(),
});
export type FirmTaskAssignee = z.infer<typeof firmTaskAssigneeSchema>;

export const firmTaskQueueItemSchema = z.object({
  id: z.uuid(),
  firmCompanyId: z.uuid(),
  taskType: firmEngagementTaskTypeSchema,
  taskCategory: firmEngagementTaskCategorySchema,
  scopeType: firmEngagementTaskScopeTypeSchema,
  title: z.string(),
  description: z.string().nullable(),
  status: firmTaskStatusSchema,
  priority: firmTaskPrioritySchema,
  dueDate: z.string().nullable(),
  isOverdue: z.boolean(),
  isBlocked: z.boolean(),
  actionabilityState: firmTaskActionabilityStateSchema,
  hasWarnings: z.boolean(),
  primaryBlockerLabel: z.string().nullable(),
  clientCompanyId: z.uuid(),
  clientDisplayName: z.string(),
  periodLabel: z.string().nullable(),
  workflowRunId: z.uuid().nullable(),
  assignedTo: firmTaskAssigneeSchema.nullable(),
  deepLink: z.string(),
  metrics: z.record(z.string(), z.unknown()),
});
export type FirmTaskQueueItem = z.infer<typeof firmTaskQueueItemSchema>;

export const firmTaskQueueSummarySchema = z.object({
  totalTasks: z.number().int().nonnegative(),
  actionableCount: z.number().int().nonnegative(),
  waitingCount: z.number().int().nonnegative(),
  clientCompanyCount: z.number().int().nonnegative(),
  criticalCount: z.number().int().nonnegative(),
  dueTodayCount: z.number().int().nonnegative(),
});
export type FirmTaskQueueSummary = z.infer<typeof firmTaskQueueSummarySchema>;

export const firmTaskQueueResponseSchema = z.object({
  firmCompanyId: z.uuid(),
  summary: firmTaskQueueSummarySchema,
  actionableItems: z.array(firmTaskQueueItemSchema),
  waitingItems: z.array(firmTaskQueueItemSchema),
});
export type FirmTaskQueueResponse = z.infer<typeof firmTaskQueueResponseSchema>;
