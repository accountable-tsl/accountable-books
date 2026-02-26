import type { UIMessage } from 'ai';

import type { AiDomainKey } from '../keys';
import type { AiMessage } from './types';

export type AiMessageMetadata = {
  domain?: AiDomainKey;
  capabilityId?: string;
  source?: 'inline';
};

export function uiMessageText(parts: unknown[]): string {
  return (parts ?? [])
    .filter(
      (part): part is { type: 'text'; text: string } =>
        Boolean(part) &&
        typeof part === 'object' &&
        (part as any).type === 'text' &&
        typeof (part as any).text === 'string',
    )
    .map((part) => part.text)
    .join('');
}

export function toUiMessages(seed: AiMessage[]): UIMessage[] {
  return seed.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: 'text', text: message.text }],
    createdAt: new Date(message.timestamp),
    metadata: message.meta
      ? {
          domain: message.meta.domain,
          capabilityId: message.meta.capabilityId,
          source: message.meta.source,
        }
      : undefined,
  }));
}

export function toAiMessages(messages: UIMessage[]): AiMessage[] {
  return (messages ?? [])
    .filter(
      (message) => message.role === 'user' || message.role === 'assistant',
    )
    .map((message) => {
      const text = uiMessageText((message as any).parts ?? []);
      const metadata = (message as any).metadata as
        | AiMessageMetadata
        | undefined;
      const createdAt = (message as any).createdAt;
      const timestamp =
        createdAt instanceof Date
          ? createdAt.getTime()
          : typeof createdAt === 'string' || typeof createdAt === 'number'
            ? new Date(createdAt).getTime()
            : Date.now();

      return {
        id: String((message as any).id),
        role: message.role as 'user' | 'assistant',
        text,
        timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
        meta: metadata
          ? {
              domain: metadata.domain,
              capabilityId: metadata.capabilityId,
              source: metadata.source,
            }
          : undefined,
      };
    })
    .filter((message) => message.text.trim().length > 0);
}
