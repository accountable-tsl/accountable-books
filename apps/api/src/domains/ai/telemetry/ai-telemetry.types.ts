import type { LanguageModelUsage } from 'ai';

export type AiProvider = 'openai';

export type AiChatRunStatus = 'running' | 'success' | 'error' | 'aborted';

export type AiTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  raw?: unknown;
};

export function toAiTokenUsage(
  usage: LanguageModelUsage | undefined,
): AiTokenUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.inputTokens ?? undefined,
    outputTokens: usage.outputTokens ?? undefined,
    totalTokens: usage.totalTokens ?? undefined,
    raw: usage.raw as unknown,
  };
}
