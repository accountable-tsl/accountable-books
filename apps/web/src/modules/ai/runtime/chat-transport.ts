import { authStore } from '@/modules/auth';
import { DefaultChatTransport } from 'ai';

import { aiRuntimeStore } from './store';

import type { AiRuntimeContext } from './types';

export const AI_SESSION_NOT_READY_MESSAGE =
  'AI is still getting ready. Please try again in a moment.';
export const INVALID_AI_CHAT_API = '/api/invalid-ai-chat';

export function getAiChatApi(
  context: Pick<AiRuntimeContext, 'companyId'>,
): string {
  const backendBaseUrl = String(import.meta.env.VITE_BACKEND_URL || '').replace(
    /\/$/,
    '',
  );

  if (backendBaseUrl) {
    return `${backendBaseUrl}/api/${context.companyId}/ai/chat`;
  }

  return `/api/${context.companyId}/ai/chat`;
}

export function createAiChatTransport(chatApi: string) {
  return new DefaultChatTransport({
    api: chatApi,
    credentials: 'include',
    prepareSendMessagesRequest: (options) => {
      const runtimeCompanyId = aiRuntimeStore.getState().ctx?.companyId;
      const resolvedApi =
        chatApi && chatApi !== INVALID_AI_CHAT_API
          ? chatApi
          : runtimeCompanyId
            ? getAiChatApi({ companyId: runtimeCompanyId })
            : options.api;

      const csrfToken = authStore.getState().csrfToken;
      if (!csrfToken) {
        if (import.meta.env.DEV) {
          console.warn('[ai] Missing CSRF token; blocked chat send.', {
            api: resolvedApi,
            path:
              typeof window !== 'undefined'
                ? `${window.location.pathname}${window.location.search}`
                : undefined,
          });
        }
        throw new Error(AI_SESSION_NOT_READY_MESSAGE);
      }
      const headers = new Headers(options.headers);
      headers.set('X-CSRF-Token', csrfToken);

      return {
        api: resolvedApi,
        credentials: options.credentials ?? 'include',
        headers,
        body: {
          ...(options.body ?? {}),
          id: options.id,
          messages: options.messages,
          trigger: options.trigger,
          messageId: options.messageId,
        },
      };
    },
  });
}
