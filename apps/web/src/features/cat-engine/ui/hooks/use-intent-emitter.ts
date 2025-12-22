import { useCallback, useEffect, useRef } from 'react';
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
  bankTransactionId: string;
  categorizationStatus: CategorizationTransactionStatus;
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

  // Store transaction objects by transactionId for retrieval when sending
  const transactionsRef = useRef<Map<string, GroupedTransaction>>(new Map());

  // Send all pending intents for a transaction
  const sendTransactionIntents = useCallback(
    async (transactionIdOrTxn: string | GroupedTransaction) => {
      // Support both transactionId (string) and GroupedTransaction for flexibility
      // Use bankTransactionId as the key to match how intents are stored
      const transactionId =
        typeof transactionIdOrTxn === 'string'
          ? transactionIdOrTxn
          : transactionIdOrTxn.bankTransactionId;
      const txn =
        typeof transactionIdOrTxn === 'string'
          ? transactionsRef.current.get(transactionIdOrTxn)
          : transactionIdOrTxn;

      if (!txn) {
        // Transaction not found - might have been removed, skip sending
        pendingTransactionsRef.current.delete(transactionId);
        debounceTimersRef.current.delete(transactionId);
        return;
      }

      const fieldIntents = pendingTransactionsRef.current.get(transactionId);
      if (!fieldIntents || fieldIntents.size === 0) {
        return;
      }

      const intentsToSend = Array.from(fieldIntents.values());

      // Validate we can send before clearing
      if (!canSendTransaction(txn, intentsToSend)) {
        return;
      }

      // Check prerequisites before clearing
      if (!navigator.onLine) {
        offlineQueueRef.current.add(transactionId);
        return;
      }

      if (!companyId) return;

      // All checks passed - optimistically clear before sending
      pendingTransactionsRef.current.delete(transactionId);
      debounceTimersRef.current.delete(transactionId);

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
  }, [sendTransactionIntents]);

  // State intents → debounced per transaction
  const emitTransactionIntent = useCallback(
    <T extends IntentActionType>({
      action,
      payload,
      bankTransactionId,
      categorizationStatus,
      intentKey,
    }: EmitIntentArgs<T>) => {
      if (!validateIntentPayload(action, payload)) {
        throw new Error(`Invalid payload for action ${action}`);
      }

      // Build intent (new ID every time; dedupe is semantic)
      const intent: Intent<T> = {
        intent_id: uuidv4(),
        intent_key: intentKey,
        bank_transaction_id: bankTransactionId,
        action_type: action,
        payload,
        client_version: 1,
        categorization_status: categorizationStatus,
      };

      // Add to pending map for the transaction
      if (!pendingTransactionsRef.current.has(bankTransactionId)) {
        pendingTransactionsRef.current.set(bankTransactionId, new Map());
      }
      pendingTransactionsRef.current
        .get(bankTransactionId)!
        .set(intentKey, intent);

      // Debounce sending per transaction
      const existingTimer = debounceTimersRef.current.get(bankTransactionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(
        () => sendTransactionIntents(bankTransactionId),
        TRANSACTION_DEBOUNCE_MS,
      );
      debounceTimersRef.current.set(bankTransactionId, timer);
    },
    [sendTransactionIntents],
  );

  // Register a transaction for later retrieval when sending intents
  const registerTransaction = useCallback((txn: GroupedTransaction) => {
    transactionsRef.current.set(txn.bankTransactionId, txn);
  }, []);

  // Flush queued intents when connection is restored
  // (caller should wire this once globally)
  const handleOnline = useCallback(() => {
    void flushOfflineQueue();
  }, [flushOfflineQueue]);

  return {
    emitTransactionIntent,
    flushOfflineQueue,
    handleOnline,
    registerTransaction,
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
  const { emitTransactionIntent, registerTransaction } = useIntentEmitter();

  // Register the transaction so it can be retrieved when sending intents
  useEffect(() => {
    registerTransaction(txn);
  }, [txn, registerTransaction]);

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
      bankTransactionId: txn.bankTransactionId,
      categorizationStatus: txn.status,
      intentKey,
    });
  }

  return { updateField };
}

export function canSendTransaction(
  txn: GroupedTransaction,
  intents: Intent[],
): boolean {
  // If an uncategorized bank transaction is updated but has no COA selected yet, don't send
  const hasCoaIntent = intents.some((i) => i.action_type === 'ASSIGN_COA');

  if (txn.status === 'uncategorized' && !txn.coaId && !hasCoaIntent) {
    return false;
  }

  return true;
}
