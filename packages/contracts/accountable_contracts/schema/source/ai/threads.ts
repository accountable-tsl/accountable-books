import { z } from 'zod';

import { aiMessage } from './ai.js';

export const aiChatThread = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  userId: z.string().uuid(),
  firmId: z.string().uuid().nullable(),
  title: z.string().nullable(),
  isDeleted: z.boolean(),
  lastMessageAt: z.string().nullable(), // ISO string from backend
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AiChatThread = z.infer<typeof aiChatThread>;

export const apiCreateThreadRequest = z.object({
  title: z.string().optional(),
});
export type ApiCreateThreadRequest = z.infer<typeof apiCreateThreadRequest>;

export const aiChatThreadListResponse = z.object({
  items: z.array(aiChatThread),
  nextCursor: z.string().nullable(),
});
export type AiChatThreadListResponse = z.infer<typeof aiChatThreadListResponse>;

export const aiChatMessageListResponse = z.object({
  items: z.array(aiMessage),
  nextCursor: z.string().nullable(),
});
export type AiChatMessageListResponse = z.infer<
  typeof aiChatMessageListResponse
>;
