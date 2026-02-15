import type { ApiChatRequest } from '@accountable-books/contracts/schema';
import type { UIMessage } from 'ai';
import type { Request, Response } from 'express';
import type { ServerResponse } from 'node:http';
import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';

import { ENV, isDev } from '../../config/env.js';
import { logger } from '../../shared/index.js';
import { resolveCapability } from './capabilities/registry.js';
import { getRunner } from './runners/index.js';

function isAiEnabled(): boolean {
  return (
    String(ENV.AI_ENABLED).toLowerCase() === 'true' ||
    String(ENV.AI_ENABLED) === '1'
  );
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function respondWithAssistantText(res: Response, text: string): void {
  const messageId = newId('m');
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: 'text-start', id: messageId });
      writer.write({ type: 'text-delta', id: messageId, delta: text });
      writer.write({ type: 'text-end', id: messageId });
    },
  });
  pipeUIMessageStreamToResponse({
    response: res as ServerResponse,
    stream,
  });
}

export type StreamChatParams = {
  companyId: string;
  userId: string;
  body: ApiChatRequest;
  res: Response;
  req: Request;
};

/**
 * Resolves capability, streams LLM response to res. Sends error as assistant text on failure.
 */
export async function streamChat(params: StreamChatParams): Promise<void> {
  const { companyId, userId, body, res, req } = params;
  const { messages, capabilityId, domain } = body;

  if (!isAiEnabled()) {
    const msg = isDev
      ? 'AI is disabled. Set `AI_ENABLED=true` in `apps/api/.env.local`.'
      : 'AI is unavailable right now.';
    return respondWithAssistantText(res, msg);
  }

  const apiKey = String(ENV.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    const msg = isDev
      ? 'OpenAI is not configured. Set `OPENAI_API_KEY` in `apps/api/.env.local`.'
      : 'AI is unavailable right now.';
    return respondWithAssistantText(res, msg);
  }

  let cap;
  try {
    const defaultModel = String(ENV.OPENAI_MODEL || 'gpt-4o-mini');
    cap = resolveCapability({
      capabilityId,
      domainHint: domain,
      defaultModel,
    });
  } catch (error) {
    logger.warn(
      { capabilityId, domain, userId, companyId },
      'Capability not allowed',
    );
    return respondWithAssistantText(res, 'This capability is not available.');
  }

  logger.info(
    {
      userId,
      companyId,
      capabilityId: cap.capabilityId,
      domain: cap.domain,
      model: cap.model,
      messageCount: messages.length,
    },
    'AI chat start',
  );

  const abort = new AbortController();
  req.on('close', () => abort.abort());

  try {
    const runner = getRunner(cap.runner);
    await runner.run({
      cap,
      messages: messages as UIMessage[],
      apiKey,
      abortSignal: abort.signal,
      res,
      req,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, userId, companyId, capabilityId }, 'AI chat failed');
    respondWithAssistantText(
      res,
      isDev ? `AI error: ${msg}` : 'AI encountered an error. Please retry.',
    );
  }
}
