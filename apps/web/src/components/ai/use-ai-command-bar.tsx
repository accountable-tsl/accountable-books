import type { AiDomainKey } from '@/modules/ai/keys';
import type { AiMessageMetadata } from '@/modules/ai/runtime/message-mappers';
import type { AiCapabilityUI } from '@/modules/ai/runtime/types';
import type { KeyboardEventHandler, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createAiChatTransport,
  getAiChatApi,
  INVALID_AI_CHAT_API,
} from '@/modules/ai/runtime/chat-transport';
import {
  toAiMessages,
  toUiMessages,
} from '@/modules/ai/runtime/message-mappers';
import { aiRuntimeStore } from '@/modules/ai/runtime/store';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { useChat } from '@ai-sdk/react';
import { z } from 'zod';

import {
  collectCapabilities,
  createSessionNotReadyMessage,
  domainLabelFallback,
  messageSignature,
  pickCapability,
} from './ai-command-bar.utils';

const aiMessageMetadataSchema = z
  .object({
    domain: z.string().min(1).optional(),
    capabilityId: z.string().min(1).optional(),
    source: z.literal('inline').optional(),
  })
  .optional();

export function useAiCommandBar() {
  const policy = aiRuntimeStore((s) => s.policy);
  const ctx = aiRuntimeStore((s) => s.ctx);
  const surfaceMode = aiRuntimeStore((s) => s.surfaceMode);
  const dockSide = aiRuntimeStore((s) => s.dockSide);
  const dockWidthPx = aiRuntimeStore((s) => s.dockWidthPx);
  const launcherPlacement = aiRuntimeStore((s) => s.launcherPlacement);
  const setLauncherPlacement = aiRuntimeStore((s) => s.setLauncherPlacement);
  const input = aiRuntimeStore((s) => s.input);
  const setInput = aiRuntimeStore((s) => s.setInput);
  const close = aiRuntimeStore((s) => s.close);
  const dock = aiRuntimeStore((s) => s.dock);
  const undock = aiRuntimeStore((s) => s.undock);
  const open = aiRuntimeStore((s) => s.open);
  const registrations = aiRuntimeStore((s) => s.registrations);
  const activeDomain = aiRuntimeStore((s) => s.activeDomain);
  const setActiveDomain = aiRuntimeStore((s) => s.setActiveDomain);
  const isDomainEnabled = aiRuntimeStore((s) => s.isDomainEnabled);
  const isCapabilityEnabled = aiRuntimeStore((s) => s.isCapabilityEnabled);
  const requestNewThread = aiRuntimeStore((s) => s.requestNewThread);
  const pendingConfirm = aiRuntimeStore((s) => s.pendingConfirm);
  const confirmPending = aiRuntimeStore((s) => s.confirmPending);
  const ensureActiveThread = aiRuntimeStore((s) => s.ensureActiveThread);
  const threads = aiRuntimeStore((s) => s.threads);
  const activeThreadId = aiRuntimeStore((s) => s.activeThreadId);
  const messageDomainFilter = aiRuntimeStore((s) => s.messageDomainFilter);
  const setMessageDomainFilter = aiRuntimeStore(
    (s) => s.setMessageDomainFilter,
  );
  const setThreadMessages = aiRuntimeStore((s) => s.setThreadMessages);
  const appendMessageToThread = aiRuntimeStore((s) => s.appendMessageToThread);

  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draggableNodeRef = useRef<HTMLDivElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const lastRunMetaRef = useRef<AiMessageMetadata | null>(null);
  const lastPatchedAssistantIdRef = useRef<string | null>(null);
  const [dragPositionX, setDragPositionX] = useState(0);
  const [isDraggingFloating, setIsDraggingFloating] = useState(false);

  const chatApi = ctx?.companyId
    ? getAiChatApi({ companyId: ctx.companyId })
    : '';

  const chatTransport = useMemo(() => {
    return createAiChatTransport(chatApi || INVALID_AI_CHAT_API);
  }, [chatApi]);

  const enabledRegistrations = useMemo(() => {
    const next = new Map(registrations);
    for (const domain of next.keys()) {
      if (!isDomainEnabled(domain)) next.delete(domain);
    }
    return next;
  }, [registrations, isDomainEnabled]);

  const domains = useMemo(() => {
    return Array.from(enabledRegistrations.values()).map((r) => ({
      domain: r.domain,
      label: r.domainLabel || domainLabelFallback(r.domain),
      count: r.capabilities.length,
    }));
  }, [enabledRegistrations]);

  const capabilities = useMemo(() => {
    const caps = activeDomain
      ? (enabledRegistrations.get(activeDomain)?.capabilities ?? [])
      : collectCapabilities(enabledRegistrations);
    return caps.filter((c) => isCapabilityEnabled(c.capabilityId));
  }, [enabledRegistrations, activeDomain, isCapabilityEnabled]);

  const activeThread = threads[activeThreadId];
  const enabledDomains = useMemo(
    () => Array.from(enabledRegistrations.keys()),
    [enabledRegistrations],
  );
  const inferredContextDomain: AiDomainKey | undefined =
    enabledDomains.length === 1
      ? enabledDomains[0]
      : (activeDomain ?? undefined);

  const initialChatMessages = useMemo(() => {
    return toUiMessages(activeThread?.messages ?? []);
    // Only re-seed when the thread id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keep chat state stable within a thread
  }, [activeThreadId]);

  const chat = useChat({
    id: activeThreadId,
    transport: chatTransport as any,
    messages: initialChatMessages as any,
    messageMetadataSchema: aiMessageMetadataSchema as any,
    onFinish: ({ messages }: any) => {
      setThreadMessages(activeThreadId, toAiMessages(messages ?? []));
    },
  });

  const isLoading = chat.status === 'submitted' || chat.status === 'streaming';
  const chatMessages = chat.messages;
  const chatStatus = chat.status;
  const chatSetMessages = chat.setMessages;

  useEffect(() => {
    if (isLoading) return;

    const storeMessages = activeThread?.messages ?? [];
    const chatAsAiMessages = toAiMessages((chatMessages ?? []) as any);
    if (
      messageSignature(storeMessages) === messageSignature(chatAsAiMessages)
    ) {
      return;
    }

    chatSetMessages(toUiMessages(storeMessages) as any);
  }, [activeThread, chatMessages, chatSetMessages, isLoading]);

  useEffect(() => {
    const meta = lastRunMetaRef.current;
    if (!meta?.domain && !meta?.capabilityId) return;

    const lastAssistant = [...(chatMessages ?? [])]
      .reverse()
      .find((m: any) => m.role === 'assistant');
    if (!lastAssistant) return;
    const id = String((lastAssistant as any).id);
    if (lastPatchedAssistantIdRef.current === id) return;

    const current = (lastAssistant as any).metadata as
      | AiMessageMetadata
      | undefined;
    if (current?.domain || current?.capabilityId) {
      lastPatchedAssistantIdRef.current = id;
      return;
    }

    chatSetMessages((msgs: any[]) =>
      msgs.map((m: any) =>
        String(m.id) === id
          ? { ...m, metadata: { ...m.metadata, ...meta } }
          : m,
      ),
    );
    lastPatchedAssistantIdRef.current = id;
  }, [chatMessages, chatStatus, chatSetMessages]);

  useEffect(() => {
    if (surfaceMode === 'floating' || surfaceMode === 'docked') {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [surfaceMode]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  useEffect(() => {
    if (surfaceMode === 'docked') setDragPositionX(0);
  }, [surfaceMode]);

  const visible = surfaceMode === 'floating' || surfaceMode === 'docked';

  const hasAnyEnabledCapabilities =
    policy.globalEnabled &&
    collectCapabilities(enabledRegistrations).some((c) =>
      isCapabilityEnabled(c.capabilityId),
    );

  const messages = useMemo(() => {
    return toAiMessages((chat.messages ?? []) as any);
  }, [chat.messages]);

  const messageDomains = useMemo(() => {
    const set = new Set<AiDomainKey>();
    for (const m of messages) {
      if (m.meta?.domain) set.add(m.meta.domain);
    }
    for (const d of enabledDomains) set.add(d);
    return Array.from(set);
  }, [messages, enabledDomains]);

  const visibleMessages = useMemo(() => {
    if (!messageDomainFilter) return messages;
    return messages.filter((m) => m.meta?.domain === messageDomainFilter);
  }, [messages, messageDomainFilter]);

  const isExpanded = messages.length > 0;

  const sendCapabilityMessage = useCallback(
    async (cap: AiCapabilityUI, text: string) => {
      if (!ctx?.companyId) return;
      const threadId = await ensureActiveThread();
      if (!threadId) return;

      lastRunMetaRef.current = {
        domain: cap.domain,
        capabilityId: cap.capabilityId,
      };

      try {
        await chat.sendMessage(
          {
            text,
            metadata: { domain: cap.domain, capabilityId: cap.capabilityId },
          },
          {
            body: {
              threadId,
              source: 'sidebar',
              capabilityId: cap.capabilityId,
              domain: cap.domain,
            },
          },
        );
      } catch {
        appendMessageToThread(
          threadId,
          createSessionNotReadyMessage({
            domain: cap.domain,
            capabilityId: cap.capabilityId,
          }),
        );
      }
    },
    [appendMessageToThread, chat, ctx?.companyId, ensureActiveThread],
  );

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading || isComposing) return;
    if (capabilities.length === 0) return;
    if (!ctx?.companyId) return;

    const threadId = await ensureActiveThread();
    if (!threadId) return;

    const relevant = pickCapability(capabilities, text);
    if (!relevant) return;

    setInput('');
    lastRunMetaRef.current = {
      domain: relevant.domain,
      capabilityId: relevant.capabilityId,
    };

    try {
      await chat.sendMessage(
        {
          text,
          metadata: {
            domain: inferredContextDomain ?? relevant.domain,
            capabilityId: relevant.capabilityId,
          },
        },
        {
          body: {
            threadId,
            source: 'sidebar',
            capabilityId: relevant.capabilityId,
            domain: relevant.domain,
          },
        },
      );
    } catch {
      appendMessageToThread(
        threadId,
        createSessionNotReadyMessage({
          domain: relevant.domain,
          capabilityId: relevant.capabilityId,
        }),
      );
    }
  }, [
    appendMessageToThread,
    capabilities,
    chat,
    ctx?.companyId,
    ensureActiveThread,
    inferredContextDomain,
    input,
    isComposing,
    isLoading,
    setInput,
  ]);

  const handleSuggestionClick = useCallback(
    (cap: AiCapabilityUI) => {
      void sendCapabilityMessage(cap, cap.label);
    },
    [sendCapabilityMessage],
  );

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    },
    [close, handleSubmit],
  );

  const handleFloatingDragStart = useCallback(() => {
    setIsDraggingFloating(true);
  }, []);

  const handleFloatingDrag = useCallback(
    (_e: unknown, data: { x: number; y: number }) => {
      setDragPositionX(data.x);
    },
    [],
  );

  const handleFloatingDragStop = useCallback(
    (_e: unknown, data: { node: HTMLElement; x: number; y: number }) => {
      setIsDraggingFloating(false);
      const rect = data.node.getBoundingClientRect();
      const dockThreshold = 120;
      if (rect.right >= window.innerWidth - dockThreshold) {
        dock('right');
        setDragPositionX(0);
      } else {
        setDragPositionX(data.x);
      }
    },
    [dock],
  );

  const getDomainLabel = useCallback(
    (domain?: AiDomainKey) => {
      if (!domain) return null;
      return (
        enabledRegistrations.get(domain)?.domainLabel ??
        domainLabelFallback(domain)
      );
    },
    [enabledRegistrations],
  );

  return {
    activeDomain,
    capabilities,
    close,
    confirmPending,
    dock,
    dockSide,
    dockWidthPx,
    domains,
    dragPositionX,
    draggableNodeRef,
    enabledRegistrations,
    getDomainLabel,
    handleFloatingDrag,
    handleFloatingDragStart,
    handleFloatingDragStop,
    handleKeyDown,
    handleSubmit,
    handleSuggestionClick,
    hasAnyEnabledCapabilities,
    input,
    isComposing,
    isDesktop,
    isDraggingFloating,
    isExpanded,
    isLoading,
    launcherPlacement,
    messageDomainFilter,
    messageDomains,
    messages,
    open,
    pendingConfirm,
    requestNewThread,
    setActiveDomain,
    setInput,
    setIsComposing,
    setLauncherPlacement,
    setMessageDomainFilter,
    surfaceMode,
    textareaRef: textareaRef as RefObject<HTMLTextAreaElement | null>,
    undock,
    visible,
    visibleMessages,
  };
}
