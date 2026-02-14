import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AiDomainKey } from '../keys';
import type {
  AiCapabilityId,
  AiMessage,
  AiPolicy,
  AiRuntimeState,
  AiThread,
  DomainAIRegistration,
} from './types';

function now() {
  return Date.now();
}

function newId(prefix: string) {
  return `${prefix}-${now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const MESSAGE_RETENTION_DAYS = 14;
const MESSAGE_RETENTION_MS = MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

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

const defaultPolicy: AiPolicy = {
  globalEnabled: envBool('VITE_AI_ENABLED', false),
  enabledDomains: (() => {
    const list = envCsv('VITE_AI_ENABLED_DOMAINS');
    return list.length > 0 ? new Set(list) : undefined;
  })(),
  enabledCapabilities: (() => {
    const list = envCsv('VITE_AI_ENABLED_CAPABILITIES');
    return list.length > 0 ? new Set(list) : undefined;
  })(),
  disabledDomains: new Set(envCsv('VITE_AI_DISABLED_DOMAINS')),
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

function pruneThreadMessages(thread: AiThread, cutoffMs: number): AiThread {
  if (thread.messages.length === 0) return thread;
  const nextMessages = thread.messages.filter((m) => m.timestamp >= cutoffMs);
  if (nextMessages.length === thread.messages.length) return thread;
  return {
    ...thread,
    messages: nextMessages,
    updatedAt: now(),
  };
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

      setContext: (ctx) => set({ ctx }),

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

      requestNewThread: () => {
        const state = get();
        const thread = getActiveThread(state.threads, state.activeThreadId);
        const hasMessages = thread.messages.length > 0;
        if (!hasMessages) {
          const id = newId('t');
          set((s) => ({
            activeThreadId: id,
            threads: {
              ...s.threads,
              [id]: { id, messages: [], updatedAt: now() },
            },
            pendingConfirm: null,
          }));
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

      confirmPending: (confirm) => {
        const state = get();
        const pending = state.pendingConfirm;
        if (!pending) return;
        if (!confirm) {
          set({ pendingConfirm: null });
          return;
        }

        if (pending.type === 'new-thread') {
          const id = newId('t');
          set((s) => ({
            activeThreadId: id,
            threads: {
              ...s.threads,
              [id]: { id, messages: [], updatedAt: now() },
            },
            pendingConfirm: null,
          }));
        }
      },

      appendMessage: (msg: AiMessage) =>
        set((state) => {
          const cutoff = now() - MESSAGE_RETENTION_MS;
          const thread = getActiveThread(state.threads, state.activeThreadId);
          const pruned = pruneThreadMessages(thread, cutoff);
          const nextThread: AiThread = {
            ...pruned,
            messages: [...pruned.messages, msg],
            updatedAt: now(),
          };
          return {
            threads: { ...state.threads, [state.activeThreadId]: nextThread },
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
          const cutoff = now() - MESSAGE_RETENTION_MS;
          const nextThreads: Record<string, AiThread> = {};
          const threads = (merged.threads ?? {}) as Record<string, AiThread>;
          for (const [id, t] of Object.entries(threads)) {
            nextThreads[id] = pruneThreadMessages(t, cutoff);
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
