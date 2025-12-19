import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import { useSession } from '@/app/session';
import type {
  CategorizationTransactionStatus,
  GroupedTransaction,
} from '@/modules/accounting/categorization';
import { useSendCategorizationIntent } from '@/modules/accounting/categorization/model/hooks';
import {
  type Intent,
  IntentActionType,
  type IntentPayloadMap,
  validateIntentPayload,
} from '@/modules/accounting/categorization/model/intent-types';

const STATE_INTENT_DEBOUNCE_MS = 1000;

interface EmitIntentArgs<T extends IntentActionType> {
  action: T;
  payload: IntentPayloadMap[T];
  transactionId: string;
  transactionState: CategorizationTransactionStatus;
  intentKey: string;
}

export function useIntentEmitter() {
  const { companyId } = useSession();
  const sendIntentMutation = useSendCategorizationIntent();

  const pendingStateIntentsRef = useRef<Map<string, Intent>>(new Map());

  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const offlineQueueRef = useRef<Intent[]>([]);

  const sendIntent = async (intent: Intent) => {
    // Offline → queue and exit
    if (!navigator.onLine) {
      offlineQueueRef.current.push(intent);
      return;
    }

    if (!companyId) {
      toast.error('Company ID is required');
      return;
    }

    try {
      const result = await sendIntentMutation.mutateAsync({
        companyId,
        intent,
      });

      // Handle multi-entry effects (FX rate changes)
      if (result.data?.affected_transaction_ids?.length) {
        toast.info(
          result.data.summary_message || 'Updated multiple transactions',
          {
            duration: Infinity, // Persistent until dismissed
          },
        );
      }
    } catch (error) {
      // Error handling - persistent toast
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to save changes. Please try again.',
        {
          duration: Infinity, // Persistent until resolved
          action: {
            label: 'Retry',
            onClick: () => sendIntent(intent),
          },
        },
      );
      throw error;
    }
  };

  /**
   * Flush queued intents when connection returns.
   */
  const flushOfflineQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    if (offlineQueueRef.current.length === 0) return;

    const queue = [...offlineQueueRef.current];
    offlineQueueRef.current = [];

    for (const intent of queue) {
      await sendIntent(intent);
    }
  }, []);

  /**
   * -----------------------------
   * Decision intents
   * -----------------------------
   *
   * Example:
   * - Assign account
   * - Post to ledger
   *
   * Behavior:
   * - Validate
   * - Build intent
   * - POST immediately
   */

  const emitDecisionIntent = useCallback(
    <T extends IntentActionType>({
      action,
      payload,
      transactionId,
      transactionState,
      intentKey,
    }: EmitIntentArgs<T>) => {
      // Validate payload shape
      if (!validateIntentPayload(action, payload)) {
        throw new Error(`Invalid payload for action ${action}`);
      }

      const intent: Intent<T> = {
        intent_id: uuidv4(),
        intent_key: intentKey,
        transaction_id: transactionId,
        action_type: action,
        payload,
        client_version: 1,
        transaction_state: transactionState,
      };

      void sendIntent(intent);
    },
    [],
  );

  const emitStateIntent = useCallback(
    <T extends IntentActionType>({
      action,
      payload,
      transactionId,
      transactionState,
      intentKey,
    }: EmitIntentArgs<T>) => {
      if (!validateIntentPayload(action, payload)) {
        throw new Error(`Invalid payload for action ${action}`);
      }

      // Cancel existing debounce timer (if any)
      const existingTimer = debounceTimersRef.current.get(intentKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Build intent (new ID every time; dedupe is semantic)
      const intent: Intent<T> = {
        intent_id: uuidv4(),
        intent_key: intentKey,
        transaction_id: transactionId,
        action_type: action,
        payload,
        client_version: 1,
        transaction_state: transactionState,
      };

      // Replace older intent with same key
      pendingStateIntentsRef.current.set(intentKey, intent);

      // Schedule send
      const timer = setTimeout(async () => {
        const latestIntent = pendingStateIntentsRef.current.get(intentKey);

        if (!latestIntent) return;

        pendingStateIntentsRef.current.delete(intentKey);
        debounceTimersRef.current.delete(intentKey);

        await sendIntent(latestIntent);
      }, STATE_INTENT_DEBOUNCE_MS);

      debounceTimersRef.current.set(intentKey, timer);
    },
    [],
  );

  // Flush queued intents when connection is restored
  // (caller should wire this once globally)
  const handleOnline = useCallback(() => {
    void flushOfflineQueue();
  }, [flushOfflineQueue]);

  return {
    emitDecisionIntent,
    emitStateIntent,
    flushOfflineQueue,
    handleOnline,
  };
}

export function buildIntentKey(action: IntentActionType, id: string) {
  return `${action}:${id}`;
}

export function useFieldUpdater(txn: GroupedTransaction) {
  const { emitStateIntent } = useIntentEmitter();

  function updateField<T extends IntentActionType>(
    action: T,
    payload: IntentPayloadMap[T], // could be more strongly typed per action
  ) {
    const intentKey = buildIntentKey(
      action,
      'entryId' in payload
        ? payload.entryId!
        : 'bankTransactionId' in payload
          ? payload.bankTransactionId
          : txn.id,
    );

    emitStateIntent({
      action,
      payload,
      transactionId: txn.bankTransactionId,
      transactionState: txn.status,
      intentKey,
    });
  }

  return { updateField };
}
