import { z } from 'zod';

export const firmClientStatusSchema = z.enum([
  'healthy',
  'overdue',
  'need_attention',
  'new',
]);
export type FirmClientStatus = z.infer<typeof firmClientStatusSchema>;

export const firmClientAssigneeSchema = z.object({
  userId: z.uuid().optional(),
  name: z.string(),
  initials: z.string(),
});
export type FirmClientAssignee = z.infer<typeof firmClientAssigneeSchema>;

export const firmClientTransactionStatsSchema = z.object({
  today: z.number().int().nonnegative(),
  week: z.number().int().nonnegative(),
  month: z.number().int().nonnegative(),
  todayPrev: z.number().int().nonnegative(),
  weekPrev: z.number().int().nonnegative(),
  monthPrev: z.number().int().nonnegative(),
});
export type FirmClientTransactionStats = z.infer<
  typeof firmClientTransactionStatsSchema
>;

export const firmClientSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  shortCode: z.string().max(32).nullish(),
  industry: z.string().optional(),
  openTaskCount: z.number().int().nonnegative(),
  lastActivityLabel: z.string(),
  status: firmClientStatusSchema,
  assignee: firmClientAssigneeSchema.optional(),
  transactionStats: firmClientTransactionStatsSchema.optional(),
});
export type FirmClientSummary = z.infer<typeof firmClientSummarySchema>;

export const firmClientRosterResponseSchema = z.object({
  firmCompanyId: z.uuid(),
  clients: z.array(firmClientSummarySchema),
});
export type FirmClientRosterResponse = z.infer<
  typeof firmClientRosterResponseSchema
>;
