/**
 * ⚠️ CRITICAL: getEntriesUI() Array Immutability Requirement ⚠️
 *
 * getEntriesUI() MUST ALWAYS return a NEW array reference.
 * EntryUI objects are MUTABLE (stored in refs, mutated in place).
 * The array container is NOT mutable - it must be recreated on each call.
 *
 * DO NOT:
 * - Cache or memoize the array returned by getEntriesUI()
 * - Store the array in state or refs
 * - Attempt to "optimize" by reusing the array reference
 *
 * If this is violated, React will not detect changes when EntryUI objects
 * are mutated, and the UI will not update correctly.
 *
 * This is NOT optional documentation - this is a REQUIRED constraint.
 * Violating this breaks the entire model.
 */
import type {
  LedgerIntent,
  LedgerIntentEntry,
} from '@accountable-books/contracts/schema';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import { useSession } from '@/app/session';
import { toYMD } from '@/shared/utils/date-utils';

import { groupCategorizationTransactions } from '../lib/transform';
import { useSendCategorizationIntent } from './hooks';
import type {
  CategorizationTransactionFile,
  GroupedTransaction,
} from './types';

const TRANSACTION_DEBOUNCE_MS = 1000;
const DELETED_ENTRY_CLEANUP_MS = 5000;

/**
 * Type for entry objects in GroupedTransaction.entries array
 */
type GroupedTransactionEntry = GroupedTransaction & {
  ledgerEntryId: string | null;
  candidateLineId: string | null;
  reviewNotes: string | null;
  explanation: string | null;
  files: Array<CategorizationTransactionFile>;
};

/**
 * UI representation of entry with stable uiEntryId identity.
 * These objects are MUTABLE and stored in refs.
 */
export interface EntryUI {
  // Stable UI identity - NEVER changes after creation
  // This is the React key - must be immutable
  uiEntryId: string;

  // Backend identity - null for new entries, populated after persistence
  // This IS the ledger entry ID from backend
  ledgerEntryId: string | null;

  candidateLineId: string | null;
  coa_id: string | null;
  description: string | null;
  reference: string | null;
  fs_date: string | null;
  contact_id: string | null;
  project_id: string | null;
  source_amount: number | null;
  review_notes: string | null;
  files: Array<CategorizationTransactionFile>;
  explanation: string | null;

  updatedAt?: string;
  version?: number;

  deleted?: boolean;
  deletedAt?: number;
  // Flag to distinguish user-initiated deletion from auto-deletion (missing from server)
  // If true, entry should not be auto-undeleted even if it appears in server response
  deletedByUser?: boolean;
}

/**
 * Pending changes keyed by uiEntryId.
 */
type PendingEntryChanges = Partial<LedgerIntentEntry>;

type PendingDesiredState = {
  entries?: Record<string, PendingEntryChanges>; // uiEntryId -> changes
  deleted_ui_entry_ids?: Set<string>; // keyed by uiEntryId
  custom_exchange_rate?: number | null;
};

function isEntryDirty(
  uiEntryId: string,
  pendingEntries?: Record<string, PendingEntryChanges>,
): boolean {
  const changes = pendingEntries?.[uiEntryId];
  return changes !== undefined && Object.keys(changes).length > 0;
}

/**
 * Determines if an entry is effectively deleted, considering both deletion systems:
 * 1. Explicit deletion: entry is in deleted_ui_entry_ids set (user clicked delete)
 * 2. Auto-deletion: entry.deleted === true (missing from server response)
 *
 * Both systems exist because:
 * - deleted_ui_entry_ids tracks user intent (needed for sending deletion to backend)
 * - entry.deleted tracks local state (needed for UI filtering and lifecycle management)
 *
 * An entry is effectively deleted if either condition is true.
 */
function isEntryEffectivelyDeleted(
  entry: EntryUI,
  desiredState?: PendingDesiredState,
): boolean {
  // Check explicit deletion (user action)
  if (desiredState?.deleted_ui_entry_ids?.has(entry.uiEntryId)) {
    return true;
  }
  // Check auto-deletion (missing from server)
  if (entry.deleted === true) {
    return true;
  }
  return false;
}

function resolveNullableField<T>(
  pendingValue: T | null | undefined,
  fallback: T | null | undefined,
): T | null {
  if (pendingValue === null) return null;
  return pendingValue ?? fallback ?? null;
}

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

function getLedgerEntryIdFromServerEntry(
  entry: GroupedTransactionEntry,
): string {
  if (entry.ledgerEntryId) return entry.ledgerEntryId;
  return entry.id;
}

/**
 * Generates a stable UI-only identifier for entries.
 *
 * IMPORTANT SCOPE CLARIFICATION:
 * - These IDs are PAGE-SCOPED (per bankTransactionId), NOT globally unique
 * - The backend must NOT treat client_ref_id as globally unique
 * - Maps (entryMapRef, ledgerEntryIdToUiEntryIdRef) are scoped by bankTransactionId for this reason
 * - Each transaction view has its own isolated namespace of uiEntryIds
 *
 * This ensures:
 * - No collisions across different transaction views
 * - IDs can be reused across page navigation
 * - Backend reconciliation is scoped to a single transaction's entries
 */
function generateUiEntryId(): string {
  return `ui-${uuidv4()}`;
}

function createEntryUIFromServer(
  entry: GroupedTransactionEntry,
  ledgerEntryIdToUiEntryId: Map<string, string>,
): EntryUI {
  const ledgerEntryId = getLedgerEntryIdFromServerEntry(entry);
  const existingUiEntryId = ledgerEntryIdToUiEntryId.get(ledgerEntryId);
  const uiEntryId = existingUiEntryId ?? generateUiEntryId();
  if (!existingUiEntryId) {
    ledgerEntryIdToUiEntryId.set(ledgerEntryId, uiEntryId);
  }

  return {
    uiEntryId,
    ledgerEntryId,
    candidateLineId: entry.candidateLineId ?? null,
    coa_id: entry.coaId ?? null,
    description: entry.description ?? null,
    reference: entry.reference ?? null,
    fs_date: entry.fsDate ?? entry.date ?? null,
    contact_id: entry.contactId ?? null,
    project_id: entry.projectId ?? null,
    source_amount: entry.nativeAmount ?? null,
    review_notes: entry.reviewNotes ?? null,
    files: entry.files || [],
    explanation: entry.explanation ?? null,
  };
}

function mergeServerEntryIntoLocal(
  localEntry: EntryUI,
  serverEntry: GroupedTransactionEntry,
  pendingEntries?: Record<string, PendingEntryChanges>,
): void {
  const dirty = (field: keyof PendingEntryChanges) =>
    pendingEntries?.[localEntry.uiEntryId] &&
    field in pendingEntries[localEntry.uiEntryId];

  const serverLedgerEntryId = getLedgerEntryIdFromServerEntry(serverEntry);
  if (!localEntry.ledgerEntryId) {
    localEntry.ledgerEntryId = serverLedgerEntryId;
  }

  if (!dirty('coa_id')) {
    localEntry.coa_id = serverEntry.coaId ?? null;
  }
  if (!dirty('description')) {
    localEntry.description = serverEntry.description ?? null;
  }
  if (!dirty('reference')) {
    localEntry.reference = serverEntry.reference ?? null;
  }
  if (!dirty('fs_date')) {
    localEntry.fs_date = serverEntry.fsDate ?? serverEntry.date ?? null;
  }
  if (!dirty('contact_id')) {
    localEntry.contact_id = serverEntry.contactId ?? null;
  }
  if (!dirty('project_id')) {
    localEntry.project_id = serverEntry.projectId ?? null;
  }
  if (!dirty('source_amount')) {
    localEntry.source_amount = serverEntry.nativeAmount ?? null;
  }
  if (!dirty('review_notes')) {
    localEntry.review_notes = serverEntry.reviewNotes ?? null;
  }

  localEntry.candidateLineId = serverEntry.candidateLineId ?? null;
  localEntry.files = serverEntry.files || [];
  localEntry.explanation = serverEntry.explanation ?? null;

  // Only clear deleted flag if entry is in server response AND was not deleted by user
  // If user explicitly deleted it, preserve deleted=true even if server has the entry
  // If entry was auto-deleted (missing from server), and now appears in server, undelete it
  if (localEntry.deleted && !localEntry.deletedByUser) {
    // Entry was auto-deleted (not by user), and server now has it - undelete
    localEntry.deleted = false;
    localEntry.deletedAt = undefined;
    localEntry.deletedByUser = undefined;
  }
  // If deletedByUser is true, keep deleted=true (don't mutate - user intent takes precedence)
  // If entry is not deleted, no change needed
}

function mergeServerEntriesIntoLocal(
  entryMap: Map<string, EntryUI>,
  serverEntries: GroupedTransactionEntry[],
  ledgerEntryIdToUiEntryId: Map<string, string>,
  pendingEntries?: Record<string, PendingEntryChanges>,
): void {
  const seenUiEntryIds = new Set<string>();

  for (const serverEntry of serverEntries) {
    const ledgerEntryId = getLedgerEntryIdFromServerEntry(serverEntry);
    const uiEntryId = ledgerEntryIdToUiEntryId.get(ledgerEntryId);

    if (!uiEntryId) {
      const newEntry = createEntryUIFromServer(
        serverEntry,
        ledgerEntryIdToUiEntryId,
      );
      entryMap.set(newEntry.uiEntryId, newEntry);
      seenUiEntryIds.add(newEntry.uiEntryId);
      continue;
    }

    const localEntry = entryMap.get(uiEntryId);
    if (!localEntry) {
      const newEntry = createEntryUIFromServer(
        serverEntry,
        ledgerEntryIdToUiEntryId,
      );
      entryMap.set(newEntry.uiEntryId, newEntry);
      seenUiEntryIds.add(newEntry.uiEntryId);
      continue;
    }

    mergeServerEntryIntoLocal(localEntry, serverEntry, pendingEntries);
    seenUiEntryIds.add(uiEntryId);
  }

  const now = Date.now();
  for (const [uiEntryId, entry] of entryMap.entries()) {
    if (seenUiEntryIds.has(uiEntryId)) continue;

    if (isEntryDirty(uiEntryId, pendingEntries)) {
      continue;
    }

    if (!entry.deleted) {
      // Auto-delete entry (not by user, just missing from server)
      entry.deleted = true;
      entry.deletedAt = now;
      entry.deletedByUser = false; // Explicitly mark as auto-deletion
    } else if (
      entry.deletedAt !== undefined &&
      now - entry.deletedAt > DELETED_ENTRY_CLEANUP_MS
    ) {
      entryMap.delete(uiEntryId);
    }
  }
}

function computeFinalEntries(
  entries: EntryUI[],
  desiredState: PendingDesiredState,
): LedgerIntentEntry[] {
  const finalEntries: LedgerIntentEntry[] = [];

  for (const entry of entries) {
    // Skip effectively deleted entries (uses centralized deletion logic)
    if (isEntryEffectivelyDeleted(entry, desiredState)) {
      continue;
    }

    const entryChanges = desiredState.entries?.[entry.uiEntryId] || {};

    const mergedEntry: Partial<LedgerIntentEntry> = {
      entry_id: entry.ledgerEntryId || undefined,
      // client_ref_id is page-scoped (per bankTransactionId), not globally unique
      // Backend uses it for reconciliation within a single transaction's entries only
      // See generateUiEntryId() documentation for scope details
      // Backend accepts client_ref_id in metadata for all entries (stored via metadata.client_ref_id)
      client_ref_id: entry.uiEntryId,
    };

    const coaId = entryChanges.coa_id ?? entry.coa_id;
    if (coaId !== undefined && coaId !== null) {
      mergedEntry.coa_id = coaId;
    }

    if (entryChanges.description !== undefined) {
      mergedEntry.description = entryChanges.description ?? undefined;
    } else if (entry.description !== undefined && entry.description !== null) {
      mergedEntry.description = entry.description ?? undefined;
    }

    if (entryChanges.reference !== undefined) {
      mergedEntry.reference = entryChanges.reference ?? undefined;
    } else if (entry.reference !== undefined && entry.reference !== null) {
      mergedEntry.reference = entry.reference ?? undefined;
    }

    const fsDate = entryChanges.fs_date ?? entry.fs_date;
    if (fsDate !== undefined && fsDate !== null) {
      mergedEntry.fs_date = toYMD(new Date(fsDate));
    }

    if (entryChanges.contact_id !== undefined) {
      mergedEntry.contact_id = entryChanges.contact_id ?? undefined;
    } else if (entry.contact_id !== undefined && entry.contact_id !== null) {
      mergedEntry.contact_id = entry.contact_id ?? undefined;
    }

    const projectId = resolveNullableField(
      entryChanges.project_id,
      entry.project_id,
    );
    if (projectId !== undefined) {
      mergedEntry.project_id = projectId;
    }

    const sourceAmount = entryChanges.source_amount ?? entry.source_amount;
    if (sourceAmount !== undefined && sourceAmount !== null) {
      mergedEntry.source_amount = sourceAmount;
    }

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

    finalEntries.push(mergedEntry as LedgerIntentEntry);
  }

  return finalEntries;
}

function buildLedgerIntentFromEntries(
  transaction: GroupedTransaction,
  desiredState: PendingDesiredState,
  entries: EntryUI[],
): LedgerIntent {
  const finalEntries = computeFinalEntries(entries, desiredState);

  const finalDesiredState: LedgerIntent['desired_state'] = {};
  if (desiredState.custom_exchange_rate !== undefined) {
    finalDesiredState.custom_exchange_rate = desiredState.custom_exchange_rate;
  }
  if (finalEntries.length > 0) {
    finalDesiredState.entries = finalEntries;
  }

  return {
    intent_id: uuidv4(),
    bank_transaction_id: transaction.bankTransactionId,
    ledger_transaction_id: transaction.ledgerTransactionId || undefined,
    candidate_id: transaction.candidateId || undefined,
    desired_state:
      Object.keys(finalDesiredState).length > 0 ? finalDesiredState : undefined,
    timestamp: new Date().toISOString(),
  };
}

function canSendLedgerIntent(
  txn: GroupedTransaction,
  desiredState: PendingDesiredState,
  entries: EntryUI[],
): {
  ok: boolean;
  missingCoa: boolean;
  isUnbalanced?: boolean;
  missingAmount?: boolean;
  errorKey?: string;
} {
  if (txn.status === 'uncategorized') {
    const hasCoaInChanges = desiredState.entries
      ? Object.values(desiredState.entries).some((entry) => entry.coa_id)
      : false;

    if (!txn.coaId && !hasCoaInChanges) {
      return { ok: false, missingCoa: true };
    }
  }

  const finalEntries = computeFinalEntries(entries, desiredState);

  for (const entry of finalEntries) {
    if (!entry.coa_id) {
      return { ok: false, missingCoa: false };
    }
  }

  // Check for missing amounts in entries
  const hasMissingAmount = finalEntries.some(
    (entry) =>
      entry.source_amount === undefined || entry.source_amount === null,
  );

  const entriesTotal = finalEntries.reduce(
    (sum, e) => sum + (e.source_amount ?? 0),
    0,
  );

  const isBalanced = Math.abs(entriesTotal + txn.bankAmount) < 0.0001;
  if (!isBalanced) {
    const errorKey = hasMissingAmount ? 'missing_amount' : 'unbalanced';
    return {
      ok: false,
      missingCoa: false,
      isUnbalanced: true,
      missingAmount: hasMissingAmount,
      errorKey,
    };
  }

  // For missing COA
  for (const entry of finalEntries) {
    if (!entry.coa_id) {
      return {
        ok: false,
        missingCoa: true,
        errorKey: 'missing_coa',
      };
    }
  }

  return { ok: true, missingCoa: false };
}

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
    queryClient.setQueryData(query.queryKey, (oldData: any) => {
      if (!oldData) return oldData;

      const updateTransactions = (transactions: GroupedTransaction[]) =>
        transactions.map((t) =>
          t.bankTransactionId === bankTransactionId ? persistedTransaction : t,
        );

      if (Array.isArray(oldData.pages)) {
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            transactions: updateTransactions(page.transactions || []),
          })),
        };
      }

      if (Array.isArray(oldData.transactions)) {
        return {
          ...oldData,
          transactions: updateTransactions(oldData.transactions),
        };
      }

      return oldData;
    });
  }
}

export function useLedgerIntentManagerV2() {
  const { companyId } = useSession();
  const queryClient = useQueryClient();
  const sendIntentMutation = useSendCategorizationIntent();

  const desiredStateRef = useRef<Map<string, PendingDesiredState>>(new Map());
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  /**
   * Raw server snapshot of transactions - NEVER used as UI state.
   *
   * This ref stores the latest raw GroupedTransaction data from the server.
   * It is used ONLY for:
   * - Building LedgerIntent (needs transaction-level fields like bankTransactionId, dates)
   * - Updating React Query cache with server responses
   *
   * CRITICAL INVARIANT: This is NOT UI state. Do not read from this for rendering.
   * EntryUI objects in entryMapRef are the source of truth for UI display.
   *
   * This ref may be overwritten unconditionally on refetch/register because:
   * - It represents the server's view, not local edits
   * - Local edits are tracked separately in desiredStateRef
   * - UI state is derived from entryMapRef + desiredStateRef, not this ref
   */
  const transactionsRef = useRef<Map<string, GroupedTransaction>>(new Map());
  const inFlightRequestsRef = useRef<Set<string>>(new Set());
  const entryMapRef = useRef<Map<string, Map<string, EntryUI>>>(new Map());

  // Track last validation error per transaction to avoid spamming toasts
  const lastValidationErrorRef = useRef<Map<string, string>>(new Map());
  const ledgerEntryIdToUiEntryIdRef = useRef<Map<string, Map<string, string>>>(
    new Map(),
  );

  const getEntryMap = useCallback((bankTransactionId: string) => {
    let entryMap = entryMapRef.current.get(bankTransactionId);
    if (!entryMap) {
      entryMap = new Map();
      entryMapRef.current.set(bankTransactionId, entryMap);
    }
    return entryMap;
  }, []);

  const getLedgerEntryIdMap = useCallback((bankTransactionId: string) => {
    let map = ledgerEntryIdToUiEntryIdRef.current.get(bankTransactionId);
    if (!map) {
      map = new Map();
      ledgerEntryIdToUiEntryIdRef.current.set(bankTransactionId, map);
    }
    return map;
  }, []);

  const resolveUiEntryId = useCallback(
    (bankTransactionId: string, entryId: string): string | null => {
      const entryMap = entryMapRef.current.get(bankTransactionId);
      if (entryMap?.has(entryId)) {
        return entryId;
      }

      const ledgerMap =
        ledgerEntryIdToUiEntryIdRef.current.get(bankTransactionId);
      if (ledgerMap?.has(entryId)) {
        return ledgerMap.get(entryId) ?? null;
      }

      if (entryMap) {
        for (const entry of entryMap.values()) {
          if (entry.ledgerEntryId === entryId) {
            return entry.uiEntryId;
          }
        }

        // Intentionally no fallback heuristic here - fail loudly instead of guessing
        // Fallback heuristics can misroute edits when:
        // - Multiple entries collapse to one (deletions, refetch timing)
        // - Delayed events reference old ledgerEntryIds
        // UI continuity requires correct resolution, not convenience guessing
      }

      return null;
    },
    [],
  );

  const registerTransaction = useCallback(
    (transaction: GroupedTransaction) => {
      const bankTransactionId = transaction.bankTransactionId;
      // Overwrite transactionsRef unconditionally - it's raw server snapshot, not UI state
      // See transactionsRef declaration for invariant documentation
      transactionsRef.current.set(bankTransactionId, transaction);

      const entryMap = getEntryMap(bankTransactionId);
      const ledgerEntryIdMap = getLedgerEntryIdMap(bankTransactionId);
      const pendingState = desiredStateRef.current.get(bankTransactionId);

      if (entryMap.size > 0) {
        if (transaction.entries?.length) {
          mergeServerEntriesIntoLocal(
            entryMap,
            transaction.entries,
            ledgerEntryIdMap,
            pendingState?.entries,
          );
        }
        return;
      }

      if (transaction.entries?.length) {
        for (const entry of transaction.entries) {
          const uiEntry = createEntryUIFromServer(entry, ledgerEntryIdMap);
          entryMap.set(uiEntry.uiEntryId, uiEntry);
        }
      }
    },
    [getEntryMap, getLedgerEntryIdMap],
  );

  const getEntriesUI = useCallback((bankTransactionId: string): EntryUI[] => {
    const entryMap = entryMapRef.current.get(bankTransactionId);
    if (!entryMap) return [];
    const pendingState = desiredStateRef.current.get(bankTransactionId);
    return Array.from(entryMap.values()).filter((entry) => {
      // Filter out effectively deleted entries unless they are dirty (preserve for undo/re-edit)
      if (isEntryEffectivelyDeleted(entry, pendingState)) {
        return isEntryDirty(entry.uiEntryId, pendingState?.entries);
      }
      return true;
    });
  }, []);

  const addEntry = useCallback(
    (bankTransactionId: string, defaults?: Partial<EntryUI>): string => {
      const entryMap = getEntryMap(bankTransactionId);
      const uiEntryId = generateUiEntryId();
      const entry: EntryUI = {
        uiEntryId,
        ledgerEntryId: null,
        candidateLineId: null,
        coa_id: defaults?.coa_id ?? null,
        description: defaults?.description ?? null,
        reference: defaults?.reference ?? null,
        fs_date: defaults?.fs_date ?? null,
        contact_id: defaults?.contact_id ?? null,
        project_id: defaults?.project_id ?? null,
        source_amount: defaults?.source_amount ?? null,
        review_notes: defaults?.review_notes ?? null,
        files: defaults?.files ?? [],
        explanation: defaults?.explanation ?? null,
      };
      entryMap.set(uiEntryId, entry);
      // NOTE: An added entry is ephemeral until the user edits a field.
      // We intentionally do NOT initialize desiredState.entries here because:
      // - Entry exists in UI (entryMap) for immediate rendering
      // - No pending state is tracked until user makes an edit
      // - If user navigates away before editing, entry disappears (by design)
      // This is intentional behavior - don't "fix" by initializing pending state here
      return uiEntryId;
    },
    [getEntryMap],
  );

  const updateEntry = useCallback(
    (
      bankTransactionId: string,
      entryId: string,
      changes: Partial<LedgerIntentEntry>,
    ) => {
      const uiEntryId = resolveUiEntryId(bankTransactionId, entryId);
      if (!uiEntryId) return;

      const entryMap = getEntryMap(bankTransactionId);
      const entry = entryMap.get(uiEntryId);
      if (!entry) return;

      if (!desiredStateRef.current.has(bankTransactionId)) {
        desiredStateRef.current.set(bankTransactionId, {});
      }
      const desiredState = desiredStateRef.current.get(bankTransactionId)!;
      if (!desiredState.entries) {
        desiredState.entries = {};
      }
      const existing = desiredState.entries[uiEntryId] || {};
      desiredState.entries[uiEntryId] = { ...existing, ...changes };

      if (changes.coa_id !== undefined) entry.coa_id = changes.coa_id;
      if (changes.description !== undefined)
        entry.description = changes.description ?? null;
      if (changes.reference !== undefined)
        entry.reference = changes.reference ?? null;
      if (changes.fs_date !== undefined)
        entry.fs_date = changes.fs_date ?? null;
      if (changes.contact_id !== undefined)
        entry.contact_id = changes.contact_id ?? null;
      if (changes.project_id !== undefined)
        entry.project_id = changes.project_id ?? null;
      if (changes.source_amount !== undefined)
        entry.source_amount = changes.source_amount ?? null;
      if (changes.review_notes !== undefined)
        entry.review_notes = changes.review_notes ?? null;

      const existingTimer = debounceTimersRef.current.get(bankTransactionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      debounceTimersRef.current.set(
        bankTransactionId,
        setTimeout(() => {
          sendPendingChanges(bankTransactionId);
        }, TRANSACTION_DEBOUNCE_MS),
      );
    },
    [getEntryMap, resolveUiEntryId],
  );

  const updateExchangeRate = useCallback(
    (bankTransactionId: string, rate: number | null) => {
      if (!desiredStateRef.current.has(bankTransactionId)) {
        desiredStateRef.current.set(bankTransactionId, {});
      }
      const desiredState = desiredStateRef.current.get(bankTransactionId)!;
      desiredState.custom_exchange_rate = rate;
      const existingTimer = debounceTimersRef.current.get(bankTransactionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      debounceTimersRef.current.set(
        bankTransactionId,
        setTimeout(() => {
          sendPendingChanges(bankTransactionId);
        }, TRANSACTION_DEBOUNCE_MS),
      );
    },
    [],
  );

  const deleteEntry = useCallback(
    (bankTransactionId: string, entryId: string) => {
      const uiEntryId = resolveUiEntryId(bankTransactionId, entryId);
      if (!uiEntryId) return;

      const entryMap = getEntryMap(bankTransactionId);
      const entry = entryMap.get(uiEntryId);
      if (!entry) return;

      if (!desiredStateRef.current.has(bankTransactionId)) {
        desiredStateRef.current.set(bankTransactionId, {});
      }
      const desiredState = desiredStateRef.current.get(bankTransactionId)!;
      if (!desiredState.deleted_ui_entry_ids) {
        desiredState.deleted_ui_entry_ids = new Set<string>();
      }

      if (entry.ledgerEntryId) {
        desiredState.deleted_ui_entry_ids.add(uiEntryId);
      } else {
        entryMap.delete(uiEntryId);
        return;
      }

      if (desiredState.entries?.[uiEntryId]) {
        delete desiredState.entries[uiEntryId];
      }
      entry.deleted = true;
      entry.deletedAt = Date.now();
      entry.deletedByUser = true; // Mark as user-initiated deletion
    },
    [getEntryMap, resolveUiEntryId],
  );

  const sendPendingChanges = useCallback(
    async (bankTransactionId: string) => {
      if (inFlightRequestsRef.current.has(bankTransactionId)) {
        return;
      }

      const txn = transactionsRef.current.get(bankTransactionId);
      const desiredState = desiredStateRef.current.get(bankTransactionId);
      const entryMap = entryMapRef.current.get(bankTransactionId);

      if (!txn || !desiredState || !entryMap) {
        return;
      }

      const hasEntryChanges =
        desiredState.entries && Object.keys(desiredState.entries).length > 0;
      const hasDeletedEntries =
        desiredState.deleted_ui_entry_ids &&
        desiredState.deleted_ui_entry_ids.size > 0;
      const onlyExchangeRateChange =
        !hasEntryChanges &&
        !hasDeletedEntries &&
        desiredState.custom_exchange_rate !== undefined;

      const entries = Array.from(entryMap.values());

      const sendCheck = canSendLedgerIntent(txn, desiredState, entries);
      if (!onlyExchangeRateChange && !sendCheck.ok) {
        if (txn.status === 'uncategorized' && sendCheck.missingCoa) {
          return;
        }
        // Generate error message based on what's wrong
        let errorMessage: string;
        if (sendCheck.missingCoa) {
          errorMessage = 'Select an account to save changes';
        } else if (sendCheck.missingAmount) {
          errorMessage = 'Enter an amount to save changes';
        } else if (sendCheck.isUnbalanced) {
          errorMessage =
            'Transaction is not balanced. Adjust amounts to save changes';
        } else {
          errorMessage =
            'Unsaved changes found. Complete required fields to save';
        }
        // Only show toast if error has changed (prevents spam in autosave mode)
        const errorKey = sendCheck.errorKey || 'unknown';
        const lastError = lastValidationErrorRef.current.get(bankTransactionId);

        if (lastError !== errorKey) {
          // Error changed - show new toast
          lastValidationErrorRef.current.set(bankTransactionId, errorKey);
          toast.error(errorMessage, {
            duration: 5000,
            closeButton: true,
          });
        }
        // If error is the same, silently fail (user is still working on fixing it)

        console.error(
          'Transaction must be balanced and have all required fields',
          sendCheck,
        );
        return;
      }

      if (!companyId) return;

      inFlightRequestsRef.current.add(bankTransactionId);

      const sentEntryFields = new Map<string, Set<keyof LedgerIntentEntry>>();
      if (desiredState.entries) {
        for (const [uiEntryId, changes] of Object.entries(
          desiredState.entries,
        )) {
          sentEntryFields.set(
            uiEntryId,
            new Set(Object.keys(changes) as Array<keyof LedgerIntentEntry>),
          );
        }
      }

      const ledgerIntent = buildLedgerIntentFromEntries(
        txn,
        desiredState,
        entries,
      );

      try {
        const response = await sendIntentMutation.mutateAsync({
          companyId,
          intent: [ledgerIntent],
        });

        if (response.success && response.data?.results?.[0]?.transaction) {
          const persistedTransactions = response.data.results[0].transaction;
          const grouped = groupCategorizationTransactions(
            persistedTransactions,
          );
          const persistedTransaction = grouped[0];

          if (persistedTransaction) {
            const ledgerEntryIdMap = getLedgerEntryIdMap(bankTransactionId);
            if (persistedTransaction.entries?.length) {
              mergeServerEntriesIntoLocal(
                entryMap,
                persistedTransaction.entries,
                ledgerEntryIdMap,
                desiredState.entries,
              );
            }

            if (desiredState.deleted_ui_entry_ids) {
              for (const uiEntryId of desiredState.deleted_ui_entry_ids) {
                const entry = entryMap.get(uiEntryId);
                if (entry && !isEntryDirty(uiEntryId, desiredState.entries)) {
                  entryMap.delete(uiEntryId);
                }
              }
              desiredState.deleted_ui_entry_ids.clear();
            }

            if (desiredState.entries) {
              for (const [uiEntryId, fields] of sentEntryFields.entries()) {
                const pendingEntry = desiredState.entries[uiEntryId];
                if (!pendingEntry) continue;
                for (const field of fields) {
                  delete pendingEntry[field];
                }
                if (Object.keys(pendingEntry).length === 0) {
                  delete desiredState.entries[uiEntryId];
                }
              }
            }

            if (
              (!desiredState.entries ||
                Object.keys(desiredState.entries).length === 0) &&
              desiredState.custom_exchange_rate === undefined &&
              (!desiredState.deleted_ui_entry_ids ||
                desiredState.deleted_ui_entry_ids.size === 0)
            ) {
              desiredStateRef.current.delete(bankTransactionId);
            }

            updateQueryCacheWithTransaction(
              persistedTransaction,
              queryClient,
              bankTransactionId,
            );

            transactionsRef.current.set(
              bankTransactionId,
              persistedTransaction,
            );
          }
        } else if (response.success) {
          desiredStateRef.current.delete(bankTransactionId);
        } else {
          toast.error(
            response.message || 'Failed to save transaction updates',
            {
              duration: Infinity,
              closeButton: true,
            },
          );
        }
      } catch (err) {
        toast.error('Failed to save transaction updates', {
          duration: Infinity,
          closeButton: true,
        });
      } finally {
        inFlightRequestsRef.current.delete(bankTransactionId);
        // Clear error state on successful send (or any send attempt)
        lastValidationErrorRef.current.delete(bankTransactionId);
      }
    },
    [companyId, queryClient, sendIntentMutation, getLedgerEntryIdMap],
  );

  const mergeRefetchedTransaction = useCallback(
    (transaction: GroupedTransaction) => {
      const bankTransactionId = transaction.bankTransactionId;
      const entryMap = getEntryMap(bankTransactionId);
      const ledgerEntryIdMap = getLedgerEntryIdMap(bankTransactionId);
      const pendingState = desiredStateRef.current.get(bankTransactionId);

      if (transaction.entries?.length) {
        mergeServerEntriesIntoLocal(
          entryMap,
          transaction.entries,
          ledgerEntryIdMap,
          pendingState?.entries,
        );
      }

      const entries = pendingState?.entries;
      const now = Date.now();
      for (const [uiEntryId, entry] of entryMap.entries()) {
        // Only delete if entry is deleted, not dirty, and grace period has elapsed
        // This prevents flicker when refetches happen during the cleanup window
        if (
          entry.deleted &&
          !isEntryDirty(uiEntryId, entries) &&
          entry.deletedAt !== undefined &&
          now - entry.deletedAt > DELETED_ENTRY_CLEANUP_MS
        ) {
          entryMap.delete(uiEntryId);
        }
      }

      transactionsRef.current.set(bankTransactionId, transaction);
    },
    [getEntryMap, getLedgerEntryIdMap],
  );

  const getPendingExchangeRate = useCallback(
    (bankTransactionId: string): number | null | undefined => {
      return desiredStateRef.current.get(bankTransactionId)
        ?.custom_exchange_rate;
    },
    [],
  );

  const getPendingTransactionsSummary = useCallback(() => {
    let count = 0;
    desiredStateRef.current.forEach((desiredState) => {
      const hasEntries =
        desiredState.entries && Object.keys(desiredState.entries).length > 0;
      const hasDeleted =
        desiredState.deleted_ui_entry_ids &&
        desiredState.deleted_ui_entry_ids.size > 0;
      const hasFx = desiredState.custom_exchange_rate !== undefined;
      if (hasEntries || hasDeleted || hasFx) {
        count += 1;
      }
    });
    return { count };
  }, []);

  const hasAnyPendingChanges = useCallback(() => {
    let hasPending = false;
    desiredStateRef.current.forEach((desiredState) => {
      const hasEntries =
        desiredState.entries && Object.keys(desiredState.entries).length > 0;
      const hasDeleted =
        desiredState.deleted_ui_entry_ids &&
        desiredState.deleted_ui_entry_ids.size > 0;
      const hasFx = desiredState.custom_exchange_rate !== undefined;
      if (hasEntries || hasDeleted || hasFx) {
        hasPending = true;
      }
    });
    return hasPending;
  }, []);

  useEffect(() => {
    return () => {
      debounceTimersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return {
    registerTransaction,
    mergeRefetchedTransaction,
    getEntriesUI,
    addEntry,
    updateEntry,
    deleteEntry,
    updateExchangeRate,
    getPendingExchangeRate,
    getPendingTransactionsSummary,
    hasAnyPendingChanges,
    isEntryDirty: (bankTransactionId: string, uiEntryId: string) => {
      const desiredState = desiredStateRef.current.get(bankTransactionId);
      return isEntryDirty(uiEntryId, desiredState?.entries);
    },
    resolveUiEntryId,
  };
}

type LedgerIntentManagerV2 = ReturnType<typeof useLedgerIntentManagerV2>;

const LedgerIntentManagerV2Context =
  createContext<LedgerIntentManagerV2 | null>(null);

export function LedgerIntentManagerV2Provider({
  children,
  value,
}: {
  children: ReactNode;
  value?: LedgerIntentManagerV2;
}) {
  const manager = value ?? useLedgerIntentManagerV2();
  return createElement(
    LedgerIntentManagerV2Context.Provider,
    { value: manager },
    children,
  );
}

export function useLedgerIntentManagerV2Context() {
  return useContext(LedgerIntentManagerV2Context) ?? useLedgerIntentManagerV2();
}

export function useLedgerIntentUpdaterV2(txn: GroupedTransaction) {
  const manager = useLedgerIntentManagerV2Context();

  useEffect(() => {
    manager.registerTransaction(txn);
  }, [manager, txn]);

  return {
    updateEntry: (entryId: string, changes: Partial<LedgerIntentEntry>) => {
      manager.updateEntry(txn.bankTransactionId, entryId, changes);
    },
    updateExchangeRate: (rate: number | null) => {
      manager.updateExchangeRate(txn.bankTransactionId, rate);
    },
    deleteEntry: (entryId: string) => {
      manager.deleteEntry(txn.bankTransactionId, entryId);
    },
    addEntry: (defaults?: Partial<EntryUI>) =>
      manager.addEntry(txn.bankTransactionId, defaults),
    getEntriesUI: () => manager.getEntriesUI(txn.bankTransactionId),
    getPendingExchangeRate: () =>
      manager.getPendingExchangeRate(txn.bankTransactionId),
    isEntryDirty: (uiEntryId: string) =>
      manager.isEntryDirty(txn.bankTransactionId, uiEntryId),
    resolveUiEntryId: (entryId: string) =>
      manager.resolveUiEntryId(txn.bankTransactionId, entryId),
  };
}
