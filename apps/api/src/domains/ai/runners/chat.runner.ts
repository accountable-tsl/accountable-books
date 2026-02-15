import type { ServerResponse } from 'node:http';
import { createOpenAI } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  pipeUIMessageStreamToResponse,
  streamText,
} from 'ai';

import type { RunParams } from './types.js';

export async function runChatRunner(params: RunParams): Promise<void> {
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
}
