import type { AiCapabilityUI, AiDomainKey, AiMessage } from '@/modules/ai';
import type { UIMessage } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { aiRuntimeStore } from '@/modules/ai';
import { authStore } from '@/modules/auth';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
  AlignCenter,
  AlignRight,
  ArrowUp,
  Loader,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  MoreVertical,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Draggable from 'react-draggable';
import { z } from 'zod';

function domainLabelFallback(domain: string) {
  return domain.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function collectCapabilities(
  registrations: Map<AiDomainKey, { capabilities: AiCapabilityUI[] }>,
): AiCapabilityUI[] {
  const all: AiCapabilityUI[] = [];
  for (const r of registrations.values()) {
    all.push(...r.capabilities);
  }
  return all;
}

function pickCapability(
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

// Smooth deceleration for open, slightly faster for close
const ENTER_TRANSITION = { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const };
const EXIT_TRANSITION = { duration: 0.15, ease: [0.4, 0, 1, 1] as const };

const PANEL_BASE =
  'bg-background/90 flex flex-col overflow-hidden rounded-xl border border-white/15 shadow-lg backdrop-blur-md';

const SUGGESTION_CHIP =
  'shrink-0 rounded-xl border border-border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md transition-colors hover:bg-background hover:text-foreground';

const COMPACT_ACTION_BTN =
  'flex size-7 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground backdrop-blur-md transition-colors hover:bg-background hover:text-foreground';

const aiMessageMetadataSchema = z
  .object({
    domain: z.string().min(1).optional(),
    capabilityId: z.string().min(1).optional(),
  })
  .optional();
type AiMessageMetadata = z.infer<typeof aiMessageMetadataSchema>;

function uiMessageText(parts: any[]): string {
  // AI SDK UIMessage parts are unions; we only need text for current UI.
  return (parts ?? [])
    .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
}

function toUiMessages(seed: AiMessage[]): UIMessage[] {
  return seed.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: 'text', text: m.text }],
    metadata: m.meta
      ? {
          domain: m.meta.domain,
          capabilityId: m.meta.capabilityId,
        }
      : undefined,
  }));
}

function toAiMessages(ui: UIMessage[]): AiMessage[] {
  return (ui ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const text = uiMessageText((m as any).parts ?? []);
      const meta = (m as any).metadata as AiMessageMetadata | undefined;
      const createdAt = (m as any).createdAt;
      const timestamp =
        createdAt instanceof Date
          ? createdAt.getTime()
          : typeof createdAt === 'string' || typeof createdAt === 'number'
            ? new Date(createdAt).getTime()
            : Date.now();
      return {
        id: String((m as any).id),
        role: m.role as 'user' | 'assistant',
        text,
        timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
        meta: meta
          ? {
              domain: meta.domain as AiDomainKey | undefined,
              capabilityId: meta.capabilityId,
            }
          : undefined,
      };
    })
    .filter((m) => m.text.trim().length > 0);
}

export function AiCommandBar() {
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
  const threads = aiRuntimeStore((s) => s.threads);
  const activeThreadId = aiRuntimeStore((s) => s.activeThreadId);
  const messageDomainFilter = aiRuntimeStore((s) => s.messageDomainFilter);
  const setMessageDomainFilter = aiRuntimeStore(
    (s) => s.setMessageDomainFilter,
  );
  const setThreadMessages = aiRuntimeStore((s) => s.setThreadMessages);

  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draggableNodeRef = useRef<HTMLDivElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const lastRunMetaRef = useRef<AiMessageMetadata | null>(null);
  const lastPatchedAssistantIdRef = useRef<string | null>(null);

  const backendBaseUrl = String(import.meta.env.VITE_BACKEND_URL || '').replace(
    /\/$/,
    '',
  );
  const chatApi =
    ctx?.companyId && backendBaseUrl
      ? `${backendBaseUrl}/api/${ctx.companyId}/ai/chat`
      : '';

  const chatTransport = useMemo(() => {
    // DefaultChatTransport uses fetch under the hood, but handles the AI SDK stream protocol.
    // We use prepareSendMessagesRequest to attach CSRF on every request.
    return new DefaultChatTransport({
      api: chatApi || '/api/invalid-ai-chat',
      credentials: 'include',
      prepareSendMessagesRequest: ({ options }: any) => {
        const csrfToken = authStore.getState().csrfToken;
        const headers: Record<string, string> = {
          ...(options.headers ?? {}),
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        };
        return {
          ...options,
          api: chatApi || options.api,
          credentials: 'include',
          headers,
        };
      },
    });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  const chat = useChat({
    id: activeThreadId,
    transport: chatTransport as any,
    messages: initialChatMessages as any,
    messageMetadataSchema: aiMessageMetadataSchema as any,
    onFinish: ({ messages }: any) => {
      // Persist the final transcript for this thread.
      setThreadMessages(activeThreadId, toAiMessages(messages ?? []));
    },
  });

  const isLoading = chat.status === 'submitted' || chat.status === 'streaming';
  const chatMessages = chat.messages;
  const chatStatus = chat.status;
  const chatSetMessages = chat.setMessages;

  // Backend doesn't attach per-message domain metadata yet; patch assistant messages
  // client-side so filtering and labels remain usable.
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
          ? { ...m, metadata: { ...(m.metadata ?? {}), ...meta } }
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

  const visible = surfaceMode === 'floating' || surfaceMode === 'docked';

  const hasAnyEnabledCapabilities =
    policy.globalEnabled &&
    collectCapabilities(enabledRegistrations).some((c) =>
      isCapabilityEnabled(c.capabilityId),
    );

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isLoading || isComposing) return;

    const caps = capabilities;
    if (caps.length === 0) return;

    if (!ctx?.companyId) return;

    const relevant = pickCapability(caps, text);
    if (!relevant) return;

    setInput('');
    lastRunMetaRef.current = {
      domain: relevant.domain,
      capabilityId: relevant.capabilityId,
    };
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
          capabilityId: relevant.capabilityId,
          domain: relevant.domain,
        },
      },
    );
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (
    e,
  ) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  // ── Shared panel inner content ──────────────────────────────────────
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

  const [dragPositionX, setDragPositionX] = useState(0);
  const [isDraggingFloating, setIsDraggingFloating] = useState(false);

  useEffect(() => {
    if (surfaceMode === 'docked') setDragPositionX(0);
  }, [surfaceMode]);

  const handleFloatingDrag = (_e: unknown, data: { x: number; y: number }) => {
    // Draggable is controlled (we pass `position`), so keep state in sync while dragging.
    setDragPositionX(data.x);
  };

  const handleFloatingDragStop = (
    _e: unknown,
    data: { node: HTMLElement; x: number; y: number },
  ) => {
    setIsDraggingFloating(false);
    const rect = data.node.getBoundingClientRect();
    const dockThreshold = 120;
    if (rect.right >= window.innerWidth - dockThreshold) {
      dock('right');
      setDragPositionX(0);
    } else {
      setDragPositionX(data.x);
    }
  };

  if (!hasAnyEnabledCapabilities) return null;

  const handleSuggestionClick = (cap: AiCapabilityUI) => {
    if (!ctx?.companyId) return;
    lastRunMetaRef.current = {
      domain: cap.domain,
      capabilityId: cap.capabilityId,
    };
    void chat.sendMessage(
      {
        text: cap.label,
        metadata: { domain: cap.domain, capabilityId: cap.capabilityId },
      },
      { body: { capabilityId: cap.capabilityId, domain: cap.domain } },
    );
  };

  const persistentSuggestions = capabilities.length > 0 &&
    messages.length > 0 && (
      <div className="px-4 pt-2 pb-1">
        <div
          className="no-scrollbar overflow-x-auto"
          style={{
            maskImage:
              'linear-gradient(to right, black calc(100% - 1.5rem), transparent)',
            WebkitMaskImage:
              'linear-gradient(to right, black calc(100% - 1.5rem), transparent)',
          }}
        >
          <div className="flex gap-1.5">
            {capabilities.slice(0, 6).map((cap) => (
              <button
                key={cap.capabilityId}
                type="button"
                className={SUGGESTION_CHIP}
                onClick={() => handleSuggestionClick(cap)}
                title={cap.description}
              >
                {cap.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );

  const contentArea = (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        {visibleMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="text-muted-foreground max-w-[80%] text-sm">
              {messages.length > 0 && messageDomainFilter
                ? 'No messages in this domain view yet.'
                : capabilities.length === 0
                  ? 'No AI capabilities available on this page.'
                  : 'What can I help with?'}
            </div>
          </div>
        ) : (
          visibleMessages.map((m) => {
            const domainLabel = m.meta?.domain
              ? (enabledRegistrations.get(m.meta.domain)?.domainLabel ??
                domainLabelFallback(m.meta.domain))
              : null;

            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
                key={m.id}
                className={cn(
                  'mb-4 last:mb-0',
                  m.role === 'user' ? 'ml-8' : 'mr-8',
                )}
              >
                <div
                  className={cn(
                    'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'bg-primary/85 dark:bg-primary/50 text-white shadow-md'
                      : 'bg-muted text-foreground',
                  )}
                >
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
                <div
                  className={cn(
                    'text-muted-foreground mt-1 text-[10px]',
                    m.role === 'user' ? 'text-right' : 'text-left',
                  )}
                >
                  {m.role === 'user'
                    ? domainLabel
                      ? `${domainLabel} • You`
                      : 'You'
                    : domainLabel
                      ? `Rho • ${domainLabel}`
                      : 'Rho'}
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Suggestions */}
      {capabilities.length > 0 && messages.length === 0 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-2">
            {capabilities.slice(0, 6).map((cap) => (
              <button
                key={cap.capabilityId}
                type="button"
                className={SUGGESTION_CHIP}
                onClick={() => handleSuggestionClick(cap)}
                title={cap.description}
              >
                {cap.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const inputArea = (hintText: string) => (
    <div className="bg-muted/20 border-white/10 px-4 py-3">
      <div className="bg-background/50 relative rounded-xl border border-white/10 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onPointerDownCapture={(e) => e.stopPropagation()}
          className="placeholder:text-muted-foreground/60 w-full resize-none bg-transparent px-3 py-2 pr-10 text-sm outline-none"
          placeholder="What would you like to do?"
          rows={1}
        />
        <div className="absolute right-2 bottom-2">
          <Button
            type="button"
            size="icon"
            className="h-7 w-7 rounded-lg shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void handleSubmit()}
            title="Send"
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <Loader className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </div>
      </div>
      <div className="text-muted-foreground/50 mt-1 px-1 text-[10px]">
        {hintText}
      </div>
    </div>
  );

  const domainChips = (
    <div className="bg-muted/20 flex flex-wrap items-center gap-1.5 border-b border-white/10 px-4 py-2">
      <div className="from-primary dark:from-primary/10 mr-1 flex h-6 w-6 items-center justify-center rounded-full bg-linear-to-tr to-blue-500 text-[10px] font-bold text-white shadow-sm">
        <Loader className="size-3" />
      </div>
      <button
        type="button"
        className={cn(
          'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
          activeDomain === null
            ? 'border-blue-500/50 bg-blue-500/10 text-blue-500'
            : 'text-muted-foreground hover:bg-muted/50 border-transparent bg-transparent',
        )}
        onClick={() => {
          setActiveDomain(null);
          setMessageDomainFilter(null);
        }}
      >
        All
      </button>
      {domains.map((d) => (
        <button
          key={d.domain}
          type="button"
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
            activeDomain === d.domain
              ? 'border-blue-500/50 bg-blue-500/10 text-blue-500'
              : 'text-muted-foreground hover:bg-muted/50 border-transparent bg-transparent',
          )}
          onClick={() => {
            setActiveDomain(d.domain);
            setMessageDomainFilter(d.domain);
          }}
          title={`${d.count} capabilities`}
        >
          {d.label}
        </button>
      ))}
      {/* Mobile: close & new chat (sidebar hidden on small screens) */}
      {surfaceMode === 'floating' && (
        <div className="ml-auto flex items-center gap-1 sm:hidden">
          <button
            type="button"
            onClick={() => requestNewThread()}
            className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
            title="New chat"
          >
            <MessageSquarePlus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => close()}
            className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
            title="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="pointer-events-none fixed inset-0 z-60">
      {/* Dock zone hint when dragging floating panel toward right */}
      {surfaceMode === 'floating' && isDraggingFloating && (
        <div className="pointer-events-none fixed top-0 right-0 bottom-0 z-50 flex w-24 items-center justify-center bg-blue-500/5 transition-opacity">
          <span className="text-muted-foreground text-xs font-medium">
            Drop to dock
          </span>
        </div>
      )}
      {/* ── Floating panel + actions (flex siblings, no calc()) ───── */}
      <AnimatePresence>
        {surfaceMode === 'floating' && (
          <motion.div
            key="floating-wrapper"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16, transition: EXIT_TRANSITION }}
            transition={ENTER_TRANSITION}
            className={cn(
              'pointer-events-auto absolute bottom-5.5 flex gap-2',
              'inset-x-0 justify-center px-2',
              launcherPlacement === 'bottom-center'
                ? cn(
                    'sm:mx-auto sm:w-fit sm:justify-start sm:px-0',
                    isExpanded ? 'sm:pl-[32px]' : '',
                  )
                : cn(
                    'sm:inset-x-auto sm:right-6 sm:justify-start sm:px-0',
                    isExpanded ? 'sm:flex-row-reverse' : '',
                  ),
            )}
          >
            <Draggable
              axis="x"
              position={{ x: dragPositionX, y: 0 }}
              onStart={() => setIsDraggingFloating(true)}
              onDrag={handleFloatingDrag}
              onStop={handleFloatingDragStop}
              handle=".ai-floating-drag-handle"
              nodeRef={draggableNodeRef}
              disabled={!isDesktop}
            >
              <div
                ref={draggableNodeRef}
                className={cn(
                  'flex w-fit gap-2',
                  launcherPlacement === 'bottom-center'
                    ? isExpanded
                      ? 'sm:pl-[32px]'
                      : ''
                    : isExpanded
                      ? 'sm:flex-row-reverse'
                      : '',
                )}
              >
                <div className="relative">
                  {/* Colab-style: drag from right edge only */}
                  {isDesktop && (
                    <div
                      className="ai-floating-drag-handle absolute top-0 right-0 z-10 h-full w-5 cursor-grab active:cursor-grabbing"
                      title="Drag to move or drag to right edge to dock"
                    />
                  )}
                  {/* Panel */}
                  <div
                    className={cn(
                      'flex flex-col overflow-hidden',
                      isExpanded
                        ? cn(
                            PANEL_BASE,
                            'max-h-[min(600px,50vh)] w-[min(520px,calc(100vw-3rem))]',
                          )
                        : 'w-[min(550px,calc(100vw-2rem))]',
                    )}
                  >
                    {/* Expanded: domain chips */}
                    {isExpanded && domainChips}

                    {/* Expanded: message history */}
                    {isExpanded && messages.length > 0 && contentArea}

                    {/* Compact: horizontal suggestions + inline actions */}
                    {!isExpanded && (
                      <div className="mb-2 flex items-center gap-2">
                        {capabilities.length > 0 && (
                          <div
                            className="no-scrollbar min-w-0 flex-1 overflow-x-auto"
                            style={{
                              maskImage:
                                'linear-gradient(to right, black calc(100% - 1.5rem), transparent)',
                              WebkitMaskImage:
                                'linear-gradient(to right, black calc(100% - 1.5rem), transparent)',
                            }}
                          >
                            <div className="flex gap-2">
                              {capabilities.slice(0, 6).map((cap) => (
                                <button
                                  key={cap.capabilityId}
                                  type="button"
                                  className={SUGGESTION_CHIP}
                                  onClick={() => handleSuggestionClick(cap)}
                                  title={cap.description}
                                >
                                  {cap.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Inline action buttons */}
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => close()}
                            className={COMPACT_ACTION_BTN}
                            title="Close"
                          >
                            <X className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => dock('right')}
                            className={cn(COMPACT_ACTION_BTN, 'hidden sm:flex')}
                            title="Dock to side"
                          >
                            <Maximize2 className="size-3" />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className={COMPACT_ACTION_BTN}
                                title="More actions"
                              >
                                <MoreVertical className="size-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              sideOffset={10}
                              className="z-150 w-48"
                            >
                              <DropdownMenuItem
                                onClick={() => requestNewThread()}
                              >
                                <MessageSquarePlus className="mr-2 h-4 w-4" />
                                New Chat
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <div className="text-muted-foreground flex flex-col gap-1 px-2 py-1.5 text-xs">
                                <div className="text-[10px] uppercase">
                                  Launcher
                                </div>
                                <div className="flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLauncherPlacement('bottom-center')
                                    }
                                    className={cn(
                                      'flex flex-1 items-center gap-1 rounded-sm p-1 px-2 transition-colors',
                                      launcherPlacement === 'bottom-center'
                                        ? 'bg-blue-500/10 text-blue-500'
                                        : 'bg-muted hover:bg-muted/80',
                                    )}
                                  >
                                    <AlignCenter className="size-3" />
                                    <span>Center</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLauncherPlacement('bottom-right')
                                    }
                                    className={cn(
                                      'flex flex-1 items-center gap-1 rounded-sm p-1 px-2 transition-colors',
                                      launcherPlacement === 'bottom-right'
                                        ? 'bg-blue-500/10 text-blue-500'
                                        : 'bg-muted hover:bg-muted/80',
                                    )}
                                  >
                                    <AlignRight className="size-3" />
                                    <span>Right</span>
                                  </button>
                                </div>
                              </div>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    )}

                    {/* Suggestions above input */}
                    {persistentSuggestions}

                    {/* Input area */}
                    <div
                      className={cn(
                        'flex flex-col bg-inherit px-4 py-3',
                        isExpanded ? '' : 'p-0',
                      )}
                    >
                      <div
                        className={cn(
                          'flex flex-col',
                          isExpanded
                            ? 'bg-muted/20 border-white/10'
                            : 'bg-inherit p-0',
                        )}
                      >
                        <div
                          className={cn(
                            'relative flex w-full rounded-xl border shadow-sm',
                            isExpanded
                              ? 'bg-background/50'
                              : 'bg-background/90 border-border shadow-lg backdrop-blur-xl dark:border-white/10!',
                          )}
                        >
                          <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onCompositionStart={() => setIsComposing(true)}
                            onCompositionEnd={() => setIsComposing(false)}
                            className={cn(
                              'placeholder:text-muted-foreground/60 w-full resize-none bg-transparent px-3 py-2 pr-10 text-sm outline-none',
                            )}
                            placeholder="What would you like to do?"
                            rows={1}
                            maxLength={2000}
                          />
                          <div
                            className={cn(
                              'absolute',
                              'top-1/2 right-2 -translate-y-1/2',
                            )}
                          >
                            <Button
                              type="button"
                              size="icon"
                              className="h-7 w-7 cursor-pointer rounded-lg shadow-sm"
                              onClick={() => void handleSubmit()}
                              title="Send"
                              disabled={!input.trim() || isLoading}
                            >
                              {isLoading ? (
                                <Loader className="size-4 animate-spin" />
                              ) : (
                                <ArrowUp className="size-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="text-muted-foreground/50 mt-1 px-1 text-[10px]">
                          ⌘K to toggle
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions sidebar — only in expanded mode, desktop only */}
                {isExpanded && (
                  <div className="hidden flex-col gap-2 sm:flex">
                    <button
                      type="button"
                      onClick={() => close()}
                      className="group bg-background/90 hover:bg-background flex size-8 items-center justify-center rounded-full border border-white/10 shadow-sm backdrop-blur-md transition-colors dark:bg-black/80"
                      title="Close"
                    >
                      <X className="text-muted-foreground group-hover:text-foreground size-3" />
                    </button>

                    <button
                      type="button"
                      onClick={() => dock('right')}
                      className="group bg-background/90 hover:bg-background flex size-8 items-center justify-center rounded-full border border-white/10 shadow-sm backdrop-blur-md transition-colors dark:bg-black/80"
                      title="Dock to side"
                    >
                      <Maximize2 className="text-muted-foreground group-hover:text-foreground size-3" />
                    </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="group bg-background/90 hover:bg-background flex size-8 items-center justify-center rounded-full border border-white/10 shadow-sm backdrop-blur-md transition-colors dark:bg-black/80"
                          title="More actions"
                        >
                          <MoreVertical className="text-muted-foreground group-hover:text-foreground size-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        side={
                          launcherPlacement === 'bottom-right'
                            ? 'left'
                            : 'right'
                        }
                        sideOffset={10}
                        className="z-150 w-48"
                      >
                        <DropdownMenuItem onClick={() => requestNewThread()}>
                          <MessageSquarePlus className="mr-2 h-4 w-4" />
                          New Chat
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />
                        <div className="text-muted-foreground flex flex-col gap-1 px-2 py-1.5 text-xs">
                          <div className="text-[10px] uppercase">Launcher</div>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setLauncherPlacement('bottom-center')
                              }
                              className={cn(
                                'flex flex-1 items-center gap-1 rounded-sm p-1 px-2 transition-colors',
                                launcherPlacement === 'bottom-center'
                                  ? 'bg-blue-500/10 text-blue-500'
                                  : 'bg-muted hover:bg-muted/80',
                              )}
                            >
                              <AlignCenter className="size-3" />
                              <span>Center</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setLauncherPlacement('bottom-right')
                              }
                              className={cn(
                                'flex flex-1 items-center gap-1 rounded-sm p-1 px-2 transition-colors',
                                launcherPlacement === 'bottom-right'
                                  ? 'bg-blue-500/10 text-blue-500'
                                  : 'bg-muted hover:bg-muted/80',
                              )}
                            >
                              <AlignRight className="size-3" />
                              <span>Right</span>
                            </button>
                          </div>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </Draggable>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Docked panel ───────────────────────────────────────────── */}
      <AnimatePresence>
        {surfaceMode === 'docked' && (
          <motion.div
            key="docked-panel"
            initial={{ opacity: 0, x: dockSide === 'right' ? 30 : -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{
              opacity: 0,
              x: dockSide === 'right' ? 30 : -30,
              transition: EXIT_TRANSITION,
            }}
            transition={ENTER_TRANSITION}
            className={cn(
              PANEL_BASE,
              'pointer-events-auto absolute top-16 bottom-4',
              // Mobile: near full width
              'right-2 left-2',
              // Desktop: fixed width on dock side
              'sm:w-(--dock-w)',
              dockSide === 'right'
                ? 'sm:right-4 sm:left-auto'
                : 'sm:right-auto sm:left-4',
            )}
            style={{ '--dock-w': `${dockWidthPx}px` } as React.CSSProperties}
          >
            {/* Docked header */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-linear-to-tr from-blue-600 to-cyan-500 text-white shadow-sm">
                  <Loader className="size-3" />
                </div>
                <span className="text-foreground text-sm font-medium">
                  {activeDomain
                    ? (enabledRegistrations.get(activeDomain)?.domainLabel ??
                      domainLabelFallback(activeDomain))
                    : 'All'}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground h-7 w-7"
                  onClick={() => requestNewThread()}
                  title="New chat"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground h-7 w-7"
                  onClick={() => undock()}
                  title="Floating mode"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground h-7 w-7"
                      title="More"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={10}
                    className="z-150 w-56"
                  >
                    <DropdownMenuLabel>Messages</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                      checked={!messageDomainFilter}
                      onCheckedChange={(checked) => {
                        if (checked) setMessageDomainFilter(null);
                      }}
                    >
                      All domains
                    </DropdownMenuCheckboxItem>
                    {messageDomains.map((d) => (
                      <DropdownMenuCheckboxItem
                        key={d}
                        checked={messageDomainFilter === d}
                        onCheckedChange={(checked) =>
                          setMessageDomainFilter(checked ? d : null)
                        }
                      >
                        {enabledRegistrations.get(d)?.domainLabel ??
                          domainLabelFallback(d)}
                      </DropdownMenuCheckboxItem>
                    ))}

                    <DropdownMenuSeparator />
                    <div className="text-muted-foreground flex flex-col gap-1 px-2 py-1.5 text-xs">
                      <div className="text-[10px] uppercase">Launcher</div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLauncherPlacement('bottom-center')}
                          className={cn(
                            'flex flex-1 items-center gap-1 rounded-sm p-1 px-2 transition-colors',
                            launcherPlacement === 'bottom-center'
                              ? 'bg-blue-500/10 text-blue-500'
                              : 'bg-muted hover:bg-muted/80',
                          )}
                        >
                          <AlignCenter className="size-3" />
                          <span>Center</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setLauncherPlacement('bottom-right')}
                          className={cn(
                            'flex flex-1 items-center gap-1 rounded-sm p-1 px-2 transition-colors',
                            launcherPlacement === 'bottom-right'
                              ? 'bg-blue-500/10 text-blue-500'
                              : 'bg-muted hover:bg-muted/80',
                          )}
                        >
                          <AlignRight className="size-3" />
                          <span>Right</span>
                        </button>
                      </div>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground h-7 w-7"
                  onClick={() => close()}
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {contentArea}
            {persistentSuggestions}
            {inputArea('Enter to send')}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Launcher — rendered last so it stays on top of the panel */}
      <div
        className={cn(
          'pointer-events-auto absolute bottom-2',
          launcherPlacement === 'bottom-center'
            ? 'left-1/2 -translate-x-1/2'
            : 'right-4',
        )}
      >
        <button
          type="button"
          onClick={() => (visible ? close() : open())}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full border transition-colors',
            visible
              ? 'border-blue-500/50 bg-blue-600 text-white'
              : 'bg-background/80 hover:bg-background border-white/20 shadow-sm dark:border-white/10 dark:bg-black/60',
          )}
          title="Toggle AI (⌘K)"
        >
          <div className="from-primary dark:from-background flex h-full w-full items-center justify-center rounded-full bg-linear-to-tr to-blue-500 text-white">
            <Loader className={cn('size-3', !visible ? 'spin-pause' : '')} />
          </div>
        </button>
      </div>

      {/* New thread confirmation */}
      <AlertDialog open={pendingConfirm?.type === 'new-thread'}>
        <AlertDialogContent className="z-500">
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will start a fresh thread and you may lose current context.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => confirmPending(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmPending(true)}>
              New chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
