import type { AiDomainKey } from '@/modules/ai/keys';
import type { AiCapabilityUI } from '@/modules/ai/runtime/types';
import { cn } from '@/lib/utils';
import { AI_SESSION_NOT_READY_MESSAGE } from '@/modules/ai/runtime/chat-transport';

export function domainLabelFallback(domain: string) {
  return domain.replaceAll('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export function collectCapabilities(
  registrations: Map<AiDomainKey, { capabilities: AiCapabilityUI[] }>,
): AiCapabilityUI[] {
  const all: AiCapabilityUI[] = [];
  for (const r of registrations.values()) {
    all.push(...r.capabilities);
  }
  return all;
}

export function pickCapability(
  caps: AiCapabilityUI[],
  input: string,
): AiCapabilityUI | null {
  if (caps.length === 0) return null;
  const scored = caps
    .map((c) => {
      const score = c.match ? c.match(input) : 0;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.c ?? caps[0] ?? null;
}

export function messageSignature(
  messages: Array<{
    id: string;
    role: string;
    text: string;
    meta?: { domain?: string; capabilityId?: string };
  }>,
): string {
  return messages
    .map((message) => {
      const domain = message.meta?.domain ?? '';
      const capabilityId = message.meta?.capabilityId ?? '';
      return `${message.id}:${message.role}:${domain}:${capabilityId}:${message.text}`;
    })
    .join('||');
}

function newAssistantMessageId(): string {
  return `assistant-${crypto.randomUUID()}`;
}

export function createSessionNotReadyMessage(input: {
  domain: AiDomainKey;
  capabilityId: string;
}) {
  return {
    id: newAssistantMessageId(),
    role: 'assistant' as const,
    text: AI_SESSION_NOT_READY_MESSAGE,
    timestamp: Date.now(),
    meta: {
      domain: input.domain,
      capabilityId: input.capabilityId,
    },
  };
}

export function getEmptyStateMessage(input: {
  hasFilteredView: boolean;
  hasCapabilities: boolean;
}): string {
  if (input.hasFilteredView) {
    return 'No messages in this domain view yet.';
  }
  if (!input.hasCapabilities) {
    return 'No AI capabilities available on this page.';
  }
  return 'What can I help with?';
}

export function getMessageAttribution(
  role: 'user' | 'assistant',
  domainLabel: string | null,
): string {
  if (role === 'user') {
    return domainLabel ? `${domainLabel} • You` : 'You';
  }
  return domainLabel ? `Rho • ${domainLabel}` : 'Rho';
}

export function getFloatingWrapperPlacementClass(
  launcherPlacement: 'bottom-center' | 'bottom-right',
  isExpanded: boolean,
): string {
  if (launcherPlacement === 'bottom-center') {
    return cn(
      'sm:mx-auto sm:w-fit sm:justify-start sm:px-0',
      isExpanded ? 'sm:pl-[32px]' : '',
    );
  }
  return cn(
    'sm:inset-x-auto sm:right-6 sm:justify-start sm:px-0',
    isExpanded ? 'sm:flex-row-reverse' : '',
  );
}

export function getDraggableInnerPlacementClass(
  launcherPlacement: 'bottom-center' | 'bottom-right',
  isExpanded: boolean,
): string {
  if (launcherPlacement === 'bottom-center') {
    return isExpanded ? 'sm:pl-[32px]' : '';
  }
  return isExpanded ? 'sm:flex-row-reverse' : '';
}

export const SUGGESTION_MASK_STYLE = {
  maskImage:
    'linear-gradient(to right, black calc(100% - 1.5rem), transparent)',
  WebkitMaskImage:
    'linear-gradient(to right, black calc(100% - 1.5rem), transparent)',
} as const;
