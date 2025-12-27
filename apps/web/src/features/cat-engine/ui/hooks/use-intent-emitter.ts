import type { GroupedTransaction } from '@/modules/accounting/categorization';
import type { GetCategorizationTransactionsParams } from '@/modules/accounting/categorization/model/types';
import type {
  LedgerIntent,
  LedgerIntentEntry,
} from '@accountable-books/contracts/schema';
import { useCallback, useEffect, useRef } from 'react';
import { useSession } from '@/app/session';
import { fetchCategorizationTransactions } from '@/modules/accounting/categorization/api';
import { groupCategorizationTransactions } from '@/modules/accounting/categorization/lib/transform';
import { useSendCategorizationIntent } from '@/modules/accounting/categorization/model/hooks';
import { toYMD } from '@/shared/utils/date-utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

const TRANSACTION_DEBOUNCE_MS = 1000;

/**
 * Prefix for temporary entry IDs (entries not yet persisted to server).
 */
const TEMP_ENTRY_ID_PREFIX = 'temp-';

/**
 * Creates a new temporary entry ID.
 * Format: temp-entry-{uuid}-{timestamp}-{random}
 */
export function createTempEntryId(): string {
  return `${TEMP_ENTRY_ID_PREFIX}${uuidv4()}-${Date.now()}`;
}

/**
 * Checks if an entry ID is a temporary ID (not yet persisted).
 */
export function isTempEntryId(entryId: string): boolean {
  return entryId.startsWith(TEMP_ENTRY_ID_PREFIX);
}

/**
 * Pending desired_state per transaction, tracking partial updates to LedgerIntent.
 * This directly aligns with the backend's LedgerIntent['desired_state'] structure.
 * We use Record for entries instead of array to make updates simpler.
 */
type PendingDesiredState = {
  entries?: Record<string, Partial<LedgerIntentEntry>>;
  custom_exchange_rate?: number | null;
  deleted_entry_ids?: Set<string>; // Track deleted entry IDs
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
 * Includes a field in the object only if it was explicitly changed (exists in changes).
 * Used for fields that should NOT be sent if unchanged (e.g., review_notes, file_id).
 */
function includeIfChanged<K extends string, V>(
  changes: Partial<Record<K, V>>,
  key: K,
  value: V | null | undefined,
): Partial<Record<K, V | null>> {
  if (key in changes) {
    return { [key]: value } as Partial<Record<K, V | null>>;
  }
  return {};
}

/**
 * Computes the final entries that would be sent in the intent.
 * Single source of truth for entry computation.
 *
 * @param transaction - The transaction with current state
 * @param desiredState - Pending changes to apply
 * @returns Array of final LedgerIntentEntry objects that would be sent
 */
function computeFinalEntries(
  transaction: GroupedTransaction,
  desiredState: PendingDesiredState,
): LedgerIntentEntry[] {
  const entries: LedgerIntentEntry[] = [];
  const deletedIds = desiredState.deleted_entry_ids || new Set<string>();

  // Get all entry IDs from both transaction and desiredState
  const transactionEntryIds = new Set<string>();
  for (const entry of transaction.entries ?? []) {
    if (!deletedIds.has(entry.id)) {
      transactionEntryIds.add(entry.id);
    }
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
      transaction.entries && transaction.entries.length > 0
        ? transaction.entries.find((e) => e.id === entryId)
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
    // Build entry conditionally - only include fields that were changed or are required
    const mergedEntry: Partial<LedgerIntentEntry> = {
      // Required fields - always include
      entry_id:
        transactionEntry === null
          ? undefined
          : (entryChanges.entry_id ?? baseEntry.entry_id),
      client_ref_id: isTempEntryId(entryId) ? entryId : undefined,
    };

    // coa_id - only include if it exists (canSendLedgerIntent will enforce it's required)
    const coaId =
      entryChanges.coa_id !== undefined
        ? entryChanges.coa_id
        : baseEntry.coa_id;
    if (coaId !== undefined) {
      mergedEntry.coa_id = coaId;
    }

    // Fields that merge baseEntry + entryChanges (include if either exists)
    const description = resolveNullableField(
      entryChanges.description,
      baseEntry.description,
    );
    if (description !== undefined) {
      mergedEntry.description = description;
    }

    const reference = resolveNullableField(
      entryChanges.reference,
      baseEntry.reference,
    );
    if (reference !== undefined) {
      mergedEntry.reference = reference;
    }

    const fsDate = entryChanges.fs_date || baseEntry.fs_date;
    if (fsDate !== undefined) {
      mergedEntry.fs_date = fsDate;
    }

    const contactId = resolveNullableField(
      entryChanges.contact_id,
      baseEntry.contact_id,
    );
    if (contactId !== undefined) {
      mergedEntry.contact_id = contactId;
    }

    if (entryChanges.contact_type !== undefined) {
      mergedEntry.contact_type = resolveNullableField(
        entryChanges.contact_type,
        undefined,
      );
    }

    const projectId = resolveNullableField(
      entryChanges.project_id,
      baseEntry.project_id,
    );
    if (projectId !== undefined) {
      mergedEntry.project_id = projectId;
    }

    const sourceAmount = entryChanges.source_amount ?? baseEntry.source_amount;
    if (sourceAmount !== undefined) {
      mergedEntry.source_amount = sourceAmount;
    }

    // Fields that should ONLY be included if explicitly changed (not from baseEntry)
    Object.assign(
      mergedEntry,
      includeIfChanged(
        entryChanges,
        'human_reviewed',
        entryChanges.human_reviewed,
      ),
      includeIfChanged(entryChanges, 'review_notes', entryChanges.review_notes),
      includeIfChanged(entryChanges, 'file_id', entryChanges.file_id),
      includeIfChanged(entryChanges, 'file_name', entryChanges.file_name),
      includeIfChanged(entryChanges, 'metadata', entryChanges.metadata),
    );

    // Include entry (canSendLedgerIntent will validate coa_id is present)
    entries.push(mergedEntry as LedgerIntentEntry);
  }

  return entries;
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
  const entries = computeFinalEntries(transaction, desiredState);

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
 * Checks if transaction has required COA before sending and is balanced.
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

  // Use computeFinalEntries as single source of truth
  const finalEntries = computeFinalEntries(txn, desiredState);

  // Validate all entries have COA (required field)
  for (const entry of finalEntries) {
    if (!entry.coa_id) {
      return false;
    }
  }

  // Validate transaction is balanced
  const entriesTotal = finalEntries.reduce(
    (sum, e) => sum + (e.source_amount ?? 0),
    0,
  );

  const isBalanced = Math.abs(entriesTotal + txn.bankAmount) < 0.0001;

  if (!isBalanced) {
    return false; // Silently return - don't send unbalanced transactions
  }

  return true;
}

/**
 * Helper: Updates React Query cache with a persisted transaction.
 */
function updateQueryCacheWithTransaction(
  persistedTransaction: GroupedTransaction,
  queryClient: ReturnType<typeof useQueryClient>,
  bankTransactionId: string,
): void {
  const queryCache = queryClient.getQueryCache();
  const relevantQueries = queryCache.findAll({
    predicate: (query) => query.queryKey[0] === 'categorization-transactions',
  });

  for (const query of relevantQueries) {
    queryClient.setQueryData(
      query.queryKey,
      (
        oldData:
          | {
              transactions: GroupedTransaction[];
              total: number;
              limit: number;
              offset: number;
            }
          | undefined,
      ) => {
        if (!oldData) return oldData;

        const updatedTransactions = oldData.transactions.map((t) =>
          t.bankTransactionId === bankTransactionId ? persistedTransaction : t,
        );

        return {
          ...oldData,
          transactions: updatedTransactions,
        };
      },
    );
  }
}

/**
 * Hook for managing pending changes and building LedgerIntent directly.
 * This is the new implementation that bypasses the intermediate Intent system.
 */
export function usePendingChangesEmitter() {
  const { companyId } = useSession();
  const queryClient = useQueryClient();
  const sendIntentMutation = useSendCategorizationIntent();

  // Pending desired_state grouped by bankTransactionId
  const desiredStateRef = useRef<Map<string, PendingDesiredState>>(new Map());

  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Store transaction objects by bankTransactionId for retrieval when sending
  const transactionsRef = useRef<Map<string, GroupedTransaction>>(new Map());

  // OBSOLETE: Track last successfully persisted state per entry
  // @deprecated No longer needed - server returns authoritative state directly
  // const lastPersistedStateRef = useRef<
  //   Map<string, Map<string, Partial<LedgerIntentEntry>>>
  // >(new Map()); // Map<bankTransactionId, Map<entryId, persistedState>>

  // OBSOLETE: Store sent state temporarily (cleared after processing)
  // @deprecated No longer needed - server returns authoritative state directly
  // const sentStateCache = useRef<
  //   Map<
  //     string,
  //     {
  //       sentAt: number;
  //       entries: Record<string, Partial<LedgerIntentEntry>>;
  //       deletedIds: Set<string>;
  //       customExchangeRate?: number | null;
  //     }
  //   >
  // >(new Map());

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
        console.error('Cannot send ledger intent', { txn, desiredState });
        return;
      }

      if (!companyId) return;

      // Build LedgerIntent from transaction and pending desired_state
      const ledgerIntent = buildLedgerIntentFromTransaction(txn, desiredState);

      // Track when we send this intent for time-based clearing
      const sendAt = Date.now();

      try {
        const response = await sendIntentMutation.mutateAsync({
          companyId,
          intent: [ledgerIntent],
        });
        console.log({ sendIntentResponse: response });

        if (response.success && response.data?.results?.[0]?.transaction) {
          // Server returned the authoritative persisted transaction state
          const persistedTransactions = response.data.results[0].transaction;
          const grouped = groupCategorizationTransactions(
            persistedTransactions,
          );
          const persistedTransaction = grouped[0]; // Should be single transaction

          if (persistedTransaction) {
            // Get current pending state (may have new changes made after we sent)
            const currentPendingState =
              desiredStateRef.current.get(bankTransactionId);

            // Clear pending entries using time-based logic
            // Keep only entries that were touched after we sent (user made new changes)
            if (currentPendingState?.entries) {
              const entriesToKeep: Record<
                string,
                Partial<LedgerIntentEntry>
              > = {};

              for (const [entryId, pendingChanges] of Object.entries(
                currentPendingState.entries,
              )) {
                // Extract _touchedAt timestamp (internal field, not sent to backend)
                const touchedAt = (pendingChanges as any)?._touchedAt || 0;

                // Find matching entry in persisted transaction by ID, ledgerEntryId, or client_ref_id
                const persistedEntry = persistedTransaction.entries?.find(
                  (e) =>
                    e.id === entryId ||
                    e.ledgerEntryId === entryId ||
                    e.client_ref_id === entryId, // Exact match via client_ref_id
                );

                if (persistedEntry) {
                  // Entry was persisted - use time-based clearing
                  // If user touched it before/at send time, clear it (server has authoritative state)
                  // If user touched it after send time, keep it (user made new changes after sending)
                  if (touchedAt > sendAt) {
                    // Keep - user made changes after sending
                    // Update entryId to use real ID if it was a temp ID
                    const realEntryId =
                      persistedEntry.id ||
                      persistedEntry.ledgerEntryId ||
                      entryId;
                    entriesToKeep[realEntryId] = pendingChanges;
                  }
                  // If touchedAt <= sendAt, don't add to entriesToKeep (clear it)
                } else {
                  // Entry not in persisted transaction - might be a new entry added after sending
                  entriesToKeep[entryId] = pendingChanges;
                }
              }

              currentPendingState.entries = entriesToKeep;

              // Clear entire pending state if empty
              if (
                Object.keys(entriesToKeep).length === 0 &&
                !currentPendingState.custom_exchange_rate &&
                (!currentPendingState.deleted_entry_ids ||
                  currentPendingState.deleted_entry_ids.size === 0)
              ) {
                desiredStateRef.current.delete(bankTransactionId);
              }
            } else {
              // No pending state - clear it
              desiredStateRef.current.delete(bankTransactionId);
            }

            // Update cache with persisted transaction (authoritative server state)
            updateQueryCacheWithTransaction(
              persistedTransaction,
              queryClient,
              bankTransactionId,
            );

            // Update stored transaction reference
            transactionsRef.current.set(
              bankTransactionId,
              persistedTransaction,
            );
          }
        } else if (response.success) {
          // Success but no transaction in response (shouldn't happen, but handle gracefully)
          // Clear pending state since server processed it successfully
          desiredStateRef.current.delete(bankTransactionId);
        } else {
          toast.error(
            response.message || 'Failed to save transaction updates',
            {
              duration: Infinity,
              closeButton: true,
            },
          );
          // Don't clear state on failure - keep for retry
        }

        debounceTimersRef.current.delete(bankTransactionId);
      } catch (err) {
        toast.error('Failed to save transaction updates', {
          duration: Infinity,
          closeButton: true,
        });
        // Keep changes in pending for retry (state already exists in desiredStateRef)
      }
    },
    [companyId, sendIntentMutation, queryClient],
  );

  /**
   * Flush queued changes when connection returns.
   * Iterates all pending transactions in desiredStateRef and attempts to send them.
   * If offline, requests will fail and state will remain for retry.
   */
  const flushOfflineQueue = useCallback(async () => {
    const transactionIds = Array.from(desiredStateRef.current.keys());

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

      // Merge changes into entry and track when it was touched
      const existing = desiredState.entries[entryId] || {};
      desiredState.entries[entryId] = {
        ...existing,
        ...changes,
        _touchedAt: Date.now(), // Track when touched for time-based clearing
      } as Partial<LedgerIntentEntry> & { _touchedAt: number };

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

  /**
   * Delete an entry from the pending desired_state.
   * Tracks deleted entry IDs to exclude them from the intent.
   */
  const deleteEntry = useCallback(
    (bankTransactionId: string, entryId: string) => {
      if (!desiredStateRef.current.has(bankTransactionId)) {
        desiredStateRef.current.set(bankTransactionId, {});
      }

      const desiredState = desiredStateRef.current.get(bankTransactionId)!;

      // Initialize deleted_entry_ids if not exists
      if (!desiredState.deleted_entry_ids) {
        desiredState.deleted_entry_ids = new Set<string>();
      }

      // Add entry to deleted set
      desiredState.deleted_entry_ids.add(entryId);

      // Remove from entries if it exists there
      if (desiredState.entries?.[entryId]) {
        delete desiredState.entries[entryId];
      }

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

  /**
   * Get last persisted state for an entry.
   * @deprecated No longer needed - server returns authoritative state directly
   */
  // const getLastPersistedState = useCallback(
  //   (
  //     bankTransactionId: string,
  //     entryId: string,
  //   ): Partial<LedgerIntentEntry> | undefined => {
  //     return lastPersistedStateRef.current.get(bankTransactionId)?.get(entryId);
  //   },
  //   [],
  // );

  /**
   * Get summary of all pending changes across all transactions.
   */
  const getPendingTransactionsSummary = useCallback((): {
    count: number;
    transactions: Array<{
      bankTransactionId: string;
      hasEntryChanges: boolean;
      hasDeletedEntries: boolean;
      hasExchangeRateChange: boolean;
    }>;
  } => {
    const transactions: Array<{
      bankTransactionId: string;
      hasEntryChanges: boolean;
      hasDeletedEntries: boolean;
      hasExchangeRateChange: boolean;
    }> = [];

    desiredStateRef.current.forEach((desiredState, bankTransactionId) => {
      const hasEntryChanges =
        desiredState.entries && Object.keys(desiredState.entries).length > 0;
      const hasDeletedEntries =
        desiredState.deleted_entry_ids &&
        desiredState.deleted_entry_ids.size > 0;
      const hasExchangeRateChange =
        desiredState.custom_exchange_rate !== undefined;

      if (hasEntryChanges || hasDeletedEntries || hasExchangeRateChange) {
        transactions.push({
          bankTransactionId,
          hasEntryChanges: hasEntryChanges || false,
          hasDeletedEntries: hasDeletedEntries || false,
          hasExchangeRateChange: hasExchangeRateChange || false,
        });
      }
    });

    return {
      count: transactions.length,
      transactions,
    };
  }, []);

  const hasAnyPendingChanges = useCallback((): boolean => {
    return desiredStateRef.current.size > 0;
  }, []);

  const hasPendingChanges = useCallback(
    (bankTransactionId: string): boolean => {
      const desiredState = desiredStateRef.current.get(bankTransactionId);
      return !!(
        desiredState &&
        ((desiredState.entries &&
          Object.keys(desiredState.entries).length > 0) ||
          (desiredState.deleted_entry_ids &&
            desiredState.deleted_entry_ids.size > 0) ||
          desiredState.custom_exchange_rate !== undefined)
      );
    },
    [],
  );

  return {
    updateEntry,
    updateExchangeRate,
    deleteEntry,
    sendPendingChanges,
    flushOfflineQueue,
    handleOnline,
    registerTransaction,
    getPendingTransactionsSummary,
    hasAnyPendingChanges,
    hasPendingChanges,
  };
}

/**
 * Hook to fetch and group categorization transactions for the categorization engine.
 * This is a local version that keeps the React Query logic co-located with the intent emitter.
 * Other parts of the app can use the version in @/modules/accounting/categorization/model/hooks.
 */
export function useCategorizationTransactions(
  params: GetCategorizationTransactionsParams,
) {
  return useQuery({
    queryKey: [
      'categorization-transactions',
      params.companyId,
      params.dateFrom,
      params.dateTo,
      params.status,
      params.limit,
      params.offset,
    ],
    queryFn: async () => {
      const response = await fetchCategorizationTransactions(params);
      const grouped = groupCategorizationTransactions(response.transactions);
      return {
        transactions: grouped,
        total: response.total,
        limit: response.limit,
        offset: response.offset,
      };
    },
    enabled: !!params.companyId && !!params.dateFrom && !!params.dateTo,
  });
}

/**
 * Custom hook that provides functions to update fields on a GroupedTransaction
 * by tracking pending desired_state and building LedgerIntent directly.
 *
 * @param txn - The GroupedTransaction being edited
 * @returns Object containing updateEntry and updateExchangeRate functions
 */
export function useLedgerIntentUpdater(txn: GroupedTransaction) {
  const { updateEntry, updateExchangeRate, deleteEntry, registerTransaction } =
    usePendingChangesEmitter();

  // Register the transaction so it can be retrieved when sending
  // Use bankTransactionId to avoid re-registering on object reference changes
  useEffect(() => {
    registerTransaction(txn);
  }, [txn.bankTransactionId, registerTransaction]);

  return {
    updateEntry: (entryId: string, changes: Partial<LedgerIntentEntry>) => {
      updateEntry(txn.bankTransactionId, entryId, changes);
    },
    updateExchangeRate: (rate: number | null) => {
      updateExchangeRate(txn.bankTransactionId, rate);
    },
    deleteEntry: (entryId: string) => {
      deleteEntry(txn.bankTransactionId, entryId);
    },
  };
}
