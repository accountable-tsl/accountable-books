import { z } from 'zod';

// NOTE: This schema is designed for the web + API boundary. Keep it stable.
// If we need domain enums later, add them as optional refinement rather than
// making this overly strict too early.

export const aiMessageRole = z.enum(['user', 'assistant']);
export type AiMessageRole = z.infer<typeof aiMessageRole>;

export const aiMessageMeta = z
  .object({
    domain: z.string().min(1).optional(),
    capabilityId: z.string().min(1).optional(),
    proposalId: z.string().min(1).optional(),
  })
  .optional();
export type AiMessageMeta = z.infer<typeof aiMessageMeta>;

export const aiMessage = z.object({
  id: z.string().min(1).optional(),
  role: aiMessageRole,
  text: z.string().min(1).max(20_000),
  timestamp: z.number().int().nonnegative().optional(),
  meta: aiMessageMeta,
});
export type AiMessage = z.infer<typeof aiMessage>;

export const aiProposeBody = z.object({
  capabilityId: z.string().min(1),
  input: z.string().min(1).max(20_000),
  // Optional chat context; backend can use this later for better grounding.
  messages: z.array(aiMessage).max(200).optional(),
  domain: z.string().min(1).optional(),
});
export type AiProposeBody = z.infer<typeof aiProposeBody>;

export const aiProposalStatus = z.enum(['draft']);
export type AiProposalStatus = z.infer<typeof aiProposalStatus>;

export const aiProposal = z.object({
  id: z.string().min(1),
  capabilityId: z.string().min(1),
  domain: z.string().min(1).optional(),
  status: aiProposalStatus,
  createdAt: z.number().int().nonnegative(),
});
export type AiProposal = z.infer<typeof aiProposal>;

export const aiAssistantMessage = z.object({
  id: z.string().min(1),
  role: z.literal('assistant'),
  text: z.string().min(1).max(20_000),
  timestamp: z.number().int().nonnegative(),
  meta: z
    .object({
      domain: z.string().min(1).optional(),
      capabilityId: z.string().min(1).optional(),
      proposalId: z.string().min(1).optional(),
    })
    .optional(),
});
export type AiAssistantMessage = z.infer<typeof aiAssistantMessage>;

// Inner `data` payload for the API response (the API wraps this in its ApiResponse).
export const aiProposeResponseData = z.object({
  assistantMessage: aiAssistantMessage,
  proposal: aiProposal,
});
export type AiProposeResponseData = z.infer<typeof aiProposeResponseData>;
