import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import { useSession } from '@/app/session';
import type { GroupedTransaction } from '@/modules/accounting/categorization';
import { useSendCategorizationIntent } from '@/modules/accounting/categorization/model/hooks';
import type {
  Intent,
  IntentActionType,
} from '@/modules/accounting/categorization/model/intent-types';
import type {
  LedgerIntent,
  LedgerIntentEntry,
} from '@accountable-books/contracts/schema';
import { toYMD } from '@/shared/utils/date-utils';
import { infiniteQueryOptions } from '@tanstack/react-query';

const TRANSACTION_DEBOUNCE_MS = 1000;

// We'd keep it at one transaction a time. Bulk actions will take a separate explicit mechanism

// interface EmitIntentArgs<T extends IntentActionType> {
//   action: T;
//   payload: IntentPayloadMap[T];
//   bankTransactionId: string;
//   categorizationStatus: CategorizationTransactionStatus;
//   intentKey: string;
// }

// export function useIntentEmitter() {
//   const { companyId } = useSession();
//   const sendIntentMutation = useSendCategorizationIntent();

//   // Pending state intents grouped by transactionId
//   const pendingTransactionsRef = useRef<Map<string, Map<string, Intent>>>(
//     new Map(),
//   );

//   const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
//     new Map(),
//   );

//   // Transactions that failed to send due to offline / error
//   const offlineQueueRef = useRef<Set<string>>(new Set());

//   // Store transaction objects by transactionId for retrieval when sending
//   const transactionsRef = useRef<Map<string, GroupedTransaction>>(new Map());

//   // Send all pending intents for a transaction
//   const sendTransactionIntents = useCallback(
//     async (transactionIdOrTxn: string | GroupedTransaction) => {
//       // Support both transactionId (string) and GroupedTransaction for flexibility
//       // Use bankTransactionId as the key to match how intents are stored
//       const transactionId =
//         typeof transactionIdOrTxn === 'string'
//           ? transactionIdOrTxn
//           : transactionIdOrTxn.bankTransactionId;
//       const txn =
//         typeof transactionIdOrTxn === 'string'
//           ? transactionsRef.current.get(transactionIdOrTxn)
//           : transactionIdOrTxn;

//       if (!txn) {
//         // Transaction not found - might have been removed, skip sending
//         pendingTransactionsRef.current.delete(transactionId);
//         debounceTimersRef.current.delete(transactionId);
//         return;
//       }

//       const fieldIntents = pendingTransactionsRef.current.get(transactionId);
//       if (!fieldIntents || fieldIntents.size === 0) {
//         return;
//       }

//       const intentsToSend = Array.from(fieldIntents.values());

//       // Validate we can send before clearing
//       if (!canSendTransaction(txn, intentsToSend)) {
//         return;
//       }

//       // Check prerequisites before clearing
//       if (!navigator.onLine) {
//         offlineQueueRef.current.add(transactionId);
//         return;
//       }

//       if (!companyId) return;

//       // All checks passed - optimistically clear before sending
//       pendingTransactionsRef.current.delete(transactionId);
//       debounceTimersRef.current.delete(transactionId);

//       try {
//         await sendIntentMutation.mutateAsync({
//           companyId,
//           intent: intentsToSend,
//         });
//       } catch (err) {
//         toast.error('Failed to save transaction updates', {
//           duration: Infinity,
//         });
//         // Keep intents in pending for retry
//         pendingTransactionsRef.current.set(transactionId, fieldIntents);
//         offlineQueueRef.current.add(transactionId);
//       }
//     },
//     [companyId, sendIntentMutation],
//   );

//   /**
//    * Flush queued intents when connection returns.
//    */
//   const flushOfflineQueue = useCallback(async () => {
//     if (!navigator.onLine) return;
//     const transactionIds = Array.from(offlineQueueRef.current);
//     offlineQueueRef.current.clear();

//     for (const transactionId of transactionIds) {
//       await sendTransactionIntents(transactionId);
//     }
//   }, [sendTransactionIntents]);

//   // State intents → debounced per transaction
//   const emitTransactionIntent = useCallback(
//     <T extends IntentActionType>({
//       action,
//       payload,
//       bankTransactionId,
//       categorizationStatus,
//       intentKey,
//     }: EmitIntentArgs<T>) => {
//       if (!validateIntentPayload(action, payload)) {
//         throw new Error(`Invalid payload for action ${action}`);
//       }

//       // Build intent (new ID every time; dedupe is semantic)
//       const intent: Intent<T> = {
//         intent_id: uuidv4(),
//         intent_key: intentKey,
//         bank_transaction_id: bankTransactionId,
//         action_type: action,
//         payload,
//         client_version: 1,
//         categorization_status: categorizationStatus,
//       };

//       // Add to pending map for the transaction
//       if (!pendingTransactionsRef.current.has(bankTransactionId)) {
//         pendingTransactionsRef.current.set(bankTransactionId, new Map());
//       }
//       pendingTransactionsRef.current
//         .get(bankTransactionId)!
//         .set(intentKey, intent);

//       // Debounce sending per transaction
//       const existingTimer = debounceTimersRef.current.get(bankTransactionId);
//       if (existingTimer) {
//         clearTimeout(existingTimer);
//       }

//       const timer = setTimeout(
//         () => sendTransactionIntents(bankTransactionId),
//         TRANSACTION_DEBOUNCE_MS,
//       );
//       debounceTimersRef.current.set(bankTransactionId, timer);
//     },
//     [sendTransactionIntents],
//   );

//   // Register a transaction for later retrieval when sending intents
//   const registerTransaction = useCallback((txn: GroupedTransaction) => {
//     transactionsRef.current.set(txn.bankTransactionId, txn);
//   }, []);

//   // Flush queued intents when connection is restored
//   // (caller should wire this once globally)
//   const handleOnline = useCallback(() => {
//     void flushOfflineQueue();
//   }, [flushOfflineQueue]);

//   return {
//     emitTransactionIntent,
//     flushOfflineQueue,
//     handleOnline,
//     registerTransaction,
//   };
// }

// export function buildIntentKey(action: IntentActionType, id: string) {
//   return `${action}:${id}`;
// }

// /**
//  * Custom hook that provides a function to update fields on a GroupedTransaction
//  * by emitting a state intent through the intent emitter.
//  *
//  * Using this useFieldUpdater hook because we cannot call another hook (useIntentEmitter) inside a plain function like updateField
//  * @param txn - The GroupedTransaction being edited
//  * @returns Object containing updateField function
//  */
// export function useFieldUpdater(txn: GroupedTransaction) {
//   const { emitTransactionIntent, registerTransaction } = useIntentEmitter();

//   // Register the transaction so it can be retrieved when sending intents
//   useEffect(() => {
//     registerTransaction(txn);
//   }, [txn, registerTransaction]);

//   /**
//    * Emits an intent to update a specific field/action on the transaction.
//    *
//    * @typeParam T - The specific intent action type
//    * @param action - The type of intent (e.g., 'UPDATE_CATEGORY')
//    * @param payload - The payload data for that intent
//    */
//   function updateField<T extends IntentActionType>(
//     action: T,
//     payload: IntentPayloadMap[T],
//   ) {
//     // Determine the relevant ID for building the intent key
//     const id =
//       'entryId' in payload
//         ? payload.entryId!
//         : 'bankTransactionId' in payload
//           ? payload.bankTransactionId
//           : txn.id;

//     // Build a unique key for this intent to allow deduplication/optimistic updates
//     const intentKey = buildIntentKey(action, id);

//     emitTransactionIntent({
//       action,
//       payload,
//       bankTransactionId: txn.bankTransactionId,
//       categorizationStatus: txn.status,
//       intentKey,
//     });
//   }

//   return { updateField };
// }

// export function canSendTransaction(
//   txn: GroupedTransaction,
//   intents: Intent[],
// ): boolean {
//   // If an uncategorized bank transaction is updated but has no COA selected yet, don't send
//   const hasCoaIntent = intents.some((i) => i.action_type === 'ASSIGN_COA');

//   if (txn.status === 'uncategorized' && !txn.coaId && !hasCoaIntent) {
//     return false;
//   }

//   return true;
// }

// ============================================================================
// NEW IMPLEMENTATION: Direct LedgerIntent Builder
// ============================================================================

/**
 * Pending desired_state per transaction, tracking partial updates to LedgerIntent.
 * This directly aligns with the backend's LedgerIntent['desired_state'] structure.
 * We use Record for entries instead of array to make updates simpler.
 */
type PendingDesiredState = {
  entries?: Record<string, Partial<LedgerIntentEntry>>;
  custom_exchange_rate?: number | null;
};

/**
 * Resolves a nullable field from pending changes with proper null vs undefined handling.
 * - null → explicit clear (return null)
 * - undefined → no change (use fallback)
 * - value → set/overwrite (return value)
 */
function resolveNullableField<T>(
  pendingValue: T | null | undefined,
  fallback: T | null | undefined,
): T | null {
  if (pendingValue === null) return null;
  return pendingValue ?? fallback ?? null;
}

/**
 * Builds a LedgerIntent from a transaction and its pending desired_state.
 * Merges current transaction state with pending field updates.
 * Handles all split scenarios: updating splits, creating new splits, and extending splits.
 */
function buildLedgerIntentFromTransaction(
  transaction: GroupedTransaction,
  desiredState: PendingDesiredState,
): LedgerIntent {
  const entries: LedgerIntentEntry[] = [];

  // Get all entry IDs from both transaction and desiredState
  const transactionEntryIds = new Set<string>();
  if (transaction.hasMultipleEntries && transaction.entries) {
    transaction.entries.forEach((entry) => transactionEntryIds.add(entry.id));
  } else {
    transactionEntryIds.add(transaction.id);
  }

  const desiredStateEntryIds = new Set(
    desiredState.entries ? Object.keys(desiredState.entries) : [],
  );

  // Combine all entry IDs (transaction entries + new entries from desiredState)
  const allEntryIds = new Set([
    ...transactionEntryIds,
    ...desiredStateEntryIds,
  ]);

  // Build entries from all entry IDs
  for (const entryId of allEntryIds) {
    // Find transaction entry if it exists
    const transactionEntry =
      transaction.hasMultipleEntries && transaction.entries
        ? transaction.entries.find((e) => e.id === entryId)
        : entryId === transaction.id
          ? transaction
          : null;

    // Get pending changes for this entry
    const entryChanges = desiredState.entries?.[entryId] || {};

    // Build base entry from transaction state (if exists)
    let baseEntry: Partial<LedgerIntentEntry>;
    if (transactionEntry) {
      // Check if this is an entry from the entries array (has ledgerEntryId)
      let ledgerEntryId: string | undefined = undefined;
      if (
        'ledgerEntryId' in transactionEntry &&
        typeof transactionEntry.ledgerEntryId === 'string'
      ) {
        ledgerEntryId = transactionEntry.ledgerEntryId;
      }

      baseEntry = {
        entry_id: ledgerEntryId,
        coa_id: transactionEntry.coaId || undefined,
        description: transactionEntry.description,
        reference: transactionEntry.reference || undefined,
        fs_date: transactionEntry.fsDate
          ? toYMD(new Date(transactionEntry.fsDate))
          : undefined,
        contact_id: transactionEntry.contactId || undefined,
        project_id: transactionEntry.projectId || undefined,
        // For existing entries, use nativeAmount if source_amount not specified
        source_amount:
          entryChanges.source_amount !== undefined
            ? entryChanges.source_amount
            : transactionEntry.nativeAmount,
      };
    } else {
      // New entry - no base state
      baseEntry = {
        entry_id: undefined,
      };
    }

    // Merge with pending changes (pending changes take precedence)
    const mergedEntry: LedgerIntentEntry = {
      entry_id: entryChanges.entry_id ?? baseEntry.entry_id,
      coa_id: entryChanges.coa_id || baseEntry.coa_id!,
      description: resolveNullableField(
        entryChanges.description,
        baseEntry.description,
      ),
      reference: resolveNullableField(
        entryChanges.reference,
        baseEntry.reference,
      ),
      fs_date: entryChanges.fs_date || baseEntry.fs_date,
      contact_id: resolveNullableField(
        entryChanges.contact_id,
        baseEntry.contact_id,
      ),
      contact_type: resolveNullableField(entryChanges.contact_type, undefined),
      project_id: resolveNullableField(
        entryChanges.project_id,
        baseEntry.project_id,
      ),
      source_amount: entryChanges.source_amount ?? baseEntry.source_amount,
      human_reviewed: entryChanges.human_reviewed ?? true,
      review_notes: entryChanges.review_notes ?? null,
      file_id: entryChanges.file_id ?? null,
      file_name: entryChanges.file_name ?? null,
      metadata: entryChanges.metadata,
    };

    // Only include entries that have a COA (required field)
    if (mergedEntry.coa_id) {
      entries.push(mergedEntry);
    }
  }

  // Build final desired_state
  const finalDesiredState: LedgerIntent['desired_state'] = {};
  if (desiredState.custom_exchange_rate !== undefined) {
    finalDesiredState.custom_exchange_rate = desiredState.custom_exchange_rate;
  }
  if (entries.length > 0) {
    finalDesiredState.entries = entries;
  }

  // Build LedgerIntent
  const ledgerIntent: LedgerIntent = {
    intent_id: uuidv4(),
    bank_transaction_id: transaction.bankTransactionId,
    ledger_transaction_id: transaction.ledgerTransactionId || undefined,
    candidate_id: transaction.candidateId || undefined,
    desired_state:
      Object.keys(finalDesiredState).length > 0 ? finalDesiredState : undefined,
    timestamp: new Date().toISOString(),
  };

  return ledgerIntent;
}

/**
 * Validates if a LedgerIntent can be sent for a transaction.
 * Checks if transaction has required COA before sending.
 */
export function canSendLedgerIntent(
  txn: GroupedTransaction,
  desiredState: PendingDesiredState,
): boolean {
  // If an uncategorized bank transaction is updated but has no COA selected yet, don't send
  if (txn.status === 'uncategorized') {
    // Check if there's a COA in pending changes
    const hasCoaInChanges = desiredState.entries
      ? Object.values(desiredState.entries).some((entry) => entry.coa_id)
      : false;

    if (!txn.coaId && !hasCoaInChanges) {
      return false;
    }
  }

  return true;
}

/**
 * Hook for managing pending changes and building LedgerIntent directly.
 * This is the new implementation that bypasses the intermediate Intent system.
 */
export function usePendingChangesEmitter() {
  const { companyId } = useSession();
  const sendIntentMutation = useSendCategorizationIntent();

  // Pending desired_state grouped by bankTransactionId
  const desiredStateRef = useRef<Map<string, PendingDesiredState>>(new Map());

  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Transactions that failed to send due to offline / error
  const offlineQueueRef = useRef<Set<string>>(new Set());

  // Store transaction objects by bankTransactionId for retrieval when sending
  const transactionsRef = useRef<Map<string, GroupedTransaction>>(new Map());

  // Send pending changes for a transaction
  const sendPendingChanges = useCallback(
    async (bankTransactionId: string) => {
      const txn = transactionsRef.current.get(bankTransactionId);
      const desiredState = desiredStateRef.current.get(bankTransactionId);

      if (!txn) {
        // Transaction not found - might have been removed, skip sending
        desiredStateRef.current.delete(bankTransactionId);
        debounceTimersRef.current.delete(bankTransactionId);
        return;
      }

      if (!desiredState) {
        return;
      }

      // Validate we can send before clearing
      if (!canSendLedgerIntent(txn, desiredState)) {
        return;
      }

      // Check prerequisites before clearing
      if (!navigator.onLine) {
        offlineQueueRef.current.add(bankTransactionId);
        return;
      }

      if (!companyId) return;

      // Build LedgerIntent from transaction and pending desired_state
      const ledgerIntent = buildLedgerIntentFromTransaction(txn, desiredState);

      // All checks passed - optimistically clear before sending
      desiredStateRef.current.delete(bankTransactionId);
      debounceTimersRef.current.delete(bankTransactionId);

      try {
        // Note: The API function currently has type signature Intent[], but the backend
        // actually expects LedgerIntent[]. The cast is safe because the backend validates
        // against ledgerIntentSchema. In a future change, we should update the API function
        // signature to accept LedgerIntent[] directly.
        await sendIntentMutation.mutateAsync({
          companyId,
          intent: [ledgerIntent as unknown as Intent<IntentActionType>],
        });
      } catch (err) {
        toast.error('Failed to save transaction updates', {
          duration: Infinity,
          closeButton: true,
        });
        // Keep changes in pending for retry
        desiredStateRef.current.set(bankTransactionId, desiredState);
        offlineQueueRef.current.add(bankTransactionId);
      }
    },
    [companyId, sendIntentMutation],
  );

  /**
   * Flush queued changes when connection returns.
   */
  const flushOfflineQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const transactionIds = Array.from(offlineQueueRef.current);
    offlineQueueRef.current.clear();

    for (const transactionId of transactionIds) {
      await sendPendingChanges(transactionId);
    }
  }, [sendPendingChanges]);

  /**
   * Update an entry's fields in the pending desired_state.
   * Merges new changes into existing entry state.
   */
  const updateEntry = useCallback(
    (
      bankTransactionId: string,
      entryId: string,
      changes: Partial<LedgerIntentEntry>,
    ) => {
      if (!desiredStateRef.current.has(bankTransactionId)) {
        desiredStateRef.current.set(bankTransactionId, {});
      }

      const desiredState = desiredStateRef.current.get(bankTransactionId)!;
      if (!desiredState.entries) {
        desiredState.entries = {};
      }

      // Merge changes into entry
      const existing = desiredState.entries[entryId] || {};
      desiredState.entries[entryId] = { ...existing, ...changes };

      // Debounce sending per transaction
      const existingTimer = debounceTimersRef.current.get(bankTransactionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(
        () => sendPendingChanges(bankTransactionId),
        TRANSACTION_DEBOUNCE_MS,
      );
      debounceTimersRef.current.set(bankTransactionId, timer);
    },
    [sendPendingChanges],
  );

  /**
   * Update transaction-level exchange rate in the pending desired_state.
   */
  const updateExchangeRate = useCallback(
    (bankTransactionId: string, rate: number | null) => {
      if (!desiredStateRef.current.has(bankTransactionId)) {
        desiredStateRef.current.set(bankTransactionId, {});
      }

      const desiredState = desiredStateRef.current.get(bankTransactionId)!;
      desiredState.custom_exchange_rate = rate;

      // Debounce sending per transaction
      const existingTimer = debounceTimersRef.current.get(bankTransactionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(
        () => sendPendingChanges(bankTransactionId),
        TRANSACTION_DEBOUNCE_MS,
      );
      debounceTimersRef.current.set(bankTransactionId, timer);
    },
    [sendPendingChanges],
  );

  // Register a transaction for later retrieval when sending
  const registerTransaction = useCallback((txn: GroupedTransaction) => {
    transactionsRef.current.set(txn.bankTransactionId, txn);
  }, []);

  // Flush queued changes when connection is restored
  const handleOnline = useCallback(() => {
    void flushOfflineQueue();
  }, [flushOfflineQueue]);

  return {
    updateEntry,
    updateExchangeRate,
    sendPendingChanges,
    flushOfflineQueue,
    handleOnline,
    registerTransaction,
  };
}

/**
 * Custom hook that provides functions to update fields on a GroupedTransaction
 * by tracking pending desired_state and building LedgerIntent directly.
 *
 * This is the new V2 implementation that bypasses the intermediate Intent system.
 * @param txn - The GroupedTransaction being edited
 * @returns Object containing updateEntry and updateExchangeRate functions
 */
export function useLedgerIntentUpdater(txn: GroupedTransaction) {
  const { updateEntry, updateExchangeRate, registerTransaction } =
    usePendingChangesEmitter();

  // Register the transaction so it can be retrieved when sending
  useEffect(() => {
    registerTransaction(txn);
  }, [txn, registerTransaction]);

  return {
    updateEntry: (entryId: string, changes: Partial<LedgerIntentEntry>) => {
      updateEntry(txn.bankTransactionId, entryId, changes);
    },
    updateExchangeRate: (rate: number | null) => {
      updateExchangeRate(txn.bankTransactionId, rate);
    },
  };
}
