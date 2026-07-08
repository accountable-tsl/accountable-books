import { z } from 'zod';

/**
 * work_item-native firm work queue contract.
 *
 * This is the materialized-queue read shape (grouped work items + their exact
 * subjects). It is intentionally separate from the legacy FirmTaskQueueResponse
 * so the new work-items system can evolve independently.
 */

export const workQueueStatusSchema = z.enum(['open', 'closed']);
export type WorkQueueStatus = z.infer<typeof workQueueStatusSchema>;

/** An exact fixable unit under a grouped work item. */
export const workQueueSubjectSchema = z.object({
  subjectId: z.uuid(),
  canonicalSubjectKey: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  /** Convenience projection of targetId when targetType is categorization_candidate. */
  candidateId: z.uuid().nullable(),
  /** Convenience projection of targetId when targetType is bank_transaction. */
  bankTransactionId: z.uuid().nullable(),
  sortDate: z.string().nullable(),
  amount: z.number().nullable(),
});
export type WorkQueueSubject = z.infer<typeof workQueueSubjectSchema>;

/** Where the queue row routes the user, and how to filter that workspace. */
export const workQueueDestinationSchema = z.object({
  workspace: z.string(),
  filterMode: z.string(),
  filters: z.record(z.string(), z.unknown()),
});
export type WorkQueueDestination = z.infer<typeof workQueueDestinationSchema>;

/** A grouped, actionable firm-queue row with its exact subjects. */
export const workQueueItemSchema = z.object({
  workItemId: z.uuid(),
  workType: z.string(),
  status: workQueueStatusSchema,
  title: z.string().nullable(),
  firmCompanyId: z.uuid(),
  clientCompanyId: z.uuid(),
  clientDisplayName: z.string().nullable(),
  /** Stored assigned user (null = firm-level/unassigned pool). */
  assignedUserId: z.uuid().nullable(),
  /** Derived effective owner = assigned user, else client assignee, else null. */
  effectiveOwnerUserId: z.uuid().nullable(),
  activeSubjectCount: z.number().int().nonnegative(),
  primaryAction: z.string().nullable(),
  availableActions: z.array(z.string()),
  requiredCapabilities: z.array(z.string()),
  destination: workQueueDestinationSchema,
  subjects: z.array(workQueueSubjectSchema),
});
export type WorkQueueItem = z.infer<typeof workQueueItemSchema>;

export const workQueueResponseSchema = z.object({
  firmCompanyId: z.uuid(),
  items: z.array(workQueueItemSchema),
});
export type WorkQueueResponse = z.infer<typeof workQueueResponseSchema>;
