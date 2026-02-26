import api from '@/lib/axios';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { AI_DOMAINS } from '../keys';

import type { AiDomainKey } from '../keys';
import type {
  AiMessage,
  AiPolicy,
  AiRuntimeState,
  AiThread,
  DomainAIRegistration,
} from './types';

function now() {
  return Date.now();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

const MAX_MESSAGES_PER_THREAD = 100;
const AI_DOMAIN_KEYS = new Set<string>(Object.values(AI_DOMAINS));
const THREAD_BOOTSTRAP_COOLDOWN_MS = 5_000;

const hydrateInFlightByCompany = new Map<string, Promise<void>>();
const ensureThreadInFlightByCompany = new Map<string, Promise<string | null>>();
const bootstrapCooldownUntilByCompany = new Map<string, number>();

function isRateLimitedError(error: unknown): boolean {
  return Number((error as any)?.response?.status) === 429;
}

function hasBootstrapCooldown(companyId: string): boolean {
  const blockedUntil = bootstrapCooldownUntilByCompany.get(companyId) ?? 0;
  return blockedUntil > Date.now();
}

function markBootstrapCooldown(companyId: string): void {
  bootstrapCooldownUntilByCompany.set(
    companyId,
    Date.now() + THREAD_BOOTSTRAP_COOLDOWN_MS,
  );
}

function envBool(key: string, fallback = false) {
  const v = (import.meta as any).env?.[key];
  if (v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  return String(v).toLowerCase() === 'true' || String(v) === '1';
}

function envCsv(key: string): string[] {
  const v = (import.meta as any).env?.[key];
  if (!v) return [];
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function envDomainCsv(key: string): AiDomainKey[] {
  return envCsv(key).filter((value): value is AiDomainKey =>
    AI_DOMAIN_KEYS.has(value),
  );
}

const defaultPolicy: AiPolicy = {
  globalEnabled: envBool('VITE_AI_ENABLED', false),
  enabledDomains: (() => {
    const list = envDomainCsv('VITE_AI_ENABLED_DOMAINS');
    return list.length > 0 ? new Set(list) : undefined;
  })(),
  enabledCapabilities: (() => {
    const list = envCsv('VITE_AI_ENABLED_CAPABILITIES');
    return list.length > 0 ? new Set(list) : undefined;
  })(),
  disabledDomains: new Set(envDomainCsv('VITE_AI_DISABLED_DOMAINS')),
  disabledCapabilities: new Set(envCsv('VITE_AI_DISABLED_CAPABILITIES')),
};

function getActiveThread(
  threads: Record<string, AiThread>,
  id: string,
): AiThread {
  return (
    threads[id] ?? {
      id,
      messages: [],
      updatedAt: now(),
    }
  );
}

function pruneThreadMessages(thread: AiThread): AiThread {
  if (thread.messages.length <= MAX_MESSAGES_PER_THREAD) return thread;
  const nextMessages = thread.messages.slice(-MAX_MESSAGES_PER_THREAD);
  return {
    ...thread,
    messages: nextMessages,
    updatedAt: now(),
  };
}

function applyMessageRetention(messages: AiMessage[]): AiMessage[] {
  if (messages.length <= MAX_MESSAGES_PER_THREAD) return messages;
  return messages.slice(-MAX_MESSAGES_PER_THREAD);
}

export const aiRuntimeStore = create<AiRuntimeState>()(
  persist(
    (set, get) => ({
      ctx: null,

      policy: defaultPolicy,

      surfaceMode: 'closed',
      preferredOpenMode: 'floating',
      dockSide: 'right',
      dockWidthPx: 360,
      launcherPlacement: 'bottom-center',

      input: '',
      isLoading: false,

      registrations: new Map(),
      activeDomain: null,

      activeThreadId: 't-default',
      threads: {
        't-default': { id: 't-default', messages: [], updatedAt: now() },
      },

      inlineNotifications: [],
      insights: [],

      pendingConfirm: null,

      messageDomainFilter: null,
      setMessageDomainFilter: (domain) => set({ messageDomainFilter: domain }),
      setIsLoading: (loading) => set({ isLoading: loading }),

      setContext: (ctx) => set({ ctx }),

      hydrateFromServer: async (companyId: string) => {
        if (hasBootstrapCooldown(companyId)) return;
        const existing = hydrateInFlightByCompany.get(companyId);
        if (existing) return existing;

        const run = (async () => {
          try {
            const res = await api.get(`/api/${companyId}/ai/threads`);
            const items = res.data?.items ?? [];
            if (items.length === 0) return;

            // Hydrate thread list
            const nextThreads = { ...get().threads };
            for (const item of items) {
              nextThreads[item.id] = {
                id: item.id,
                messages: nextThreads[item.id]?.messages || [], // keep cached until fetched
                updatedAt: item.lastMessageAt
                  ? new Date(item.lastMessageAt).getTime()
                  : new Date(item.createdAt).getTime(),
              };
            }

            const activeId = items[0].id;

            // Fetch transcript for the most recent thread
            const msgsRes = await api.get(
              `/api/${companyId}/ai/threads/${activeId}/messages`,
            );
            const msgItems = msgsRes.data?.items ?? [];

            nextThreads[activeId] = {
              ...nextThreads[activeId],
              messages: msgItems,
              updatedAt: now(),
            };

            set({ threads: nextThreads, activeThreadId: activeId });
          } catch (error) {
            if (isRateLimitedError(error)) markBootstrapCooldown(companyId);
            console.error('Failed to hydrate AI history from server.', error);
          } finally {
            if (hydrateInFlightByCompany.get(companyId) === run) {
              hydrateInFlightByCompany.delete(companyId);
            }
          }
        })();

        hydrateInFlightByCompany.set(companyId, run);
        return run;
      },

      setPolicy: (patch) =>
        set((state) => {
          const next: AiPolicy = {
            globalEnabled: patch.globalEnabled ?? state.policy.globalEnabled,
            enabledDomains:
              patch.enabledDomains === null
                ? undefined
                : patch.enabledDomains !== undefined
                  ? new Set(patch.enabledDomains)
                  : state.policy.enabledDomains,
            enabledCapabilities:
              patch.enabledCapabilities === null
                ? undefined
                : patch.enabledCapabilities !== undefined
                  ? new Set(patch.enabledCapabilities)
                  : state.policy.enabledCapabilities,
            disabledDomains:
              patch.disabledDomains !== undefined
                ? new Set(patch.disabledDomains)
                : new Set(state.policy.disabledDomains),
            disabledCapabilities:
              patch.disabledCapabilities !== undefined
                ? new Set(patch.disabledCapabilities)
                : new Set(state.policy.disabledCapabilities),
          };
          return { policy: next };
        }),

      isDomainEnabled: (domain) => {
        const { policy } = get();
        if (!policy.globalEnabled) return false;
        if (policy.enabledDomains && policy.enabledDomains.size > 0) {
          if (!policy.enabledDomains.has(domain)) return false;
        }
        return !policy.disabledDomains.has(domain);
      },

      isCapabilityEnabled: (capabilityId) => {
        const { policy } = get();
        if (!policy.globalEnabled) return false;
        if (policy.enabledCapabilities && policy.enabledCapabilities.size > 0) {
          if (!policy.enabledCapabilities.has(capabilityId)) return false;
        }
        return !policy.disabledCapabilities.has(capabilityId);
      },

      open: () =>
        set((state) => ({
          surfaceMode: state.preferredOpenMode,
          pendingConfirm: null,
          dockSide: state.dockSide,
          dockWidthPx: state.dockWidthPx,
        })),

      dock: (side = 'right') =>
        set({
          surfaceMode: 'docked',
          preferredOpenMode: 'docked',
          dockSide: side,
          pendingConfirm: null,
        }),

      undock: () =>
        set({
          surfaceMode: 'floating',
          preferredOpenMode: 'floating',
          pendingConfirm: null,
          // Floating mode uses the domain chips for scoping; reset message filtering.
          messageDomainFilter: null,
        }),

      close: () =>
        set({
          surfaceMode: 'closed',
          input: '',
          pendingConfirm: null,
        }),

      setLauncherPlacement: (placement) =>
        set({ launcherPlacement: placement }),
      toggleLauncherPlacement: () =>
        set((state) => ({
          launcherPlacement:
            state.launcherPlacement === 'bottom-center'
              ? 'bottom-right'
              : 'bottom-center',
        })),

      setInput: (v) => set({ input: v }),
      setActiveDomain: (domain) => set({ activeDomain: domain }),

      registerDomain: (reg) =>
        set((state) => {
          const next = new Map(state.registrations);
          next.set(reg.domain, reg);
          return { registrations: next };
        }),

      unregisterDomain: (domain) =>
        set((state) => {
          const next = new Map(state.registrations);
          next.delete(domain);
          const nextActive =
            state.activeDomain === domain ? null : state.activeDomain;
          return { registrations: next, activeDomain: nextActive };
        }),

      requestNewThread: async () => {
        const state = get();
        const thread = getActiveThread(state.threads, state.activeThreadId);
        const hasMessages = thread.messages.length > 0;
        if (!hasMessages) {
          try {
            const companyId = state.ctx?.companyId;
            if (!companyId) return;
            const res = await api.post(`/api/${companyId}/ai/threads`);
            const id = res.data?.id;
            if (!id) return;

            set((s) => ({
              activeThreadId: id,
              threads: {
                ...s.threads,
                [id]: { id, messages: [], updatedAt: now() },
              },
              pendingConfirm: null,
            }));
          } catch (e) {
            console.error('Failed to create new thread', e);
          }
          return;
        }

        set({
          pendingConfirm: {
            type: 'new-thread',
            requestedAt: now(),
            threadId: state.activeThreadId,
          },
        });
      },

      confirmPending: async (confirm) => {
        const state = get();
        const pending = state.pendingConfirm;
        if (!pending) return;
        if (!confirm) {
          set({ pendingConfirm: null });
          return;
        }

        if (pending.type === 'new-thread') {
          try {
            const companyId = state.ctx?.companyId;
            if (!companyId) return;
            const res = await api.post(`/api/${companyId}/ai/threads`);
            const id = res.data?.id;
            if (!id) return;

            set((s) => ({
              activeThreadId: id,
              threads: {
                ...s.threads,
                [id]: { id, messages: [], updatedAt: now() },
              },
              pendingConfirm: null,
            }));
          } catch (e) {
            console.error('Failed to confirm and create new thread', e);
          }
        }
      },

      ensureActiveThread: async () => {
        const state = get();
        const activeThreadId = state.activeThreadId;
        if (activeThreadId && isUuid(activeThreadId)) {
          if (!state.threads[activeThreadId]) {
            set((s) => ({
              threads: {
                ...s.threads,
                [activeThreadId]: {
                  id: activeThreadId,
                  messages: [],
                  updatedAt: now(),
                },
              },
            }));
          }
          return activeThreadId;
        }

        const companyId = state.ctx?.companyId;
        if (!companyId) return null;
        if (hasBootstrapCooldown(companyId)) return null;

        const existing = ensureThreadInFlightByCompany.get(companyId);
        if (existing) return existing;

        const run = (async () => {
          try {
            const latest = get();
            if (latest.activeThreadId && isUuid(latest.activeThreadId)) {
              return latest.activeThreadId;
            }

            const res = await api.post(`/api/${companyId}/ai/threads`);
            const id = res.data?.id;
            if (!id || !isUuid(String(id))) return null;

            set((s) => ({
              activeThreadId: id,
              threads: {
                ...s.threads,
                [id]: { id, messages: [], updatedAt: now() },
              },
              pendingConfirm: null,
            }));
            return id;
          } catch (error) {
            if (isRateLimitedError(error)) markBootstrapCooldown(companyId);
            console.error('Failed to ensure active AI thread', error);
            return null;
          } finally {
            if (ensureThreadInFlightByCompany.get(companyId) === run) {
              ensureThreadInFlightByCompany.delete(companyId);
            }
          }
        })();

        ensureThreadInFlightByCompany.set(companyId, run);
        return run;
      },

      appendMessage: (msg: AiMessage) =>
        set((state) => {
          const thread = getActiveThread(state.threads, state.activeThreadId);
          const retained = applyMessageRetention(thread.messages);
          const nextThread: AiThread = {
            ...thread,
            messages: applyMessageRetention([...retained, msg]),
            updatedAt: now(),
          };
          return {
            threads: { ...state.threads, [state.activeThreadId]: nextThread },
          };
        }),

      appendMessageToThread: (threadId, msg) =>
        set((state) => {
          const thread = getActiveThread(state.threads, threadId);
          const retained = applyMessageRetention(thread.messages);
          const nextThread: AiThread = {
            ...thread,
            messages: applyMessageRetention([...retained, msg]),
            updatedAt: now(),
          };
          return {
            threads: { ...state.threads, [threadId]: nextThread },
          };
        }),

      upsertMessage: (msg: AiMessage) =>
        set((state) => {
          const thread = getActiveThread(state.threads, state.activeThreadId);
          const retained = applyMessageRetention(thread.messages);
          const idx = retained.findIndex((m) => m.id === msg.id);
          const nextMessages =
            idx >= 0
              ? retained.map((m, i) =>
                  i === idx
                    ? {
                        ...m,
                        ...msg,
                        // merge meta to avoid accidentally dropping tags
                        meta: { ...(m.meta ?? {}), ...(msg.meta ?? {}) },
                      }
                    : m,
                )
              : [...retained, msg];
          const nextThread: AiThread = {
            ...thread,
            messages: applyMessageRetention(nextMessages),
            updatedAt: now(),
          };
          return {
            threads: { ...state.threads, [state.activeThreadId]: nextThread },
          };
        }),

      upsertMessageInThread: (threadId, msg) =>
        set((state) => {
          const thread = getActiveThread(state.threads, threadId);
          const retained = applyMessageRetention(thread.messages);
          const idx = retained.findIndex((m) => m.id === msg.id);
          const nextMessages =
            idx >= 0
              ? retained.map((m, i) =>
                  i === idx
                    ? {
                        ...m,
                        ...msg,
                        meta: { ...(m.meta ?? {}), ...(msg.meta ?? {}) },
                      }
                    : m,
                )
              : [...retained, msg];
          const nextThread: AiThread = {
            ...thread,
            messages: applyMessageRetention(nextMessages),
            updatedAt: now(),
          };
          return {
            threads: { ...state.threads, [threadId]: nextThread },
          };
        }),

      setThreadMessages: (threadId, messages) =>
        set((state) => {
          const nextThread: AiThread = {
            id: threadId,
            messages: applyMessageRetention(messages),
            updatedAt: now(),
          };
          return {
            threads: { ...state.threads, [threadId]: nextThread },
            activeThreadId: state.activeThreadId ?? threadId,
          };
        }),

      clearThread: (threadId) =>
        set((state) => {
          const thread = getActiveThread(state.threads, threadId);
          const nextThread: AiThread = {
            ...thread,
            messages: [],
            updatedAt: now(),
          };
          return { threads: { ...state.threads, [threadId]: nextThread } };
        }),
    }),
    {
      name: 'ai-runtime-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        // Policy is env/server-driven; do not persist it. Persisting policy causes
        // confusing behavior when env changes (e.g. VITE_AI_ENABLED=true) but an
        // older localStorage value keeps AI "off".
        preferredOpenMode: s.preferredOpenMode,
        dockSide: s.dockSide,
        dockWidthPx: s.dockWidthPx,
        launcherPlacement: s.launcherPlacement,
        activeThreadId: s.activeThreadId,
        threads: s.threads,
      }),
      merge: (persisted, current) => {
        const p = persisted as any;
        const merged = { ...(current as any), ...(p ?? {}) };
        // Always use env-driven defaults for policy (and later server overrides),
        // never persisted values.
        merged.policy = defaultPolicy;

        // Retention: drop old messages so threads don't grow forever.
        {
          const nextThreads: Record<string, AiThread> = {};
          const threads = (merged.threads ?? {}) as Record<string, AiThread>;
          for (const [id, t] of Object.entries(threads)) {
            nextThreads[id] = pruneThreadMessages(t);
          }
          merged.threads = nextThreads;
        }

        // never persist registrations across reloads
        merged.registrations = new Map<AiDomainKey, DomainAIRegistration>();
        merged.activeDomain = null;
        merged.input = '';
        merged.isLoading = false;
        merged.pendingConfirm = null;
        merged.messageDomainFilter = null;
        merged.inlineNotifications = [];
        merged.insights = [];
        merged.ctx = null;

        // migrate old persisted state
        if (merged.surfaceMode === 'dismissed') merged.surfaceMode = 'closed';
        if (!merged.preferredOpenMode) merged.preferredOpenMode = 'floating';
        if (!merged.launcherPlacement)
          merged.launcherPlacement = 'bottom-center';

        return merged;
      },
    },
  ),
);
