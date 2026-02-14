import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AiCommandBar } from '@/components/ai/ai-command-bar';

import { aiRuntimeStore } from './store';

export function AiRuntimeProvider(props: {
  userId: string;
  companyId: string;
  children: ReactNode;
}) {
  const setContext = aiRuntimeStore((s) => s.setContext);
  const open = aiRuntimeStore((s) => s.open);
  const close = aiRuntimeStore((s) => s.close);
  const surfaceMode = aiRuntimeStore((s) => s.surfaceMode);
  const policy = aiRuntimeStore((s) => s.policy);
  const registrations = aiRuntimeStore((s) => s.registrations);
  const isDomainEnabled = aiRuntimeStore((s) => s.isDomainEnabled);
  const isCapabilityEnabled = aiRuntimeStore((s) => s.isCapabilityEnabled);

  useEffect(() => {
    setContext({ userId: props.userId, companyId: props.companyId });
  }, [props.userId, props.companyId, setContext]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!policy.globalEnabled) return;

        // If no capabilities are registered on the current page, do nothing.
        // This keeps AI "invisible" on pages without AI affordances.
        let hasAnyEnabledCapability = false;
        for (const reg of registrations.values()) {
          if (!isDomainEnabled(reg.domain)) continue;
          for (const cap of reg.capabilities) {
            if (isCapabilityEnabled(cap.capabilityId)) {
              hasAnyEnabledCapability = true;
              break;
            }
          }
          if (hasAnyEnabledCapability) break;
        }
        if (!hasAnyEnabledCapability) return;

        // Toggle open/close using preferred open mode.
        if (surfaceMode === 'closed') open();
        else close();
        return;
      }
      if (e.key === 'Escape') {
        if (surfaceMode === 'floating' || surfaceMode === 'docked') {
          close();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    open,
    close,
    surfaceMode,
    policy.globalEnabled,
    registrations,
    isDomainEnabled,
    isCapabilityEnabled,
  ]);

  return (
    <>
      {props.children}
      <AiCommandBar />
    </>
  );
}
