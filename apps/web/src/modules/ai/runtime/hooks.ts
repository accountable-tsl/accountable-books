import { useEffect } from 'react';

import { aiRuntimeStore } from './store';

import type { DomainAIRegistration } from './types';

export function useAiRuntime() {
  return aiRuntimeStore();
}

export function useRegisterAiDomain(registration: DomainAIRegistration | null) {
  const registerDomain = aiRuntimeStore((s) => s.registerDomain);
  const unregisterDomain = aiRuntimeStore((s) => s.unregisterDomain);
  const setActiveDomain = aiRuntimeStore((s) => s.setActiveDomain);
  const setMessageDomainFilter = aiRuntimeStore(
    (s) => s.setMessageDomainFilter,
  );

  useEffect(() => {
    if (!registration) return;

    registerDomain(registration);
    // Default behavior on navigation: start in "All" (capability + message scope),
    // and let the user narrow via the chips or docked filters.
    setActiveDomain(null);
    setMessageDomainFilter(null);

    return () => {
      unregisterDomain(registration.domain);
    };
  }, [
    registration,
    registerDomain,
    setActiveDomain,
    setMessageDomainFilter,
    unregisterDomain,
  ]);
}
