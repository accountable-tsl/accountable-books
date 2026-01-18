import type {
  LedgerIntentDesiredState,
  LedgerIntentEntry,
} from '@accountable-books/contracts/schema';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Landmark,
  Pencil,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/app/session';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { FilePreviewer } from '@/components/file-previewer';
import { FormattedAmount } from '@/components/FormattedAmount';
import { TooltipHelper } from '@/components/TooltipHelper';
import { Badge } from '@/components/ui/badge';
import { AddNewCoaDialog } from '@/features/chart-of-accounts/ui/components/coa-add-new';
import { AddContactDialog } from '@/features/manage-contacts/ui/components/contacts-add';
import { AddProjectDialog } from '@/features/manage-projects/ui/components/projects-add';
import { cn } from '@/lib/utils';
import type {
  CategorizationTransactionFile,
  GroupedTransaction,
} from '@/modules/accounting/categorization';
import {
  createTempEntryId,
  isTempEntryId,
  useLedgerIntentUpdater,
} from '@/modules/accounting/categorization';
import type { ContactResponse } from '@/modules/contacts';
import { useContactsInfinite } from '@/modules/contacts';
import { getObjectDownloadUrl } from '@/modules/objects/api';
import { useUploadTransactionFiles } from '@/modules/objects/model/hooks';
import type { ProjectsResponse } from '@/modules/projects';
import { useProjectsInfinite } from '@/modules/projects';

import { TOOLTIPS } from '../constants';
import type { GroupedCoaData } from '../types';

// Escape key should close the edit mode and act as cancel
// Enter key should save the entry and act as save
// If unsaved changes and user tries to navigate away, show an alert or something to make sure they want to leave and discard the changes

interface TransactionViewProps {
  transaction: GroupedTransaction;
  groupedCoaData?: GroupedCoaData[];
}

type EntryField = keyof LedgerIntentEntry;
type TxnLevelField = Omit<keyof LedgerIntentDesiredState, 'entries'>;

export function TransactionView({
  transaction: txn,
  groupedCoaData = [],
}: TransactionViewProps) {
  const { companyId } = useSession();
  const { updateEntry, updateExchangeRate, deleteEntry } =
    useLedgerIntentUpdater(txn);

  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
    new Set(),
  );
  const [editing, setEditing] = useState<{
    entryId: string;
    field: EntryField | TxnLevelField;
  } | null>(null);
  const [contactSearch, setContactSearch] = useState<string>('');
  const [projectSearch, setProjectSearch] = useState<string>('');
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [coaDialogOpen, setCoaDialogOpen] = useState(false);
  const [draftTransactionState, setDraftTransactionState] = useState<
    LedgerIntentDesiredState | undefined
  >(undefined);
  // Store both server files (CategorizationTransactionFile) and newly uploaded files (File)
  const [draftEntryFiles, setDraftEntryFiles] = useState<
    Map<string, (CategorizationTransactionFile | File)[]>
  >(new Map());
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(
    null,
  );
  const [_isEditingAmount, setIsEditingAmount] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  // Map of file key -> presigned URL for server files
  const [presignedUrls, setPresignedUrls] = useState<Map<string, string>>(
    new Map(),
  );
  // Map of File object -> blob URL for new files
  const [blobUrls, setBlobUrls] = useState<Map<File, string>>(new Map());
  // Track which files have been saved (keyed by entryId:fileName:fileSize)
  const [savedFiles, setSavedFiles] = useState<Set<string>>(new Set());

  // Helper function to create file key for savedFiles tracking
  const getFileKey = useCallback((entryId: string, file: File) => {
    return `${entryId}:${file.name}:${file.size}`;
  }, []);

  const uploadTxnFilesMutation = useUploadTransactionFiles();

  const contactsQuery = useContactsInfinite({
    companyId: companyId || '',
    limit: 30,
    search: contactSearch || undefined,
  });

  const projectsQuery = useProjectsInfinite({
    companyId: companyId || '',
    limit: 30,
    search: projectSearch || undefined,
  });

  // Convert contacts to items format
  const contactItems = useMemo(() => {
    if (!contactsQuery.data?.pages) return [];

    return contactsQuery.data.pages.flatMap((page) => {
      if (!page.data) return [];
      const response = page.data as ContactResponse;
      return (response.contacts || [])
        .filter((contact) => contact.id)
        .map((contact) => ({
          label: contact.displayName,
          value: contact.id,
        }));
    });
  }, [contactsQuery.data?.pages]);

  // Convert projects to items format
  const projectItems = useMemo(() => {
    if (!projectsQuery.data?.pages) return [];

    return projectsQuery.data.pages.flatMap((page) => {
      if (!page.data) return [];
      const response = page.data as ProjectsResponse;
      return (response.projects || [])
        .filter((project) => project.id)
        .map((project) => ({
          label: project.name,
          value: project.id!,
        }));
    });
  }, [projectsQuery.data?.pages]);

  // const intent = useMemo(() => {
  //   return {
  //     // intent_id: uuidv4(),
  //     bank_transaction_id: txn.id,
  //     desired_state: draftTransactionState,
  //   };
  // }, [draftTransactionState, txn.id]);

  useEffect(() => {
    if (!txn) return;

    const initialEntries: LedgerIntentEntry[] = (txn.entries || []).map(
      (entry) => ({
        entry_id: entry.id,
        fs_date: entry.fsDate || entry.date,
        description: entry.description,
        reference: entry.reference,
        contact_id: entry.contactId,
        project_id: entry.projectId,
        source_amount: entry.nativeAmount,
        coa_id: entry.coaId || '',
      }),
    );

    setDraftTransactionState({
      custom_exchange_rate: parseFloat(txn.exchangeRate.toString()),
      entries: initialEntries,
    });

    // Files by entry id
    const filesByEntryId = new Map<string, CategorizationTransactionFile[]>();
    txn.entries?.forEach((entry) => {
      if (!entry.id) return;
      filesByEntryId.set(entry.id, entry.files || []);
    });
    setDraftEntryFiles(filesByEntryId);
  }, [txn]); // Only reset when the transaction ID changes

  useEffect(() => {
    if (!txn.entries?.length || !draftTransactionState?.entries?.length) {
      return;
    }

    const tempToRealEntryIds = new Map<string, string>();
    txn.entries.forEach((entry) => {
      if (
        entry.client_ref_id &&
        entry.id &&
        isTempEntryId(entry.client_ref_id)
      ) {
        tempToRealEntryIds.set(entry.client_ref_id, entry.id);
      }
    });

    if (tempToRealEntryIds.size === 0) {
      return;
    }

    setDraftTransactionState((prev) => {
      if (!prev?.entries) return prev;
      let updated = false;
      const entries = prev.entries.map((entry) => {
        const mappedId = entry.entry_id
          ? tempToRealEntryIds.get(entry.entry_id)
          : undefined;
        if (mappedId && entry.entry_id !== mappedId) {
          updated = true;
          return { ...entry, entry_id: mappedId };
        }
        return entry;
      });
      return updated ? { ...prev, entries } : prev;
    });

    setDraftEntryFiles((prev) => {
      let updated = false;
      const next = new Map(prev);
      tempToRealEntryIds.forEach((realId, tempId) => {
        const files = next.get(tempId);
        if (!files) return;
        next.delete(tempId);
        const existing = next.get(realId);
        next.set(realId, existing ? [...existing, ...files] : files);
        updated = true;
      });
      return updated ? next : prev;
    });

    setSavedFiles((prev) => {
      if (tempToRealEntryIds.size === 0) return prev;
      const next = new Set(prev);
      tempToRealEntryIds.forEach((realId, tempId) => {
        const files = draftEntryFiles.get(tempId) || [];
        files.forEach((file) => {
          if (isServerFile(file)) return;
          const oldKey = getFileKey(tempId, file);
          if (next.has(oldKey)) {
            next.delete(oldKey);
            next.add(getFileKey(realId, file));
          }
        });
      });
      return next;
    });

    setExpandedEntries((prev) => {
      const next = new Set(prev);
      let updated = false;
      tempToRealEntryIds.forEach((realId, tempId) => {
        if (next.has(tempId)) {
          next.delete(tempId);
          next.add(realId);
          updated = true;
        }
      });
      return updated ? next : prev;
    });

    setEditing((prev) => {
      if (!prev) return prev;
      const mappedId = tempToRealEntryIds.get(prev.entryId);
      return mappedId ? { ...prev, entryId: mappedId } : prev;
    });

    setSelectedEntryId((prev) => {
      if (!prev) return prev;
      return tempToRealEntryIds.get(prev) ?? prev;
    });
  }, [
    txn.entries,
    draftTransactionState?.entries,
    draftEntryFiles,
    getFileKey,
    isServerFile,
  ]);

  const toggleEntry = (entryId: string) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedEntries(newExpanded);
  };

  function getDraftEntry(entryId: string) {
    return draftTransactionState?.entries?.find((e) => e.entry_id === entryId);
  }
  function updateDraftEntry(
    entryId: string,
    patch: Partial<LedgerIntentEntry>,
  ) {
    setDraftTransactionState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: prev.entries?.map((e) =>
          e.entry_id === entryId ? { ...e, ...patch } : e,
        ),
      };
    });
  }

  function updateTxnLevelDraft(
    patch: Partial<Omit<LedgerIntentDesiredState, 'entries'>>,
  ) {
    setDraftTransactionState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ...patch,
      };
    });
  }

  function resetDraftEntryFromTxn(entryId: string) {
    const serverEntry = txn.entries?.find((e) => e.id === entryId);
    if (!serverEntry) return;

    updateDraftEntry(entryId, {
      coa_id: serverEntry.coaId ?? '',
      contact_id: serverEntry.contactId,
      project_id: serverEntry.projectId,
      description: serverEntry.description,
      reference: serverEntry.reference,
    });
  }

  function hasEntryChanged(entryId: string): boolean {
    const draft = getDraftEntry(entryId);
    if (!draft) return false;

    // New entries are always considered changed
    // Check if entry exists in transaction (more robust than string prefix)
    const existsInTransaction =
      txn.hasMultipleEntries && txn.entries
        ? txn.entries.some((e) => e.id === entryId)
        : entryId === txn.id;

    if (!existsInTransaction) {
      return true; // New entry
    }

    // Compare with server state directly
    const server = txn.entries?.find((e) => e.id === entryId);
    if (!server) return false;

    return (
      draft.coa_id !== (server.coaId ?? '') ||
      draft.contact_id !== server.contactId ||
      draft.project_id !== server.projectId ||
      draft.description !== server.description ||
      draft.reference !== server.reference ||
      draft.source_amount !== server.nativeAmount
    );
  }

  // Type guard to check if file is a server file
  const isServerFile = useCallback(
    (file: CategorizationTransactionFile | File): file is CategorizationTransactionFile => {
      return 'id' in file && 'key' in file;
    },
    [],
  );

  // Helper function to get file attachments for FilePreviewer (synchronous - all data is in memory)
  const getFileAttachments = useCallback(
    (
      entryId: string,
    ): Array<{
      file_name: string;
      url: string;
      type: string;
      size?: number;
    }> => {
      const files = draftEntryFiles.get(entryId) || [];
      const attachments: Array<{
        file_name: string;
        url: string;
        type: string;
        size?: number;
      }> = [];

      for (const file of files) {
        if (isServerFile(file)) {
          // Server file - use presigned URL if available
          const url = presignedUrls.get(file.key);
          if (!url) {
            // URL not yet available - will be fetched by useEffect
            continue; // Skip for now, will be available on next render
          }
          attachments.push({
            file_name: file.name,
            url,
            type: file.type,
            size: Number(file.size_bytes),
          });
        } else {
          // New file - use blob URL
          let blobUrl = blobUrls.get(file);
          if (!blobUrl) {
            blobUrl = createTypedBlobUrl(file);
            setBlobUrls((prev) => new Map(prev).set(file, blobUrl!));
          }

          attachments.push({
            file_name: file.name,
            url: blobUrl,
            type: file.type,
            size: file.size,
          });
        }
      }

      return attachments;
    },
    [draftEntryFiles, presignedUrls, blobUrls, isServerFile],
  );

  function canPersistEntry(entryId: string): boolean {
    const entry = getDraftEntry(entryId);
    if (!entry) {
      console.log('[canPersistEntry] Entry not found', { entryId });
      return false;
    }

    // 0. Nothing changed → nothing to do
    const hasChanged = hasEntryChanged(entryId);
    if (!hasChanged) {
      return false;
    }

    // 1. Entry must be categorizable
    if (!entry.coa_id) {
      console.log('[canPersistEntry] Entry missing COA', {
        entryId,
        entry: {
          coa_id: entry.coa_id,
          contact_id: entry.contact_id,
          project_id: entry.project_id,
        },
      });
      return false;
    }

    // 2. Transaction must be balanced
    if (!balance.balanced) {
      const entriesTotal =
        draftTransactionState?.entries?.reduce(
          (sum, e) => sum + (e.source_amount ?? 0),
          0,
        ) ?? 0;
      console.log('[canPersistEntry] Transaction not balanced', {
        entryId,
        entriesTotal,
        bankAmount: txn.bankAmount,
        diff: balance.diff,
        expectedTotal: -txn.bankAmount,
        entries: draftTransactionState?.entries?.map((e) => ({
          id: e.entry_id,
          source_amount: e.source_amount,
        })),
      });
      return false;
    }

    return true;
  }

  // Simpler check for file uploads - doesn't require entry fields to have changed
  function canAcceptFiles(entryId: string): boolean {
    const entry = getDraftEntry(entryId);
    if (!entry) return false;

    // Entry must be categorizable
    if (!entry.coa_id) return false;

    // Transaction must be balanced
    if (!balance.balanced) return false;

    return true;
  }

  // Memoize balance calculation to avoid repeated computation
  const balance = useMemo(() => {
    if (!draftTransactionState?.entries?.length)
      return { balanced: false, diff: 0 };

    const entriesTotal = draftTransactionState.entries.reduce(
      (sum, e) => sum + (e.source_amount ?? 0),
      0,
    );

    return {
      balanced: Math.abs(entriesTotal + txn.bankAmount) < 0.0001,
      diff: entriesTotal + txn.bankAmount,
    };
  }, [draftTransactionState?.entries, txn.bankAmount]);

  // Auto-save files when entry becomes valid
  const handleAutoSaveFiles = async (entryId: string) => {
    // Skip temp entries - they'll be uploaded after persistence
    if (isTempEntryId(entryId)) {
      return;
    }

    // No fallback - maintain invariant that files are never uploaded pre-ledger
    if (!txn.ledgerTransactionId) {
      return;
    }

    if (!companyId || !canAcceptFiles(entryId)) return;

    const files = draftEntryFiles.get(entryId) || [];
    const newFiles = files.filter(
      (file) =>
        !isServerFile(file) && !savedFiles.has(getFileKey(entryId, file)),
    ) as File[];

    if (newFiles.length === 0) return;

    try {
      // Determine source type - for entries it should be 'ledger'
      const entry = txn.entries?.find((e) => e.id === entryId);
      const ledgerEntryId = entry?.ledgerEntryId || entryId;

      await uploadTxnFilesMutation.mutateAsync({
        companyId,
        files: newFiles,
        transactionId: txn.ledgerTransactionId,
        source: 'ledger',
        entryId: ledgerEntryId,
      });

      // Mark files as saved
      setSavedFiles((prev) => {
        const newSet = new Set(prev);
        newFiles.forEach((file) => newSet.add(getFileKey(entryId, file)));
        return newSet;
      });

      // Note: The uploaded files will be replaced with server file objects
      // when the transaction is refetched, but for now we keep them as File objects
      // until the next data refresh
    } catch (error) {
      toast.error('File upload failed. Please try again.');
      console.error('Failed to auto-save files:', error);
    }
  };

  // Upload files for newly persisted entries (temp entries that were just persisted)
  const handleUploadFilesForPersistedEntries = useCallback(
    async (persistedTransaction: GroupedTransaction) => {
      // No fallback - maintain invariant that files are never uploaded pre-ledger
      if (!companyId || !persistedTransaction.ledgerTransactionId) return;

      const tempEntryIds = Array.from(draftEntryFiles.keys()).filter(
        isTempEntryId,
      );

      for (const tempEntryId of tempEntryIds) {
        const persistedEntry = persistedTransaction.entries?.find(
          (e) => e.client_ref_id === tempEntryId,
        );

        if (persistedEntry?.ledgerEntryId) {
          const files = draftEntryFiles.get(tempEntryId) || [];
          const newFiles = files.filter(
            (file) =>
              !isServerFile(file) &&
              !savedFiles.has(getFileKey(tempEntryId, file)),
          ) as File[];

          if (newFiles.length > 0) {
            try {
              // Upload with ledgerTransactionId (no fallback)
              await uploadTxnFilesMutation.mutateAsync({
                companyId,
                files: newFiles,
                transactionId: persistedTransaction.ledgerTransactionId,
                source: 'ledger',
                entryId: persistedEntry.ledgerEntryId,
              });

              // Mark files as saved
              setSavedFiles((prev) => {
                const newSet = new Set(prev);
                newFiles.forEach((file) =>
                  newSet.add(getFileKey(tempEntryId, file)),
                );
                return newSet;
              });

              // Remove temp entry ID from draftEntryFiles
              setDraftEntryFiles((prev) => {
                const newMap = new Map(prev);
                newMap.delete(tempEntryId);
                return newMap;
              });
            } catch (error) {
              toast.error(
                `Failed to upload files for entry: ${persistedEntry.ledgerEntryId}`,
              );
              console.error(
                'Failed to upload files for persisted entry:',
                error,
              );
            }
          }
        }
      }
    },
    [
      companyId,
      draftEntryFiles,
      savedFiles,
      uploadTxnFilesMutation,
      getFileKey,
      isServerFile,
    ],
  );

  const handleSaveEntry = (entryId: string, field: EntryField, value: any) => {
    console.log('handleSaveEntry', { entryId, field, value });

    // Always call updateEntry - let emitter handle accumulation and validation
    updateEntry(entryId, { [field]: value });

    // Update draft state for UI
    updateDraftEntry(entryId, { [field]: value });

    // Auto-save files when entry is ready (check canAcceptFiles, not canPersistEntry)
    if (canAcceptFiles(entryId)) {
      handleAutoSaveFiles(entryId);
    }

    setEditing(null);
  };

  const handleCancelEntry = (entryId: string) => {
    resetDraftEntryFromTxn(entryId);
    setEditing(null);
  };

  const handleAddEntry = () => {
    if (!draftTransactionState) return;

    const newEntryId = createTempEntryId();
    const newEntry: LedgerIntentEntry = {
      entry_id: newEntryId,
      coa_id: '' as any,
      fs_date: txn.date,
      description: null,
      reference: null,
      contact_id: null,
      project_id: null,
      source_amount: 0,
    };

    setDraftTransactionState({
      ...draftTransactionState,
      entries: [...(draftTransactionState.entries || []), newEntry],
    });

    // Initialize empty files array for the new entry
    setDraftEntryFiles((prev) => {
      const newFilesMap = new Map(prev);
      newFilesMap.set(newEntryId, []);
      return newFilesMap;
    });
  };

  const handleDeleteEntry = (entryId: string) => {
    if (!draftTransactionState?.entries) return;

    // Remove from draft state (UI)
    setDraftTransactionState({
      ...draftTransactionState,
      entries: draftTransactionState.entries.filter(
        (e) => e.entry_id !== entryId,
      ),
    });

    // Always call deleteEntry - it handles both new and existing entries
    // For new entries: removes from desiredState.entries (prevents sending)
    // For existing entries: tracks deletion in deleted_entry_ids
    deleteEntry(entryId);

    // Remove files for the deleted entry
    setDraftEntryFiles((prev) => {
      const newFilesMap = new Map(prev);
      newFilesMap.delete(entryId);
      return newFilesMap;
    });
  };

  const handleFileUpload = (
    entryId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      // Create blob URLs immediately for instant preview
      const newBlobUrls = new Map<File, string>();
      newFiles.forEach((file) => {
        const blobUrl = createTypedBlobUrl(file);

        newBlobUrls.set(file, blobUrl);
      });

      setBlobUrls((prev) => {
        const combined = new Map(prev);
        newBlobUrls.forEach((url, file) => combined.set(file, url));
        return combined;
      });

      setDraftEntryFiles((prev) => {
        const newFilesMap = new Map(prev);
        const existingFiles = newFilesMap.get(entryId) || [];
        newFilesMap.set(entryId, [...existingFiles, ...newFiles]);
        return newFilesMap;
      });
    }
    // Reset the input so the same file can be selected again
    e.target.value = '';
  };

  const removeFile = (entryId: string, fileIndex: number) => {
    setDraftEntryFiles((prev) => {
      const newFilesMap = new Map(prev);
      const existingFiles = newFilesMap.get(entryId) || [];
      const fileToRemove = existingFiles[fileIndex];

      // Clean up blob URL if it's a new file
      if (fileToRemove && !isServerFile(fileToRemove)) {
        const blobUrl = blobUrls.get(fileToRemove);
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          setBlobUrls((prevBlob) => {
            const newBlob = new Map(prevBlob);
            newBlob.delete(fileToRemove);
            return newBlob;
          });
        }
        // Remove from saved files tracking
        setSavedFiles((prevSaved) => {
          const newSaved = new Set(prevSaved);
          newSaved.delete(getFileKey(entryId, fileToRemove));
          return newSaved;
        });
      }

      const updatedFiles = existingFiles.filter(
        (_, index) => index !== fileIndex,
      );
      if (updatedFiles.length === 0) {
        newFilesMap.delete(entryId);
      } else {
        newFilesMap.set(entryId, updatedFiles);
      }
      return newFilesMap;
    });
  };

  // Auto-save files when entry becomes valid or when files are added
  useEffect(() => {
    if (!draftTransactionState?.entries || !companyId) return;

    draftTransactionState.entries.forEach((entry) => {
      // Skip temp entries - they'll be uploaded after persistence
      if (
        entry.entry_id &&
        !isTempEntryId(entry.entry_id) &&
        canAcceptFiles(entry.entry_id)
      ) {
        // Check if there are unsaved files for this entry
        const entryId = entry.entry_id; // Type narrowing
        const files = draftEntryFiles.get(entryId) || [];
        const hasUnsavedFiles = files.some(
          (file) =>
            !isServerFile(file) && !savedFiles.has(getFileKey(entryId, file)),
        );

        if (hasUnsavedFiles) {
          handleAutoSaveFiles(entryId);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftTransactionState?.entries,
    draftEntryFiles,
    savedFiles,
    companyId,
    getFileKey,
  ]);

  // Fetch presigned URLs for server files that need them
  useEffect(() => {
    if (!companyId) return;

    // Find all server files that need presigned URLs
    const filesNeedingUrls: Array<{ key: string }> = [];

    for (const files of draftEntryFiles.values()) {
      for (const file of files) {
        if (isServerFile(file) && !presignedUrls.has(file.key)) {
          // Avoid duplicate requests for the same key
          if (!filesNeedingUrls.some((f) => f.key === file.key)) {
            filesNeedingUrls.push({ key: file.key });
          }
        }
      }
    }

    // Fetch URLs for files that need them
    for (const { key } of filesNeedingUrls) {
      getObjectDownloadUrl({
        bucketType: 'txnFiles',
        fileKey: key,
        timeout: 3600,
      }).then((downloadUrlResponse) => {
        if (downloadUrlResponse.success && downloadUrlResponse.data) {
          setPresignedUrls((prev) =>
            new Map(prev).set(key, downloadUrlResponse.data!.url),
          );
        }
      });
    }
  }, [companyId, draftEntryFiles, presignedUrls, isServerFile]);

  // Detect when transaction is persisted and upload files for temp entries
  const prevLedgerTransactionIdRef = useRef<string | null>(
    txn.ledgerTransactionId,
  );
  const filesUploadedForTxnRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const prev = prevLedgerTransactionIdRef.current;
    const current = txn.ledgerTransactionId;

    // Detect transition from null to non-null (entry was persisted)
    if (!prev && current && txn.entries) {
      // Guard against double upload on re-renders
      if (!filesUploadedForTxnRef.current.has(current)) {
        handleUploadFilesForPersistedEntries(txn);
        filesUploadedForTxnRef.current.add(current);
      }
    }

    prevLedgerTransactionIdRef.current = current;
  }, [
    txn,
    handleUploadFilesForPersistedEntries,
  ]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, [blobUrls]);

  const isFxTransaction =
    txn?.bankAccountCurrencyCode !== txn?.reportingCurrencyCode;

  if (!txn) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col gap-4 overflow-hidden rounded-md border text-sm',
      )}
    >
      <div
        className={cn(
          'flex h-10 min-h-10 items-center justify-between border-b px-4 py-1',
          //   backgroundClass,
        )}
      >
        <div>Transaction Details</div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {txn.status === 'proposed' ? 'auto-categorized' : txn.status}
          </Badge>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col divide-y">
        <div className="grid flex-shrink-0 grid-cols-2 items-center gap-4 p-4 pt-0">
          {/* Amount */}
          <div className="overflow-hidden">
            <div className="text-muted-foreground truncate text-xs">
              Bank amount
            </div>
            <FormattedAmount
              amount={txn.nativeAmount}
              currency={txn.bankAccountCurrencyCode}
              showSymbol
              accountingNegatives={false}
              className={cn(
                'truncate text-xl font-bold',
                txn.nativeAmount > 9_999_999_999 ? 'text-lg' : '',
                txn.nativeAmount < 0
                  ? 'text-red-600 dark:text-red-500'
                  : txn.nativeAmount > 0
                    ? 'text-green-700 dark:text-green-500'
                    : '',
              )}
            />
          </div>

          {/* Bank Logo */}
          <TooltipHelper
            icon={false}
            content={
              `${txn.bankName} - ${txn.bankAccountName}` || TOOLTIPS.BANK_LOGO
            }
            contentStyle="w-fit max-w-xs text-center"
            trigger={
              <div className="flex items-center gap-2 overflow-hidden">
                <div
                  className="bg-muted dark:bg-foreground/70 flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border"
                  role="img"
                  aria-label={`${txn.bankName || TOOLTIPS.BANK_LOGO} logo`}
                >
                  {txn.bankLogo ? (
                    <img
                      src={txn.bankLogo}
                      alt={`${txn.bankName || 'Bank'} Logo`}
                      className="h-8 w-8 object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <Landmark className="h-4 w-4" />
                  )}
                </div>
                <p className="text-muted-foreground line-clamp-2 text-xs">
                  {txn.bankAccountName}
                </p>
              </div>
            }
          />

          {/* Exchange Rate */}
          <div>
            <p className="text-muted-foreground text-xs">Exchange Rate</p>
            <p className="">
              {draftTransactionState?.custom_exchange_rate ?? txn.exchangeRate}
            </p>
          </div>

          {/* Bank Transaction Date */}
          <div>
            <TooltipHelper
              icon={false}
              content="Bank Transaction Date"
              trigger={<p className="text-muted-foreground text-xs">Date</p>}
            />
            <p>{txn.date}</p>
          </div>

          {/* Bank Description */}
          <div className="col-span-2">
            <p className="text-muted-foreground text-xs">Description</p>
            <TooltipHelper
              icon={false}
              content={txn.description || ''}
              trigger={<p className="truncate">{txn.description}</p>}
            />
          </div>
          {!txn.hasMultipleEntries && (
            <>
              {/* Contact */}
              <div>
                <p className="text-muted-foreground text-xs">Contact</p>
                <p>{txn.contactName}</p>
              </div>

              {/* Reference */}
              <div>
                <p className="text-muted-foreground text-xs">Reference</p>
                <p>{txn.reference || '-'}</p>
              </div>
            </>
          )}
        </div>

        {/* Entries Section */}
        <div className="scrollbar-thin-2px min-h-0 flex-1 overflow-y-auto p-4">
          {/* Exchange Rate - Editable */}
          {isFxTransaction && (
            <div className="mb-4 space-y-1">
              <NumberField
                label={`Exchange Rate (1 ${txn.bankAccountCurrencyCode} = ?${' '}
                ${txn.reportingCurrencyCode})`}
                amount={draftTransactionState?.custom_exchange_rate || 1}
                step={0.0001}
                isEditing={editing?.entryId === 'exchange_rate'}
                onEdit={() =>
                  setEditing({
                    entryId: 'exchange_rate',
                    field: 'custom_exchange_rate',
                  })
                }
                onDraftChange={(v) => {
                  updateTxnLevelDraft({ custom_exchange_rate: v });
                }}
                onCommit={() => {
                  // Simple check: if rate changed and is valid, save it
                  const originalRate = parseFloat(txn.exchangeRate.toString());
                  const newRate = draftTransactionState?.custom_exchange_rate;
                  if (
                    newRate &&
                    newRate > 0 &&
                    Math.abs(originalRate - newRate) > 0.000001
                  ) {
                    updateExchangeRate(newRate);
                  }
                  setEditing(null);
                }}
                onCancel={() => {
                  setDraftTransactionState(
                    (prev) =>
                      prev && {
                        ...prev,
                        custom_exchange_rate: Number(txn.exchangeRate || 1),
                      },
                  );
                  setEditing(null);
                }}
                inputOnly={false}
                decimalPlaces={6}
              />
              <div className="text-muted-foreground text-xs">
                Affects all entries in this transaction
              </div>
            </div>
          )}

          <div className="text-muted-foreground text-xs">Entries</div>

          <div className="space-y-3">
            {/* Bank Leg Entry */}
            <div className="overflow-clip rounded border-2 p-1">
              {/* Entry Header */}
              <div className="bg-muted overflow-clip rounded px-2 py-1">
                <div className="flex justify-between gap-4 overflow-clip">
                  <div className="flex min-w-0 items-center gap-1 overflow-clip">
                    <span className="text-muted-foreground flex-shrink-0 text-xs">
                      {txn.bankAmount < 0 ? 'CR' : 'DR'}
                    </span>
                    <div
                      className="truncate text-sm"
                      title={txn.bankAccountCoaName ?? txn.bankAccountName}
                    >
                      {txn.bankAccountCoaName ?? txn.bankAccountName}
                    </div>
                    <span className="text-muted-foreground flex-shrink-0 text-xs">
                      (Bank Leg)
                    </span>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <div
                      className={cn(
                        txn.bankAmount < 0
                          ? 'text-red-600 dark:text-red-500'
                          : txn.bankAmount > 0
                            ? 'text-green-700 dark:text-green-500'
                            : '',
                      )}
                    >
                      <span className="mr-0.5">
                        {txn.bankAmount < 0 ? '-' : '+'}
                      </span>
                      <FormattedAmount
                        amount={Math.abs(txn.bankAmount)}
                        currency={txn.bankAccountCurrencyCode}
                        showSymbol
                        accountingNegatives={false}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {draftTransactionState?.entries?.map((draftEntry) => {
              // const draftEntry = getDraftEntry(entry?.id);
              // if (!draftEntry) return null;

              const serverEntry = txn.entries?.find(
                (e) => e.id === draftEntry.entry_id,
              );

              const sourceAmt = draftEntry.source_amount ?? 0;
              const debitValue = sourceAmt > 0 ? sourceAmt : '';
              const creditValue = sourceAmt < 0 ? Math.abs(sourceAmt) : '';

              return (
                <div
                  key={draftEntry.entry_id}
                  className="overflow-hidden rounded border"
                >
                  <div className="bg-muted hover:bg-muted/50 px-3 py-2 transition-colors">
                    {/* Entry Header */}
                    <div
                      onClick={() => toggleEntry(draftEntry.entry_id || '')}
                      className="flex cursor-pointer items-center justify-between gap-4 overflow-clip"
                    >
                      <div className="flex min-w-0 items-center gap-1 overflow-clip">
                        <span className="text-muted-foreground flex-shrink-0 text-xs">
                          {sourceAmt < 0 ? 'CR' : 'DR'}
                        </span>
                        <span className="truncate text-sm">
                          {groupedCoaData
                            .flatMap((group) => group.items)
                            .find((item) => item.value === draftEntry.coa_id)
                            ?.label ?? 'Not set'}
                        </span>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <div
                          className={cn(
                            sourceAmt < 0
                              ? 'text-red-600 dark:text-red-500'
                              : sourceAmt > 0
                                ? 'text-green-700 dark:text-green-500'
                                : '',
                          )}
                        >
                          <span className="mr-0.5">
                            {sourceAmt < 0 ? '-' : '+'}
                          </span>
                          <FormattedAmount
                            amount={Math.abs(sourceAmt)}
                            currency={txn.bankAccountCurrencyCode}
                            showSymbol
                            accountingNegatives={false}
                          />
                        </div>
                        {expandedEntries.has(draftEntry.entry_id || '') ? (
                          <ChevronUp className="text-muted-foreground h-4 w-4" />
                        ) : (
                          <ChevronDown className="text-muted-foreground h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Entry Details - Expanded */}
                  {expandedEntries.has(draftEntry.entry_id || '') && (
                    <div className="space-y-3 border px-3 py-3">
                      {/* Account */}
                      <EditableSelectField
                        label="Account"
                        confidence={
                          serverEntry?.status === 'proposed' &&
                          serverEntry?.confidence
                            ? serverEntry.confidence
                            : undefined
                        }
                        value={draftEntry?.coa_id ?? ''}
                        isEditing={
                          editing?.entryId === draftEntry.entry_id &&
                          editing?.field === 'coa_id'
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: draftEntry.entry_id || '',
                            field: 'coa_id',
                          })
                        }
                        onValueChange={(value) => {
                          updateDraftEntry(draftEntry.entry_id || '', {
                            coa_id: value,
                          });
                        }}
                        onSave={() => {
                          handleSaveEntry(
                            draftEntry.entry_id || '',
                            'coa_id',
                            draftEntry?.coa_id,
                          );
                        }}
                        onCancel={() =>
                          handleCancelEntry(draftEntry.entry_id || '')
                        }
                        autocompleteProps={{
                          id: `coa-${draftEntry.entry_id}`,
                          items: [],
                          groups: groupedCoaData,
                          variant: 'outline',
                          actionItems: [
                            {
                              id: 'add-coa',
                              label: 'Add New Account',
                              icon: <Plus />,
                            },
                          ],
                          onAction: (actionId) => {
                            if (actionId === 'add-coa') {
                              setCoaDialogOpen(true);
                            }
                          },
                        }}
                        displayValue={
                          groupedCoaData
                            .flatMap((group) => group.items)
                            .find((item) => item.value === draftEntry?.coa_id)
                            ?.label
                        }
                      />

                      {/* Debit/Credit Placeholders - Improve and handle formatting of what's displayed, when user types in the credit, the debit field should be cleared (0) and vice versa */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-muted-foreground text-xs">
                            Debit
                            {isFxTransaction
                              ? ` (${txn.bankAccountCurrencyCode})`
                              : ''}
                          </label>
                          {/* <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={debitValue}
                            onChange={(e) => {
                              const v = Math.max(
                                0,
                                Number(e.target.value) || 0,
                              );
                              updateDraftEntry(entry.id, { source_amount: v });
                            }}
                            onBlur={() => {
                              // Always call updateEntry - let emitter handle accumulation and validation
                              updateEntry(entry.id, {
                                source_amount: draftEntry.source_amount,
                              });
                            }}
                            className="w-full bg-muted/50 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          /> */}
                          <NumberField
                            amount={debitValue || 0}
                            onDraftChange={(v) =>
                              updateDraftEntry(draftEntry.entry_id || '', {
                                source_amount: v,
                              })
                            }
                            onCommit={() => {
                              // Always call updateEntry - let emitter handle accumulation and validation
                              updateEntry(draftEntry.entry_id || '', {
                                source_amount: draftEntry.source_amount,
                              });
                            }}
                            onStartEditing={() => setIsEditingAmount(true)}
                            onEndEditing={() => setIsEditingAmount(false)}
                          />

                          {isFxTransaction && (serverEntry?.spent ?? 0) > 0 && (
                            <span className="text-muted-foreground text-xs">
                              ≃ {txn.reportingCurrencySymbol}{' '}
                              {formatNumber(
                                Number(
                                  draftTransactionState?.custom_exchange_rate ??
                                    txn.exchangeRate,
                                ) * (serverEntry?.spent || 0),
                              )}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-muted-foreground text-xs">
                            Credit
                            {isFxTransaction
                              ? ` (${txn.bankAccountCurrencyCode})`
                              : ''}
                          </label>
                          <NumberField
                            amount={creditValue || 0}
                            onDraftChange={(v) =>
                              updateDraftEntry(draftEntry.entry_id || '', {
                                source_amount: v * -1,
                              })
                            }
                            onCommit={() => {
                              console.log('onCommit', { draftEntry });
                              console.log(
                                'canPersistEntry',
                                canPersistEntry(draftEntry.entry_id || ''),
                              );

                              if (canPersistEntry(draftEntry.entry_id || '')) {
                                // Always call updateEntry - let emitter handle accumulation and validation
                                updateEntry(draftEntry.entry_id || '', {
                                  source_amount: draftEntry.source_amount,
                                });
                              }
                            }}
                            onStartEditing={() => setIsEditingAmount(true)}
                            onEndEditing={() => setIsEditingAmount(false)}
                          />

                          {isFxTransaction &&
                            (serverEntry?.received ?? 0) > 0 && (
                              <span className="text-muted-foreground text-xs">
                                ≃ {txn.reportingCurrencySymbol}{' '}
                                {formatNumber(
                                  Number(
                                    draftTransactionState?.custom_exchange_rate ??
                                      txn.exchangeRate,
                                  ) * (serverEntry?.received || 0),
                                )}
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Description */}
                      <EditableTextField
                        label="Description"
                        value={draftEntry?.description || ''}
                        isEditing={
                          editing?.entryId === draftEntry.entry_id &&
                          editing?.field === 'description'
                        }
                        onSave={() =>
                          handleSaveEntry(
                            draftEntry.entry_id || '',
                            'description',
                            draftEntry?.description ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(draftEntry.entry_id || '')
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: draftEntry.entry_id || '',
                            field: 'description',
                          })
                        }
                        onChange={(v) =>
                          updateDraftEntry(draftEntry.entry_id || '', {
                            description: v || null,
                          })
                        }
                      />

                      {/* Contact */}
                      <EditableSelectField
                        label="Contact"
                        value={draftEntry?.contact_id ?? ''}
                        isEditing={
                          editing?.entryId === draftEntry.entry_id &&
                          editing?.field === 'contact_id'
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: draftEntry.entry_id || '',
                            field: 'contact_id',
                          })
                        }
                        onValueChange={(value) => {
                          updateDraftEntry(draftEntry.entry_id || '', {
                            contact_id: value || null,
                          });
                        }}
                        onSave={() =>
                          handleSaveEntry(
                            draftEntry.entry_id || '',
                            'contact_id',
                            draftEntry?.contact_id ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(draftEntry.entry_id || '')
                        }
                        autocompleteProps={{
                          id: `contact-${draftEntry.entry_id}`,
                          items: contactItems,
                          variant: 'outline',
                          async: true,
                          onSearchChange: setContactSearch,
                          onLoadMore: () => {
                            if (
                              contactsQuery.hasNextPage &&
                              !contactsQuery.isFetchingNextPage
                            ) {
                              contactsQuery.fetchNextPage();
                            }
                          },
                          isLoading:
                            contactsQuery.isLoading ||
                            contactsQuery.isFetchingNextPage,
                          hasMore: contactsQuery.hasNextPage || false,
                          actionItems: [
                            {
                              id: 'add-contact',
                              label: 'Add New Contact',
                              icon: <Plus />,
                            },
                          ],
                          onAction: (actionId) => {
                            if (actionId === 'add-contact') {
                              setContactDialogOpen(true);
                            }
                          },
                        }}
                        displayValue={
                          contactItems.find(
                            (item) => item.value === draftEntry?.contact_id,
                          )?.label
                        }
                      />

                      {/* Project */}
                      <EditableSelectField
                        label="Project"
                        value={draftEntry?.project_id || ''}
                        isEditing={
                          editing?.entryId === draftEntry.entry_id &&
                          editing?.field === 'project_id'
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: draftEntry.entry_id || '',
                            field: 'project_id',
                          })
                        }
                        onValueChange={(value) => {
                          updateDraftEntry(draftEntry.entry_id || '', {
                            project_id: value || null,
                          });
                        }}
                        onSave={() =>
                          handleSaveEntry(
                            draftEntry.entry_id || '',
                            'project_id',
                            draftEntry?.project_id ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(draftEntry.entry_id || '')
                        }
                        autocompleteProps={{
                          id: `project-${draftEntry.entry_id}`,
                          items: projectItems,
                          variant: 'outline',
                          async: true,
                          onSearchChange: setProjectSearch,
                          onLoadMore: () => {
                            if (
                              projectsQuery.hasNextPage &&
                              !projectsQuery.isFetchingNextPage
                            ) {
                              projectsQuery.fetchNextPage();
                            }
                          },
                          isLoading:
                            projectsQuery.isLoading ||
                            projectsQuery.isFetchingNextPage,
                          hasMore: projectsQuery.hasNextPage || false,
                          actionItems: [
                            {
                              id: 'add-project',
                              label: 'Add New Project',
                              icon: <Plus />,
                            },
                          ],
                          onAction: (actionId) => {
                            if (actionId === 'add-project') {
                              setProjectDialogOpen(true);
                            }
                          },
                        }}
                        displayValue={
                          projectItems.find(
                            (item) => item.value === draftEntry?.project_id,
                          )?.label
                        }
                      />

                      {/* Reference */}
                      <EditableTextField
                        label="Reference"
                        value={draftEntry?.reference || ''}
                        isEditing={
                          editing?.entryId === draftEntry.entry_id &&
                          editing?.field === 'reference'
                        }
                        onSave={() =>
                          handleSaveEntry(
                            draftEntry.entry_id || '',
                            'reference',
                            draftEntry?.reference ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(draftEntry.entry_id || '')
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: draftEntry.entry_id || '',
                            field: 'reference',
                          })
                        }
                        onChange={(v) =>
                          updateDraftEntry(draftEntry.entry_id || '', {
                            reference: v || null,
                          })
                        }
                      />

                      {/* Explanation */}
                      {serverEntry?.explanation && (
                        <div className="bg-muted/50 hover:bg-muted/10 group flex cursor-pointer items-center justify-between rounded border px-2 py-1.5 text-sm transition-colors">
                          <span className="truncate">
                            {serverEntry.explanation}
                          </span>
                          <Pencil className="text-muted-foreground h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      )}

                      {/* Review Notes - Textarea */}
                      <EditableTextField
                        label="Review Notes"
                        value={draftEntry?.review_notes || ''}
                        textarea={true}
                        isEditing={
                          editing?.entryId === draftEntry.entry_id &&
                          editing?.field === 'review_notes'
                        }
                        onSave={() =>
                          handleSaveEntry(
                            draftEntry.entry_id || '',
                            'review_notes',
                            draftEntry?.review_notes ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(draftEntry.entry_id || '')
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: draftEntry.entry_id || '',
                            field: 'review_notes',
                          })
                        }
                        onChange={(v) =>
                          updateDraftEntry(draftEntry.entry_id || '', {
                            review_notes: v || null,
                          })
                        }
                      />

                      {/* Attachments */}
                      {/* File Attachments for this Entry
                    TODO: Limit no of files, size, etc
                     */}
                      <div className="space-y-2">
                        <label className="text-muted-foreground text-xs">
                          Attachments
                        </label>
                        <div className="space-y-2">
                          {(draftEntryFiles.get(draftEntry.entry_id || '')
                            ?.length ?? 0) > 0 &&
                            draftEntryFiles
                              .get(draftEntry.entry_id || '')
                              ?.map((file, fileIndex) => (
                                <div
                                  key={fileIndex}
                                  onClick={async () => {
                                    setSelectedEntryId(
                                      draftEntry.entry_id || '',
                                    );
                                    setSelectedFileIndex(fileIndex);
                                  }}
                                  className="bg-muted flex cursor-pointer items-center justify-between rounded border px-2 py-1.5 text-xs"
                                >
                                  <span className="truncate">{file.name}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeFile(
                                        draftEntry.entry_id || '',
                                        fileIndex,
                                      );
                                    }}
                                    className="hover:bg-muted/70 ml-2 rounded p-1 transition-colors"
                                  >
                                    <X className="h-2 w-2" />
                                  </button>
                                </div>
                              ))}
                          <label className="bg-muted/50 hover:bg-muted/50 flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed px-2 py-1.5 text-xs transition-colors">
                            <Upload className="h-3 w-3" />
                            <span>Upload files</span>
                            <input
                              type="file"
                              multiple
                              onChange={(e) =>
                                handleFileUpload(draftEntry.entry_id || '', e)
                              }
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Delete Entry */}
                      <button
                        onClick={() =>
                          handleDeleteEntry(draftEntry.entry_id || '')
                        }
                        className="flex w-full items-center justify-center gap-2 rounded px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                      >
                        <X className="h-3 w-3" />
                        <span>Delete Entry</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* '+ Add Entry' button */}
            <div
              className="flex w-full cursor-pointer items-center justify-center gap-1 rounded border border-dashed px-2 py-1.5 text-sm"
              onClick={handleAddEntry}
            >
              <Plus className="h-4 w-4" /> <span>Add Entry</span>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 space-y-0.5 p-2">
          {/* Add better message here later - maybe even add a message when a new entry is present (whether balanced or not)*/}
          {!balance.balanced && (
            <p className="text-destructive bg-red-50 pb-1 text-center text-xs dark:bg-red-950 dark:text-red-300">
              Total debit and credit do not match (Diff:{' '}
              {formatNumber(balance.diff, 2)})
            </p>
          )}
          {/* Total Debit and Credit */}
          {(() => {
            const totalDebit = Math.abs(
              Math.max(txn.bankAmount, 0) +
                (draftTransactionState?.entries?.reduce(
                  (sum, e) => sum + Math.max(e?.source_amount ?? 0, 0),
                  0,
                ) ?? 0),
            );
            const totalCredit = Math.abs(
              Math.min(txn.bankAmount, 0) +
                (draftTransactionState?.entries?.reduce(
                  (sum, e) => sum + Math.min(e?.source_amount ?? 0, 0),
                  0,
                ) ?? 0),
            );

            return (
              <div className="grid grid-cols-2 divide-x">
                <div className="text-center">
                  <label className="text-muted-foreground text-xs">
                    Total Debit
                  </label>
                  <p
                    className={cn(
                      'block truncate overflow-hidden text-lg',
                      totalDebit + totalCredit > 9_999_999_999 ? 'text-sm' : '',
                    )}
                  >
                    <FormattedAmount
                      amount={totalDebit}
                      currency={txn.bankAccountCurrencyCode}
                      showSymbol
                    />
                  </p>
                </div>
                <div className="text-center">
                  <label className="text-muted-foreground text-xs">
                    Total Credit
                  </label>
                  <p
                    className={cn(
                      'block truncate overflow-hidden text-lg',
                      totalDebit + totalCredit > 9_999_999_999 ? 'text-sm' : '',
                    )}
                  >
                    <FormattedAmount
                      amount={totalCredit}
                      currency={txn.bankAccountCurrencyCode}
                      showSymbol
                    />
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* File Previewer - Render once at transaction level to prevent flicker */}
      {selectedEntryId &&
        selectedFileIndex !== null &&
        (() => {
          const files = getFileAttachments(selectedEntryId);
          if (files.length === 0) return null;
          const safeIndex = Math.min(selectedFileIndex, files.length - 1);
          return (
            <FilePreviewer
              files={files}
              currentIndex={safeIndex}
              onClose={() => {
                setSelectedFileIndex(null);
                setSelectedEntryId(null);
              }}
              onNavigate={(index) => setSelectedFileIndex(index)}
            />
          );
        })()}

      {/* Dialogs */}
      {companyId && (
        <>
          <AddContactDialog
            open={contactDialogOpen}
            onOpenChange={setContactDialogOpen}
            companyId={companyId}
          />
          <AddProjectDialog
            open={projectDialogOpen}
            onOpenChange={setProjectDialogOpen}
          />
          <AddNewCoaDialog
            open={coaDialogOpen}
            onOpenChange={setCoaDialogOpen}
          />
        </>
      )}
    </div>
  );
}

interface EditableSelectFieldProps {
  label: string;
  confidence?: number;
  value: string;

  // Editing state
  isEditing: boolean;
  onEdit: () => void;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;

  // Display customization
  placeholder?: string;
  emptyText?: string;
  displayValue?: string; // Optional override for display text

  // Pass ALL AutocompleteDropdown props directly
  autocompleteProps: ComponentProps<typeof AutocompleteDropdown>;
}

export function EditableSelectField({
  label,
  value,
  isEditing,
  onEdit,
  onValueChange,
  onSave,
  onCancel,
  placeholder = 'Not set',
  emptyText = 'Not set',
  displayValue,
  autocompleteProps,
  confidence,
}: EditableSelectFieldProps) {
  // Auto-compute display value if not provided
  const getDisplayLabel = () => {
    if (displayValue !== undefined) return displayValue;
    if (!value) return emptyText;

    const { items = [], groups = [] } = autocompleteProps;

    // Check grouped data first
    if (groups.length > 0) {
      const foundItem = groups
        .flatMap((group) => group.items)
        .find((item) => item.value === value);
      if (foundItem) return foundItem.label;
    }

    // Check flat items
    if (items.length > 0) {
      const foundItem = items.find((item) => {
        // Handle both normalized and raw items
        const itemValue = typeof item === 'string' ? item : item.value;
        return itemValue === value;
      });
      if (foundItem) {
        return typeof foundItem === 'string' ? foundItem : foundItem.label;
      }
    }

    return value || emptyText;
  };

  return (
    <div className="space-y-1">
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <label>{label}</label>
        {confidence && (
          <label>
            Confidence:{' '}
            {confidence < 1
              ? Math.round(confidence * 100)
              : Math.round(confidence)}
            %
          </label>
        )}
      </div>

      <div>
        {isEditing ? (
          <div
            className="flex items-center gap-1"
            onKeyDown={(e) => {
              // Only handle ESC here - Enter is handled by AutocompleteDropdown when open
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              }
            }}
          >
            <AutocompleteDropdown
              className="min-w-0 flex-1 rounded font-normal"
              classNames={{
                commandList: 'scrollbar-thin-2px',
              }}
              onValueChange={onValueChange}
              placeholder={placeholder}
              chevron={'down'}
              {...autocompleteProps}
              value={value}
            />
            <div className="flex flex-shrink-0 gap-0.5">
              <button
                onClick={onSave}
                className="hover:bg-accent rounded p-1.5 transition-colors"
                title="Save (Enter)"
                type="button"
              >
                <Check className="h-3 w-3 text-green-400" />
              </button>
              <button
                onClick={onCancel}
                className="hover:bg-accent rounded p-1.5 transition-colors"
                title="Cancel (Esc)"
                type="button"
              >
                <X className="h-3 w-3 text-red-400" />
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={onEdit}
            className="bg-muted/50 hover:bg-muted/10 group flex cursor-pointer items-center justify-between rounded border px-2 py-1.5 text-sm transition-colors"
          >
            <span className="truncate">{getDisplayLabel()}</span>
            <Pencil className="text-muted-foreground h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        )}
      </div>
    </div>
  );
}

interface EditableTextFieldProps {
  value: string;
  label: string;
  isEditing: boolean;
  onEdit: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  textarea?: boolean;
  textareaRows?: number;
  type?: string;
}
export function EditableTextField({
  label,
  isEditing,
  value,
  onChange: onValueChange,
  onEdit,
  onSave,
  onCancel,
  textarea = false,
  textareaRows = 3,
  type = 'text',
  ...rest
}: EditableTextFieldProps & Record<string, any>) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <label>{label}</label>
      </div>

      <div>
        {isEditing ? (
          <div className="flex items-center gap-1">
            {textarea ? (
              <textarea
                rows={textareaRows}
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancel();
                  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    // Ctrl+Enter or Cmd+Enter saves for textarea
                    e.preventDefault();
                    onSave();
                  }
                }}
                className="bg-muted/50 focus:ring-ring flex-1 resize-none rounded border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none"
              />
            ) : (
              <input
                type={type || 'text'}
                {...rest}
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancel();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    onSave();
                  }
                }}
                className="bg-muted/50 focus:ring-ring h-9 flex-1 rounded border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none"
              />
            )}
            <div className="flex flex-shrink-0 gap-0.5">
              <button
                onClick={onSave}
                className="hover:bg-accent rounded p-1.5 transition-colors"
                title="Save"
                type="button"
              >
                <Check className="h-3 w-3 text-green-400" />
              </button>
              <button
                onClick={onCancel}
                className="hover:bg-accent rounded p-1.5 transition-colors"
                title="Cancel"
                type="button"
              >
                <X className="h-3 w-3 text-red-400" />
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={onEdit}
            className="bg-muted/50 hover:bg-muted/10 group flex h-9 cursor-pointer items-center justify-between rounded border px-2 py-1.5 text-sm transition-colors"
          >
            <span className="truncate">{value}</span>
            <Pencil className="text-muted-foreground h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        )}
      </div>
    </div>
  );
}

function NumberField({
  label,
  amount,
  onDraftChange,
  onCommit,
  onStartEditing,
  onEndEditing,
  isEditing,
  onEdit,
  onCancel,
  inputOnly = true,
  step,
  decimalPlaces,
}: {
  label?: string;
  amount: number;
  onDraftChange: (v: number) => void;
  onCommit: () => void;
  onStartEditing?: () => void;
  onEndEditing?: () => void;
  isEditing?: boolean;
  onEdit?: () => void;
  onCancel?: () => void;
  inputOnly?: boolean;
  step?: number;
  decimalPlaces?: number;
}) {
  const [display, setDisplay] = useState('');
  // Track internal editing state when inputOnly is true
  const [internalIsEditing, setInternalIsEditing] = useState(false);

  // Use internal state if inputOnly, otherwise use prop
  const actuallyEditing = inputOnly ? internalIsEditing : (isEditing ?? false);

  // Sync internal display with external amount only when not editing
  // or when the amount changes from an outside source.
  useEffect(() => {
    // Don't sync display while user is editing
    if (actuallyEditing) return;

    if (amount > 0) {
      setDisplay(formatNumber(amount, decimalPlaces));
    } else {
      setDisplay('');
    }
  }, [amount, actuallyEditing, decimalPlaces]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Pass decimalPlaces to allow 6 decimals for exchange rate
    const maxDecimals = decimalPlaces || 2;
    if (!isValidNumericInput(raw, maxDecimals)) return;

    setDisplay(raw);
    const parsed = parseNumber(raw);
    onDraftChange(parsed);
  };

  const handleBlur = () => {
    setInternalIsEditing(false);
    onEndEditing?.();
    setDisplay(formatNumber(amount, decimalPlaces));
    onCommit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setInternalIsEditing(false);
      onEndEditing?.();
      onCancel?.();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setInternalIsEditing(false);
      onEndEditing?.();
      if (amount > 0) {
        setDisplay(formatNumber(amount, decimalPlaces));
      }
      onCommit();
    }
  };

  const handleFocus = () => {
    setInternalIsEditing(true);
    onStartEditing?.();
  };

  const inputEl = (
    <input
      type="text"
      inputMode="decimal"
      step={step}
      placeholder="0.00"
      value={display}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="bg-muted/50 focus:ring-ring w-full rounded border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none"
    />
  );

  // Cleaned up Ternary Logic
  if (inputOnly) {
    return inputEl;
  }

  return (
    <div className="space-y-1">
      {label && (
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <label>{label}</label>
        </div>
      )}
      <div>
        {isEditing ? (
          <div className="flex items-center gap-1">
            {inputEl}
            <div className="flex flex-shrink-0 gap-0.5">
              <button
                onClick={onCommit}
                className="hover:bg-accent rounded p-1.5 transition-colors"
                title="Save"
                type="button"
              >
                <Check className="h-3 w-3 text-green-400" />
              </button>
              <button
                onClick={onCancel}
                className="hover:bg-accent rounded p-1.5 transition-colors"
                title="Cancel"
                type="button"
              >
                <X className="h-3 w-3 text-red-400" />
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={onEdit}
            className="bg-muted/50 hover:bg-muted/10 group flex h-9 cursor-pointer items-center justify-between rounded border px-2 py-1.5 text-sm transition-colors"
          >
            <span className="truncate">{display || '0.00'}</span>
            <Pencil className="text-muted-foreground h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        )}
      </div>
    </div>
  );
}

function parseNumber(v: string): number {
  return Number(v.replace(/,/g, '')) || 0;
}

function formatNumber(n: number, decimalPlaces = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(n);
}

function isValidNumericInput(v: string, maxDecimalPlaces: number = 2) {
  const pattern =
    maxDecimalPlaces > 0
      ? `^[0-9,]*\\.?[0-9]{0,${maxDecimalPlaces}}$`
      : `^[0-9,]*$`;
  return new RegExp(pattern).test(v);
}

function createTypedBlobUrl(file: File): string {
  const type =
    file.type ||
    (file.name.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : 'application/octet-stream');

  const blob = new Blob([file], { type });
  return URL.createObjectURL(blob);
}
