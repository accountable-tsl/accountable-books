import { z } from 'zod';

import { aiMessage } from './ai.js';
import { AI_CAPABILITY_IDS } from './capability-ids.js';
import { aiEffect } from './effects.js';

/** Zod schema for capabilityId. Type is exported from capability-ids.js. */
export const aiCapabilityId = z.enum(AI_CAPABILITY_IDS);

export const aiChatRequest = z.object({
  threadId: z.string().uuid(),
  source: z.enum(['sidebar', 'inline']).optional(),
  capabilityId: aiCapabilityId,
  // Optional hint only. Backend is authoritative.
  domain: z.string().min(1).optional(),
  // Bounded conversation window. Backend maintains summaries/working-memory separately.
  messages: z.array(aiMessage).max(200),
  context: z
    .object({
      route: z.string().min(1).optional(),
      pageTitle: z.string().min(1).optional(),
    })
    .optional(),
});
export type AiChatRequest = z.infer<typeof aiChatRequest>;

/**
 * API chat request envelope. Validates capabilityId, domain, and message count.
 * Messages are left as unknown[] so the API can accept the AI SDK UIMessage shape (parts).
 */
export const apiChatRequest = z.object({
  threadId: z.string().uuid(),
  source: z.enum(['sidebar', 'inline']).optional(),
  capabilityId: aiCapabilityId,
  domain: z.string().min(1).optional(),
  messages: z.array(z.unknown()).max(200),
  context: z
    .object({
      route: z.string().min(1).optional(),
      pageTitle: z.string().min(1).optional(),
    })
    .optional(),
});
export type ApiChatRequest = z.infer<typeof apiChatRequest>;

export const aiChatErrorCode = z.enum([
  'INVALID_INPUT',
  'AI_DISABLED',
  'CAPABILITY_NOT_ALLOWED',
  'PROVIDER_ERROR',
  'TOOL_ERROR',
  'UNKNOWN',
]);
export type AiChatErrorCode = z.infer<typeof aiChatErrorCode>;

export const aiChatAssistantDeltaEvent = z.object({
  type: z.literal('assistant.delta'),
  messageId: z.string().min(1),
  delta: z.string(),
  capabilityId: z.string().min(1),
  domain: z.string().min(1).optional(),
});
export type AiChatAssistantDeltaEvent = z.infer<
  typeof aiChatAssistantDeltaEvent
>;

export const aiChatAssistantMessageEvent = z.object({
  type: z.literal('assistant.message'),
  message: aiMessage,
  capabilityId: z.string().min(1),
  domain: z.string().min(1).optional(),
});
export type AiChatAssistantMessageEvent = z.infer<
  typeof aiChatAssistantMessageEvent
>;

export const aiChatToolCallEvent = z.object({
  type: z.literal('tool.call'),
  toolCallId: z.string().min(1),
  tool: z.string().min(1),
  args: z.unknown(),
});
export type AiChatToolCallEvent = z.infer<typeof aiChatToolCallEvent>;

export const aiChatToolResultEvent = z.object({
  type: z.literal('tool.result'),
  toolCallId: z.string().min(1),
  tool: z.string().min(1),
  output: z.unknown(),
});
export type AiChatToolResultEvent = z.infer<typeof aiChatToolResultEvent>;

export const aiChatToolErrorEvent = z.object({
  type: z.literal('tool.error'),
  toolCallId: z.string().min(1),
  tool: z.string().min(1),
  errorText: z.string().min(1),
});
export type AiChatToolErrorEvent = z.infer<typeof aiChatToolErrorEvent>;

export const aiChatEffectEvent = z.object({
  type: z.literal('effect'),
  effect: aiEffect,
});
export type AiChatEffectEvent = z.infer<typeof aiChatEffectEvent>;

export const aiChatErrorEvent = z.object({
  type: z.literal('error'),
  code: aiChatErrorCode,
  message: z.string().min(1),
  details: z.unknown().optional(),
});
export type AiChatErrorEvent = z.infer<typeof aiChatErrorEvent>;

export const aiChatEvent = z.discriminatedUnion('type', [
  aiChatAssistantDeltaEvent,
  aiChatAssistantMessageEvent,
  aiChatToolCallEvent,
  aiChatToolResultEvent,
  aiChatToolErrorEvent,
  aiChatEffectEvent,
  aiChatErrorEvent,
]);
export type AiChatEvent = z.infer<typeof aiChatEvent>;
