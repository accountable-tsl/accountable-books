import { z } from 'zod';

export const aiApprovalStatus = z.enum(['pending', 'executed', 'rejected']);
export type AiApprovalStatus = z.infer<typeof aiApprovalStatus>;

// Approval is the deterministic, idempotent unit of execution for a write action.
// It is created during /chat, then executed via /ai/approvals/:id/execute (no LLM re-entry).
export const aiApproval = z.object({
  id: z.string().min(1),
  companyId: z.string().min(1),
  requestedByUserId: z.string().min(1),

  capabilityId: z.string().min(1),
  domain: z.string().min(1).optional(),

  summary: z.string().min(1),
  risk: z.enum(['low', 'medium', 'high']).default('high'),

  // The tool to execute and its already-validated args.
  tool: z.string().min(1),
  toolArgs: z.unknown(),

  createdAt: z.number().int().nonnegative(),
  decidedAt: z.number().int().nonnegative().optional(),
  status: aiApprovalStatus,
});
export type AiApproval = z.infer<typeof aiApproval>;

export const aiExecuteApprovalResponse = z.object({
  approval: aiApproval,
  // Tool output/result summary (domain-defined).
  result: z.unknown().optional(),
});
export type AiExecuteApprovalResponse = z.infer<
  typeof aiExecuteApprovalResponse
>;
