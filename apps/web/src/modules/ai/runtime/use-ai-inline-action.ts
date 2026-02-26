import { useCallback, useEffect, useRef, useState } from 'react';

import { AI_SESSION_NOT_READY_MESSAGE } from './chat-transport';
import { runInlineChat } from './inline-chat-service';
import { aiRuntimeStore } from './store';

import type { AiDomainKey } from '../keys';
import type { AiMessage } from './types';

type InlineActionContext = {
  route?: string;
  pageTitle?: string;
};

type InlineActionDefaults = {
  capabilityId?: string;
  domain?: AiDomainKey;
  threadId?: string;
  context?: InlineActionContext;
};

type RunInlineActionParams = {
  prompt: string;
  capabilityId?: string;
  domain?: AiDomainKey;
  threadId?: string;
  context?: InlineActionContext;
};

type InlineActionResult = {
  threadId: string;
  userMessage: AiMessage;
  assistantMessage: AiMessage;
  assistantText: string;
};

function newMessageId(prefix: 'user' | 'assistant'): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function domainFromCapability(capabilityId: string): AiDomainKey | undefined {
  const [domain] = capabilityId.split('.');
  if (!domain) return undefined;
  return domain as AiDomainKey;
}

function normalizeContext(
  context?: InlineActionContext,
): InlineActionContext | undefined {
  const route =
    context?.route ??
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : undefined);
  const pageTitle =
    context?.pageTitle ??
    (typeof document !== 'undefined' ? document.title : undefined);

  if (!route && !pageTitle) return undefined;
  return { ...(route ? { route } : {}), ...(pageTitle ? { pageTitle } : {}) };
}

export function useAiInlineAction(defaults: InlineActionDefaults = {}) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const run = useCallback(
    async (params: RunInlineActionParams): Promise<InlineActionResult> => {
      const prompt = params.prompt.trim();
      if (!prompt) {
        throw new Error('Inline AI prompt is required.');
      }

      const runtime = aiRuntimeStore.getState();
      if (!runtime.policy.globalEnabled) {
        throw new Error('AI is disabled.');
      }

      const ctx = runtime.ctx;
      if (!ctx?.companyId) {
        throw new Error('AI runtime context is missing company id.');
      }

      const capabilityId = params.capabilityId ?? defaults.capabilityId;
      if (!capabilityId) {
        throw new Error('Inline AI capabilityId is required.');
      }
      if (!runtime.isCapabilityEnabled(capabilityId)) {
        throw new Error('This AI capability is disabled.');
      }

      const inferredDomain = domainFromCapability(capabilityId);
      const domain = params.domain ?? defaults.domain ?? inferredDomain;
      if (domain && !runtime.isDomainEnabled(domain)) {
        throw new Error('This AI domain is disabled.');
      }

      const requestedThreadId =
        params.threadId ?? defaults.threadId ?? runtime.activeThreadId;
      const threadId =
        requestedThreadId && isUuid(requestedThreadId)
          ? requestedThreadId
          : await runtime.ensureActiveThread();
      if (!threadId) {
        throw new Error('Unable to create an AI thread for this request.');
      }
      const timestamp = Date.now();
      const userMessage: AiMessage = {
        id: newMessageId('user'),
        role: 'user',
        text: prompt,
        timestamp,
        meta: {
          ...(domain ? { domain } : {}),
          source: 'inline',
          capabilityId,
        },
      };

      runtime.appendMessageToThread(threadId, userMessage);

      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      setError(null);
      setIsRunning(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const postUserState = aiRuntimeStore.getState();
        const threadMessages = postUserState.threads[threadId]?.messages ?? [
          userMessage,
        ];

        const result = await runInlineChat({
          context: { companyId: ctx.companyId },
          threadId,
          capabilityId,
          domain,
          messages: threadMessages,
          chatContext: normalizeContext(params.context ?? defaults.context),
          abortSignal: controller.signal,
        });

        const assistantText = result.assistantText || 'No response generated.';
        const assistantMessage: AiMessage = {
          id: result.assistantMessage?.id
            ? String(result.assistantMessage.id)
            : newMessageId('assistant'),
          role: 'assistant',
          text: assistantText,
          timestamp: Date.now(),
          meta: {
            ...(domain ? { domain } : {}),
            source: 'inline',
            capabilityId,
          },
        };

        aiRuntimeStore
          .getState()
          .appendMessageToThread(threadId, assistantMessage);
        return {
          threadId,
          userMessage,
          assistantMessage,
          assistantText,
        };
      } catch (caught) {
        if ((caught as any)?.name === 'AbortError') {
          setError(null);
          throw caught;
        }

        const userFacingMessage = AI_SESSION_NOT_READY_MESSAGE;
        const fallbackAssistantMessage: AiMessage = {
          id: newMessageId('assistant'),
          role: 'assistant',
          text: userFacingMessage,
          timestamp: Date.now(),
          meta: {
            ...(domain ? { domain } : {}),
            source: 'inline',
            capabilityId,
          },
        };
        aiRuntimeStore
          .getState()
          .appendMessageToThread(threadId, fallbackAssistantMessage);

        setError(userFacingMessage);
        throw new Error(userFacingMessage);
      } finally {
        if (runIdRef.current === runId) {
          setIsRunning(false);
          abortRef.current = null;
        }
      }
    },
    [
      defaults.capabilityId,
      defaults.context,
      defaults.domain,
      defaults.threadId,
    ],
  );

  return {
    run,
    cancel,
    isRunning,
    error,
  };
}
