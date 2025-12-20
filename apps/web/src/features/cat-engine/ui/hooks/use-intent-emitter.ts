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

const TRANSACTION_DEBOUNCE_MS = 1000;

// We'd keep it at one transaction a time. Bulk actions will take a separate explicit mechanism

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

  // Pending state intents grouped by transactionId
  const pendingTransactionsRef = useRef<Map<string, Map<string, Intent>>>(
    new Map(),
  );

  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Transactions that failed to send due to offline / error
  const offlineQueueRef = useRef<Set<string>>(new Set());

  // Send all pending intents for a transaction
  const sendTransactionIntents = useCallback(
    async (transactionId: string) => {
      const fieldIntents = pendingTransactionsRef.current.get(transactionId);
      if (!fieldIntents || fieldIntents.size === 0) {
        return;
      }

      const intentsToSend = Array.from(fieldIntents.values());

      // Optimistically clear
      pendingTransactionsRef.current.delete(transactionId);
      debounceTimersRef.current.delete(transactionId);

      if (!navigator.onLine) {
        offlineQueueRef.current.add(transactionId);
        pendingTransactionsRef.current.set(transactionId, fieldIntents);
        return;
      }

      if (!companyId) return;

      try {
        await sendIntentMutation.mutateAsync({
          companyId,
          intent: intentsToSend,
        });
      } catch (err) {
        toast.error('Failed to save transaction updates', {
          duration: Infinity,
        });
        // Keep intents in pending for retry
        pendingTransactionsRef.current.set(transactionId, fieldIntents);
        offlineQueueRef.current.add(transactionId);
      }
    },
    [companyId, sendIntentMutation],
  );

  /**
   * Flush queued intents when connection returns.
   */
  const flushOfflineQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const transactionIds = Array.from(offlineQueueRef.current);
    offlineQueueRef.current.clear();

    for (const transactionId of transactionIds) {
      await sendTransactionIntents(transactionId);
    }
  }, []);

  // State intents → debounced per transaction
  const emitTransactionIntent = useCallback(
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

      // Add to pending map for the transaction
      if (!pendingTransactionsRef.current.has(transactionId)) {
        pendingTransactionsRef.current.set(transactionId, new Map());
      }
      pendingTransactionsRef.current.get(transactionId)!.set(intentKey, intent);

      // Debounce sending per transaction
      const existingTimer = debounceTimersRef.current.get(transactionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(
        () => sendTransactionIntents(transactionId),
        TRANSACTION_DEBOUNCE_MS,
      );
      debounceTimersRef.current.set(transactionId, timer);
    },
    [sendTransactionIntents],
  );

  // Flush queued intents when connection is restored
  // (caller should wire this once globally)
  const handleOnline = useCallback(() => {
    void flushOfflineQueue();
  }, [flushOfflineQueue]);

  return {
    emitTransactionIntent,
    flushOfflineQueue,
    handleOnline,
  };
}

export function buildIntentKey(action: IntentActionType, id: string) {
  return `${action}:${id}`;
}

/**
 * Custom hook that provides a function to update fields on a GroupedTransaction
 * by emitting a state intent through the intent emitter.
 *
 * Using this useFieldUpdater hook because we cannot call another hook (useIntentEmitter) inside a plain function like updateField
 * @param txn - The GroupedTransaction being edited
 * @returns Object containing updateField function
 */
export function useFieldUpdater(txn: GroupedTransaction) {
  const { emitTransactionIntent } = useIntentEmitter();

  /**
   * Emits an intent to update a specific field/action on the transaction.
   *
   * @typeParam T - The specific intent action type
   * @param action - The type of intent (e.g., 'UPDATE_CATEGORY')
   * @param payload - The payload data for that intent
   */
  function updateField<T extends IntentActionType>(
    action: T,
    payload: IntentPayloadMap[T],
  ) {
    // Determine the relevant ID for building the intent key
    const id =
      'entryId' in payload
        ? payload.entryId!
        : 'bankTransactionId' in payload
          ? payload.bankTransactionId
          : txn.id;

    // Build a unique key for this intent to allow deduplication/optimistic updates
    const intentKey = buildIntentKey(action, id);

    emitTransactionIntent({
      action,
      payload,
      transactionId: txn.bankTransactionId,
      transactionState: txn.status,
      intentKey,
    });
  }

  return { updateField };
}

export function canSendTransaction() {}
