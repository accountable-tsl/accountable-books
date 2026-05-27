import type { UIMessage } from 'ai';
import { readUIMessageStream } from 'ai';

import { createAiChatTransport, getAiChatApi } from './chat-transport';
import { toUiMessages, uiMessageText } from './message-mappers';

import type { AiDomainKey } from '../keys';
import type { AiMessage, AiRuntimeContext } from './types';

export type InlineChatRequest = {
  context: Pick<AiRuntimeContext, 'companyId'>;
  threadId: string;
  capabilityId: string;
  domain?: AiDomainKey;
  messages: AiMessage[];
  chatContext?: {
    route?: string;
    pageTitle?: string;
  };
  abortSignal?: AbortSignal;
};

export type InlineChatResult = {
  assistantMessage: UIMessage | null;
  assistantText: string;
};

export async function runInlineChat(
  request: InlineChatRequest,
): Promise<InlineChatResult> {
  const chatApi = getAiChatApi(request.context);
  const transport = createAiChatTransport(chatApi);
  const uiMessages = toUiMessages(request.messages);

  const stream = await transport.sendMessages({
    trigger: 'submit-message',
    chatId: request.threadId,
    messageId: undefined,
    messages: uiMessages as any,
    abortSignal: request.abortSignal,
    body: {
      threadId: request.threadId,
      source: 'inline',
      capabilityId: request.capabilityId,
      ...(request.domain ? { domain: request.domain } : {}),
      ...(request.chatContext ? { context: request.chatContext } : {}),
    },
  });

  let assistantMessage: UIMessage | null = null;
  for await (const message of readUIMessageStream({
    stream,
    terminateOnError: true,
  })) {
    assistantMessage = message;
  }

  const assistantText = uiMessageText((assistantMessage as any)?.parts ?? []);
  return {
    assistantMessage,
    assistantText: assistantText.trim(),
  };
}
