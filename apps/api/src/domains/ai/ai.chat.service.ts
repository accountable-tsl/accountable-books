import type { ApiChatRequest } from '@accountable-books/contracts/schema';
import type { UIMessage } from 'ai';
import type { Request, Response } from 'express';
import type { ServerResponse } from 'node:http';
import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import z from 'zod';

import { ENV } from '../../config/env.js';
import { logger } from '../../shared/index.js';
import { writeAuditEvent } from '../audit/audit.model.js';
import {
  updateThreadLastMessageAt,
  upsertChatMessage,
} from './ai-chat-history.model.js';
import { resolveCapability } from './capabilities/registry.js';
import { evaluateAiGuardrail } from './guardrails/evaluator.js';
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

const GENERIC_AI_UNAVAILABLE_MESSAGE = 'AI is unavailable right now.';
const GENERIC_AI_ERROR_MESSAGE = 'AI encountered an error. Please retry.';

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extractUiMessageText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const content = (message as any).content;
  if (typeof content === 'string' && content.trim()) return content;

  const parts = Array.isArray((message as any).parts)
    ? ((message as any).parts as unknown[])
    : [];
  const text = parts
    .filter(
      (part): part is { type: string; text: string } =>
        Boolean(part) &&
        typeof part === 'object' &&
        typeof (part as any).type === 'string' &&
        typeof (part as any).text === 'string',
    )
    .map((part) => part.text)
    .join('');

  return text;
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
  const { messages, capabilityId, domain, threadId, source } = body;

  if (!threadId) {
    return respondWithAssistantText(res, 'Thread ID is required.');
  }

  if (!isAiEnabled()) {
    logger.warn(
      { userId, companyId, aiEnabled: ENV.AI_ENABLED },
      'AI request blocked because AI is disabled',
    );
    return respondWithAssistantText(res, GENERIC_AI_UNAVAILABLE_MESSAGE);
  }

  const apiKey = String(ENV.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    logger.error(
      { userId, companyId },
      'AI request blocked because OPENAI_API_KEY is missing',
    );
    return respondWithAssistantText(res, GENERIC_AI_UNAVAILABLE_MESSAGE);
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

  const guardrailDecision = evaluateAiGuardrail({
    messages,
    capabilityId: cap.capabilityId,
    domain: cap.domain,
  });
  if (!guardrailDecision.allow) {
    const promptPreview =
      guardrailDecision.reasonCode === 'crisis_support'
        ? undefined
        : guardrailDecision.latestUserText.slice(0, 160);
    logger.info(
      {
        userId,
        companyId,
        capabilityId: cap.capabilityId,
        domain: cap.domain,
        reasonCode: guardrailDecision.reasonCode,
        source,
        route: body.context?.route,
        pageTitle: body.context?.pageTitle,
        promptPreview,
      },
      'AI request blocked by guardrail',
    );
    return respondWithAssistantText(res, guardrailDecision.userMessage);
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

  // Persist incoming user messages to the database
  try {
    const userMessages = messages.filter((m: any) => m.role === 'user');
    for (const msg of userMessages) {
      const text = extractUiMessageText(msg);
      if (!text.trim()) continue;
      await upsertChatMessage({
        threadId,
        companyId,
        userId,
        clientMessageId: (msg as any).id,
        role: 'user',
        text,
        meta: { domain, capabilityId, source },
        occurredAt: startedAt,
      });
    }
  } catch (error) {
    logger.warn(
      { error, userId, companyId, threadId },
      'Failed to upsert user messages',
    );
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

      // Persist the assistant message to the database
      if (result.text && status === 'success') {
        try {
          // Assistant response acts as the final resolution for this run
          await upsertChatMessage({
            threadId,
            companyId,
            userId,
            clientMessageId: `ast-${chatRunId}`, // Deterministic ID for this run's response
            role: 'assistant',
            text: result.text,
            meta: { domain, capabilityId, source },
            chatRunId,
            occurredAt: finishedAt,
          });

          // Update thread activity timestamp
          await updateThreadLastMessageAt(threadId, finishedAt);
        } catch (error) {
          logger.warn(
            { error, threadId, chatRunId },
            'Failed to persist assistant message',
          );
        }
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

    respondWithAssistantText(res, GENERIC_AI_ERROR_MESSAGE);
  }
}
