import type { ApiChatRequest } from '@accountable-books/contracts/schema';
import type { UIMessage } from 'ai';
import type { Request, Response } from 'express';
import type { ServerResponse } from 'node:http';
import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import z from 'zod';

import { ENV, isDev } from '../../config/env.js';
import { logger } from '../../shared/index.js';
import { writeAuditEvent } from '../audit/audit.model.js';
import { resolveCapability } from './capabilities/registry.js';
import { getRunner } from './runners/index.js';
import {
  createChatRun,
  finishChatRun,
} from './telemetry/ai-chat-runs.model.js';

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

  const startedAt = new Date();
  let chatRunId: string | null = null;

  // Minimal DB-backed audit log for launch readiness.
  // Keep payload small (avoid storing full prompt/response by default).
  try {
    await writeAuditEvent(
      z.object({
        capabilityId: z.string().min(1),
        domain: z.string().min(1).optional(),
        model: z.string().min(1),
        messageCount: z.number().int().nonnegative(),
      }),
      {
        companyId,
        entityType: 'ai',
        entityId: companyId, // tenant-scoped subject for now
        action: 'ai.chat.requested',
        schemaVersion: 'v1',
        actorType: 'user',
        actorId: userId,
        userId,
        eventAt: new Date().toISOString(),
        source: 'api',
        ip: (req.ip as any) ?? null,
        userAgent: String(req.headers['user-agent'] ?? '') || null,
        payload: {
          capabilityId: cap.capabilityId,
          domain: cap.domain,
          model: cap.model,
          messageCount: messages.length,
        },
      },
    );
  } catch (error) {
    logger.warn({ error, userId, companyId }, 'AI audit log failed');
  }

  // Durable chat run record (tokens, cost, failures). If DB insert fails, do not block chat.
  try {
    const run = await createChatRun({
      companyId,
      userId,
      capabilityId: cap.capabilityId,
      domain: cap.domain,
      provider: 'openai',
      model: cap.model,
      requestMessageCount: messages.length,
      startedAt,
      metadata: {
        route: body.context?.route,
        pageTitle: body.context?.pageTitle,
      },
    });
    chatRunId = run.id;
  } catch (error) {
    logger.warn({ error, userId, companyId }, 'Failed to create ai_chat_run');
  }

  const abort = new AbortController();
  req.on('close', () => abort.abort());

  try {
    const runner = getRunner(cap.runner);
    const result = await runner.run({
      cap,
      messages: messages as UIMessage[],
      apiKey,
      abortSignal: abort.signal,
      res,
      req,
    });

    if (chatRunId) {
      const finishedAt = new Date();
      const status = abort.signal.aborted ? 'aborted' : 'success';
      const usage = result.totalUsage ?? result.usage;

      let finished;
      try {
        finished = await finishChatRun({
          chatRunId,
          status,
          finishReason: result.finishReason ?? null,
          usage,
          finishedAt,
          errorText: null,
        });
      } catch (error) {
        logger.warn({ error, chatRunId }, 'Failed to finish ai_chat_run');
      }

      // Best-effort audit log for usage/cost visibility.
      try {
        await writeAuditEvent(
          z.object({
            chatRunId: z.string().min(1),
            capabilityId: z.string().min(1),
            domain: z.string().min(1).optional(),
            model: z.string().min(1),
            status: z.string().min(1),
            finishReason: z.string().min(1).optional(),
            inputTokens: z.number().int().nonnegative().nullable(),
            outputTokens: z.number().int().nonnegative().nullable(),
            totalTokens: z.number().int().nonnegative().nullable(),
            totalCostUsdMicros: z.number().int().nonnegative().nullable(),
          }),
          {
            companyId,
            entityType: 'ai',
            entityId: chatRunId,
            action: 'ai.chat.finished',
            schemaVersion: 'v1',
            actorType: 'user',
            actorId: userId,
            userId,
            eventAt: finishedAt.toISOString(),
            source: 'api',
            ip: (req.ip as any) ?? null,
            userAgent: String(req.headers['user-agent'] ?? '') || null,
            payload: {
              chatRunId,
              capabilityId: cap.capabilityId,
              domain: cap.domain,
              model: cap.model,
              status,
              finishReason: result.finishReason ?? undefined,
              inputTokens: finished?.inputTokens ?? usage?.inputTokens ?? null,
              outputTokens:
                finished?.outputTokens ?? usage?.outputTokens ?? null,
              totalTokens: finished?.totalTokens ?? usage?.totalTokens ?? null,
              totalCostUsdMicros: finished?.totalCostUsdMicros ?? null,
            },
          },
        );
      } catch (error) {
        logger.warn({ error, chatRunId }, 'AI audit finish log failed');
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, userId, companyId, capabilityId }, 'AI chat failed');

    if (chatRunId) {
      try {
        await finishChatRun({
          chatRunId,
          status: abort.signal.aborted ? 'aborted' : 'error',
          finishReason: null,
          usage: undefined,
          finishedAt: new Date(),
          errorText: msg,
        });
      } catch (finishError) {
        logger.warn(
          { finishError, chatRunId },
          'Failed to mark ai_chat_run as errored',
        );
      }
    }

    respondWithAssistantText(
      res,
      isDev ? `AI error: ${msg}` : 'AI encountered an error. Please retry.',
    );
  }
}
