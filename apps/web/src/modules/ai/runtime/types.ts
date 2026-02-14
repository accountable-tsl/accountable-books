import type { ReactNode } from 'react';

import type { AiDomainKey } from '../keys';

export type AiCapabilityId = string;

export type AiSurfaceMode = 'closed' | 'floating' | 'docked';
export type AiDockSide = 'right' | 'left';
export type AiLauncherPlacement = 'bottom-center' | 'bottom-right';
export type AiPreferredOpenMode = 'floating' | 'docked';

export type AiPolicy = {
  globalEnabled: boolean;
  enabledDomains?: Set<AiDomainKey>;
  enabledCapabilities?: Set<AiCapabilityId>;
  disabledDomains: Set<AiDomainKey>;
  disabledCapabilities: Set<AiCapabilityId>;
};

export type AiCapabilityUI = {
  capabilityId: AiCapabilityId;
  label: string;
  description: string;
  shortcutHint?: string;
  domain: AiDomainKey;
  match?: (input: string) => number; // 0..1
  renderResult?: (proposal: unknown) => ReactNode;
};

export type DomainAIRegistration = {
  domain: AiDomainKey;
  domainLabel: string;
  capabilities: AiCapabilityUI[];
};

export type AiMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  meta?: {
    domain?: AiDomainKey;
    capabilityId?: AiCapabilityId;
    proposalId?: string;
  };
};

export type AiThread = {
  id: string;
  title?: string;
  messages: AiMessage[];
  updatedAt: number;
};

export type AiRuntimeContext = {
  userId: string;
  companyId: string;
};

export type AiRuntimeState = {
  ctx: AiRuntimeContext | null;

  policy: AiPolicy;

  surfaceMode: AiSurfaceMode;
  preferredOpenMode: AiPreferredOpenMode;
  dockSide: AiDockSide;
  dockWidthPx: number;
  launcherPlacement: AiLauncherPlacement;

  input: string;
  isLoading: boolean;

  registrations: Map<AiDomainKey, DomainAIRegistration>;
  activeDomain: AiDomainKey | null;

  activeThreadId: string;
  threads: Record<string, AiThread>;

  inlineNotifications: Array<{ id: string; text: string; ts: number }>;
  insights: Array<{
    id: string;
    domain: AiDomainKey;
    text: string;
    ts: number;
  }>;

  pendingConfirm: null | {
    type: 'new-thread';
    requestedAt: number;
    threadId: string;
  };

  setContext: (ctx: AiRuntimeContext) => void;
  setPolicy: (
    policy: Partial<
      Omit<AiPolicy, 'disabledDomains' | 'disabledCapabilities'>
    > & {
      enabledDomains?: Iterable<AiDomainKey> | null;
      enabledCapabilities?: Iterable<AiCapabilityId> | null;
      disabledDomains?: Iterable<AiDomainKey>;
      disabledCapabilities?: Iterable<AiCapabilityId>;
    },
  ) => void;

  isDomainEnabled: (domain: AiDomainKey) => boolean;
  isCapabilityEnabled: (capabilityId: AiCapabilityId) => boolean;

  open: () => void; // Cmd+K / launcher (opens preferred mode)
  dock: (side?: AiDockSide) => void;
  undock: () => void;
  close: () => void; // collapses to launcher (does not disable AI)
  setLauncherPlacement: (placement: AiLauncherPlacement) => void;
  toggleLauncherPlacement: () => void;

  setInput: (v: string) => void;
  setActiveDomain: (domain: AiDomainKey | null) => void;

  registerDomain: (reg: DomainAIRegistration) => void;
  unregisterDomain: (domain: AiDomainKey) => void;

  requestNewThread: () => void;
  confirmPending: (confirm: boolean) => void;

  appendMessage: (msg: AiMessage) => void;
  clearThread: (threadId: string) => void;

  messageDomainFilter: AiDomainKey | null;
  setMessageDomainFilter: (domain: AiDomainKey | null) => void;
};
