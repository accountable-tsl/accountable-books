import { useCallback, useMemo, useRef, useState } from 'react';

import type { GroupedTransaction } from '@/modules/accounting/categorization';
import type { Intent } from '@/modules/accounting/categorization/model/intent-types';

export interface TransactionState {
  serverState: GroupedTransaction; // Last confirmed from backend
  draftState: Partial<GroupedTransaction>; // Live user edits
  pendingIntents: Map<string, Intent>; // Keyed by intent_key for semantic deduplication
  status: 'idle' | 'saving' | 'saved' | 'error';
}

/**
 * Hook to manage transaction state per transaction
 * Tracks server state, draft state, pending intents, and status
 */
export function useTransactionState(initialTransaction: GroupedTransaction) {
  const [serverState, setServerState] =
    useState<GroupedTransaction>(initialTransaction);
  const [draftState, setDraftState] = useState<Partial<GroupedTransaction>>({});
  const pendingIntentsRef = useRef<Map<string, Intent>>(new Map());
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );

  // Update draft state (optimistic update)
  const updateDraft = useCallback((updates: Partial<GroupedTransaction>) => {
    setDraftState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Add pending intent
  const addPendingIntent = useCallback((intent: Intent) => {
    pendingIntentsRef.current.set(intent.intent_key, intent);
    setStatus('saving');
  }, []);

  // Remove pending intent (when sent successfully)
  const removePendingIntent = useCallback((intentKey: string) => {
    pendingIntentsRef.current.delete(intentKey);
    if (pendingIntentsRef.current.size === 0) {
      setStatus('saved');
      // Clear saved status after a delay
      setTimeout(() => setStatus('idle'), 2000);
    }
  }, []);

  // Sync with server response
  const syncWithServer = useCallback(
    (updatedTransaction: GroupedTransaction) => {
      setServerState(updatedTransaction);
      setDraftState({});
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    },
    [],
  );

  // Set error state
  const setError = useCallback(() => {
    setStatus('error');
  }, []);

  // Get current display state (server + draft merged)
  const displayState = useMemo(() => {
    return { ...serverState, ...draftState };
  }, [serverState, draftState]);

  // Get pending intents as array
  const pendingIntents = useMemo(() => {
    return Array.from(pendingIntentsRef.current.values());
  }, [pendingIntentsRef.current.size]);

  return {
    serverState,
    draftState,
    pendingIntents,
    status,
    displayState,
    updateDraft,
    addPendingIntent,
    removePendingIntent,
    syncWithServer,
    setError,
  };
}
