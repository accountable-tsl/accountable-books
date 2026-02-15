import { z } from 'zod';

// Effects are typed artifacts emitted by the backend for the UI to render or apply.
// The UI must only execute effects it supports and considers safe in its current surface.

export const aiEffectUiNavigate = z.object({
  type: z.literal('ui.navigate'),
  to: z.string().min(1),
});
export type AiEffectUiNavigate = z.infer<typeof aiEffectUiNavigate>;

export const aiEffectUiHighlight = z.object({
  type: z.literal('ui.highlight'),
  selector: z.string().min(1),
  label: z.string().min(1).optional(),
});
export type AiEffectUiHighlight = z.infer<typeof aiEffectUiHighlight>;

export const aiEffectProposalPreview = z.object({
  type: z.literal('proposal.preview'),
  proposalId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  // risk is a UX hint; execution is still gated by approvals.
  risk: z.enum(['low', 'medium', 'high']).default('medium'),
});
export type AiEffectProposalPreview = z.infer<typeof aiEffectProposalPreview>;

export const aiEffectProposalForm = z.object({
  type: z.literal('proposal.form'),
  proposalId: z.string().min(1),
  formType: z.string().min(1),
  // Schema depends on domain/capability; validated by the capability itself.
  data: z.unknown(),
});
export type AiEffectProposalForm = z.infer<typeof aiEffectProposalForm>;

export const aiEffectApprovalRequest = z.object({
  type: z.literal('approval.request'),
  approvalId: z.string().min(1),
  proposalId: z.string().min(1).optional(),
  summary: z.string().min(1),
  risk: z.enum(['low', 'medium', 'high']).default('high'),
});
export type AiEffectApprovalRequest = z.infer<typeof aiEffectApprovalRequest>;

export const aiEffectJobStarted = z.object({
  type: z.literal('job.started'),
  jobId: z.string().min(1),
  label: z.string().min(1),
});
export type AiEffectJobStarted = z.infer<typeof aiEffectJobStarted>;

export const aiEffectJobProgress = z.object({
  type: z.literal('job.progress'),
  jobId: z.string().min(1),
  pct: z.number().min(0).max(100),
  message: z.string().min(1).optional(),
});
export type AiEffectJobProgress = z.infer<typeof aiEffectJobProgress>;

export const aiEffectJobCompleted = z.object({
  type: z.literal('job.completed'),
  jobId: z.string().min(1),
  resultSummary: z.string().min(1),
});
export type AiEffectJobCompleted = z.infer<typeof aiEffectJobCompleted>;

export const aiEffect = z.discriminatedUnion('type', [
  aiEffectUiNavigate,
  aiEffectUiHighlight,
  aiEffectProposalPreview,
  aiEffectProposalForm,
  aiEffectApprovalRequest,
  aiEffectJobStarted,
  aiEffectJobProgress,
  aiEffectJobCompleted,
]);
export type AiEffect = z.infer<typeof aiEffect>;
