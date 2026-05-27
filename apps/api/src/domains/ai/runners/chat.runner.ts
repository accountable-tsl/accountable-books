import type { ServerResponse } from 'node:http';
import { createOpenAI } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  pipeUIMessageStreamToResponse,
  streamText,
} from 'ai';

import type { RunnerResult, RunParams } from './types.js';

export async function runChatRunner(params: RunParams): Promise<RunnerResult> {
  const { cap, messages, apiKey, res, req } = params;

  const modelMessages = await convertToModelMessages(messages);
  const provider = createOpenAI({ apiKey });
  const result = streamText({
    model: provider(cap.model),
    system: cap.systemPrompt,
    messages: modelMessages,
    abortSignal: params.abortSignal,
  });

  pipeUIMessageStreamToResponse({
    response: res as ServerResponse,
    stream: result.toUIMessageStream(),
  });

  // These promises resolve as the underlying stream is consumed (by the UI stream).
  const [finishReason, rawFinishReason, usage, totalUsage, text] =
    await Promise.all([
      result.finishReason,
      result.rawFinishReason,
      result.usage,
      result.totalUsage,
      result.text,
    ]);

  return {
    finishReason: String(finishReason),
    rawFinishReason: rawFinishReason ?? undefined,
    usage,
    totalUsage,
    text,
  };
}
