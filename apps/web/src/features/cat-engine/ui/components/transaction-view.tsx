import type {
  CategorizationTransactionFile,
  GroupedTransaction,
} from '@/modules/accounting/categorization';
import type { ContactResponse } from '@/modules/contacts';
import type { ProjectsResponse } from '@/modules/projects';
import type {
  LedgerIntentDesiredState,
  LedgerIntentEntry,
} from '@accountable-books/contracts/schema';
import type { ChangeEvent, ComponentProps, KeyboardEvent } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useLedgerIntentUpdaterV2 } from '@/modules/accounting/categorization';
import { useContactsInfinite } from '@/modules/contacts';
import {
  getObjectDownloadUrl,
  useUploadTransactionFiles,
} from '@/modules/objects';
import {
  TRANSACTION_FILE_LIMITS,
  TRANSACTION_FILE_LIMITS_BYTES,
} from '@/modules/objects/constants';
import { useProjectsInfinite } from '@/modules/projects';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Landmark,
  Lock,
  Pencil,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

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
  const {
    updateEntry,
    updateExchangeRate,
    deleteEntry,
    addEntry,
    getEntriesUI,
    getPendingExchangeRate,
  } = useLedgerIntentUpdaterV2(txn);

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
  // Store both server files (CategorizationTransactionFile) and newly uploaded files (File)
  const [draftEntryFiles, setDraftEntryFiles] = useState<
    Map<string, (CategorizationTransactionFile | File)[]>
  >(new Map());
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(
    null,
  );
  const [_isEditingAmount, setIsEditingAmount] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [draftExchangeRate, setDraftExchangeRate] = useState<number | null>(
    null,
  );
  // Map of file key -> presigned URL for server files
  const [presignedUrls, setPresignedUrls] = useState<Map<string, string>>(
    new Map(),
  );
  // Track file keys whose presigned URL fetch failed
  const [failedPresignedUrls, setFailedPresignedUrls] = useState<Set<string>>(
    new Set(),
  );
  // Map of File object -> blob URL for new files
  const [blobUrls, setBlobUrls] = useState<Map<File, string>>(new Map());
  const blobUrlsRef = useRef<Map<File, string>>(new Map());
  const uploadingFilesRef = useRef<Set<string>>(new Set());
  // Track which file keys have already been requested for presigned URLs (prevents cascade re-fetches)
  const requestedPresignedKeysRef = useRef<Set<string>>(new Set());
  // Track which files have been saved (keyed by entryId:fileName:fileSize)
  const [savedFiles, setSavedFiles] = useState<Set<string>>(new Set());
  // Local, per-entry drafts to avoid mutating manager state before save.
  const [draftEntries, setDraftEntries] = useState<
    Map<string, Partial<LedgerIntentEntry>>
  >(new Map());

  // Helper function to create file key for savedFiles tracking
  const getFileKey = useCallback((entryId: string, file: File) => {
    return `${entryId}:${file.name}:${file.size}`;
  }, []);

  const uploadTxnFilesMutation = useUploadTransactionFiles();

  useEffect(() => {
    blobUrlsRef.current = blobUrls;
  }, [blobUrls]);

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

  const coaLabelById = useMemo(() => {
    const map = new Map<string, string>();
    groupedCoaData.forEach((group) => {
      group.items.forEach((item) => map.set(item.value, item.label));
    });
    return map;
  }, [groupedCoaData]);

  // const intent = useMemo(() => {
  //   return {
  //     // intent_id: uuidv4(),
  //     bank_transaction_id: txn.id,
  //     desired_state: draftTransactionState,
  //   };
  // }, [draftTransactionState, txn.id]);

  useEffect(() => {
    if (!txn) return;

    const entriesUI = getEntriesUI();
    const filesByEntryId = new Map<string, CategorizationTransactionFile[]>();
    entriesUI.forEach((entry) => {
      if (!entry.uiEntryId) return;
      filesByEntryId.set(entry.uiEntryId, entry.files || []);
    });
    setDraftEntryFiles(filesByEntryId);
    // Reset presigned URL tracking so the new transaction's files get fetched
    requestedPresignedKeysRef.current.clear();
  }, [txn, getEntriesUI]);

  const toggleEntry = (entryId: string) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedEntries(newExpanded);
  };

  const entriesUI = getEntriesUI();
  // Ref for effects that need to read the latest entries without triggering on every render.
  // The entriesUI array is always a new reference (manager design constraint), so using it
  // as an effect dependency means "fire every render". Effects use this ref instead.
  const entriesUIRef = useRef(entriesUI);
  entriesUIRef.current = entriesUI;
  const entriesUISignature = useMemo(() => {
    return entriesUI
      .map(
        (entry) =>
          `${entry.uiEntryId}:${entry.ledgerEntryId ?? ''}:${
            entry.files?.length ?? 0
          }`,
      )
      .join('|');
  }, [entriesUI]);
  const entryIdsSignature = useMemo(
    () => entriesUI.map((entry) => entry.uiEntryId).join('|'),
    [entriesUI],
  );
  // Index entries by UI id to avoid repeated linear searches.
  const entriesUIById = useMemo(() => {
    const map = new Map<string, (typeof entriesUI)[number]>();
    entriesUI.forEach((entry) => map.set(entry.uiEntryId, entry));
    return map;
  }, [entriesUI]);

  function getEntryUI(entryId: string) {
    const entry = entriesUIById.get(entryId);
    if (!entry) return undefined;
    const draft = draftEntries.get(entryId);
    return draft ? { ...entry, ...draft } : entry;
  }

  function getBaseEntryUI(entryId: string) {
    return entriesUIById.get(entryId);
  }

  function updateEntryDraft(
    entryId: string,
    patch: Partial<LedgerIntentEntry>,
  ) {
    if (!getBaseEntryUI(entryId)) return;
    setDraftEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(entryId) || {};
      next.set(entryId, { ...existing, ...patch });
      return next;
    });
  }

  // Clear a single draft field after a successful commit.
  const clearDraftField = useCallback(
    (entryId: string, field: keyof LedgerIntentEntry) => {
      setDraftEntries((prev) => {
        const current = prev.get(entryId);
        if (!current || !(field in current)) return prev;
        const next = new Map(prev);
        const updated = { ...current };
        delete updated[field];
        if (Object.keys(updated).length === 0) {
          next.delete(entryId);
        } else {
          next.set(entryId, updated);
        }
        return next;
      });
    },
    [],
  );

  function resetDraftEntryFromTxn(entryId: string) {
    if (!getBaseEntryUI(entryId)) return;
    setDraftEntries((prev) => {
      if (!prev.has(entryId)) return prev;
      const next = new Map(prev);
      next.delete(entryId);
      return next;
    });
  }

  function hasEntryChanged(entryId: string): boolean {
    const draft = draftEntries.get(entryId);
    if (!draft) return false;

    const base = getBaseEntryUI(entryId);
    if (!base) return false;

    const server = txn.entries?.find((e) => {
      const ledgerEntryId = base.ledgerEntryId || base.uiEntryId;
      return e.ledgerEntryId === ledgerEntryId || e.id === ledgerEntryId;
    });

    if (!server) {
      return true;
    }

    const fields: Array<keyof LedgerIntentEntry> = [
      'coa_id',
      'contact_id',
      'project_id',
      'description',
      'reference',
      'source_amount',
      'fs_date',
      'review_notes',
    ];

    for (const field of fields) {
      if (!(field in draft)) continue;
      const draftValue = draft[field];
      let serverValue: unknown;
      switch (field) {
        case 'coa_id':
          serverValue = server.coaId ?? '';
          break;
        case 'contact_id':
          serverValue = server.contactId ?? null;
          break;
        case 'project_id':
          serverValue = server.projectId ?? null;
          break;
        case 'description':
          serverValue = server.description ?? null;
          break;
        case 'reference':
          serverValue = server.reference ?? null;
          break;
        case 'source_amount':
          serverValue = server.nativeAmount ?? null;
          break;
        case 'fs_date':
          serverValue = server.fsDate || server.date || null;
          break;
        case 'review_notes':
          serverValue = server.reviewNotes ?? null;
          break;
        default:
          serverValue = undefined;
      }
      if (draftValue !== serverValue) return true;
    }

    return false;
  }

  // Type guard to check if file is a server file
  function isServerFile(
    file: CategorizationTransactionFile | File,
  ): file is CategorizationTransactionFile {
    return 'id' in file && 'key' in file;
  }

  // Merge server files into draftEntryFiles when server data refreshes.
  // Uses entriesUIRef to avoid re-running on every render (entriesUI is always a new array).
  useEffect(() => {
    const entries = entriesUIRef.current;
    if (!entries.length) return;
    setDraftEntryFiles((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const entry of entries) {
        const existing = next.get(entry.uiEntryId) || [];
        const localFiles = existing.filter((file) => !isServerFile(file));
        const serverFiles = entry.files || [];
        const existingServerKeys = existing
          .filter(isServerFile)
          .map((file) => file.key)
          .sort();
        const incomingServerKeys = serverFiles.map((file) => file.key).sort();
        const serverChanged =
          existingServerKeys.length !== incomingServerKeys.length ||
          existingServerKeys.some(
            (key, index) => key !== incomingServerKeys[index],
          );
        if (serverChanged) {
          const merged = [...serverFiles, ...localFiles];
          next.set(entry.uiEntryId, merged);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [entriesUISignature]);

  useEffect(() => {
    // Drop drafts for entries that no longer exist in the UI list.
    if (draftEntries.size === 0) return;
    const currentEntryIds = new Set(
      entriesUIRef.current.map((e) => e.uiEntryId),
    );
    setDraftEntries((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const entryId of prev.keys()) {
        if (!currentEntryIds.has(entryId)) {
          next.delete(entryId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [entryIdsSignature, draftEntries.size]);

  // Sync blob URLs: create for new files, revoke for removed files (single effect)
  useEffect(() => {
    setBlobUrls((prev) => {
      // Collect all active local files
      const activeFiles = new Set<File>();
      for (const files of draftEntryFiles.values()) {
        for (const file of files) {
          if (!isServerFile(file)) {
            activeFiles.add(file);
          }
        }
      }

      const next = new Map(prev);
      let changed = false;

      // Create blob URLs for new files
      for (const file of activeFiles) {
        if (!next.has(file)) {
          next.set(file, createTypedBlobUrl(file));
          changed = true;
        }
      }

      // Revoke and remove blob URLs for files no longer active
      for (const [file, url] of prev.entries()) {
        if (!activeFiles.has(file)) {
          URL.revokeObjectURL(url);
          next.delete(file);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [draftEntryFiles]);

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
            if (failedPresignedUrls.has(file.key)) {
              // Fetch failed - show placeholder so file isn't silently hidden
              attachments.push({
                file_name: file.name,
                url: '',
                type: file.type,
                size: Number(file.size_bytes),
              });
            }
            // Otherwise URL not yet available - will be fetched by useEffect
            continue;
          }
          attachments.push({
            file_name: file.name,
            url,
            type: file.type,
            size: Number(file.size_bytes),
          });
        } else {
          // New file - use blob URL
          const blobUrl = blobUrls.get(file);
          if (!blobUrl) continue;

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
    [draftEntryFiles, presignedUrls, failedPresignedUrls, blobUrls],
  );

  function canPersistEntry(entryId: string): boolean {
    const entry = getEntryUI(entryId);
    if (!entry) {
      return false;
    }

    // 0. Nothing changed → nothing to do
    const hasChanged = hasEntryChanged(entryId);
    if (!hasChanged) {
      return false;
    }

    // 1. Entry must be categorizable
    if (!entry.coa_id) {
      return false;
    }

    // 2. Transaction must be balanced
    if (!balance.balanced) {
      return false;
    }

    return true;
  }

  // Simpler check for file uploads - doesn't require entry fields to have changed
  function canAcceptFiles(entryId: string): boolean {
    const entry = getEntryUI(entryId);
    if (!entry) return false;

    // Entry must be categorizable
    if (!entry.coa_id) return false;

    // Transaction must be balanced
    if (!balance.balanced) return false;

    return true;
  }

  // Memoize balance calculation to avoid repeated computation
  const entriesForCalc = useMemo(() => {
    if (!entriesUI.length) return [];
    return entriesUI.map((entry) => {
      const draft = draftEntries.get(entry.uiEntryId);
      return draft ? { ...entry, ...draft } : entry;
    });
  }, [entriesUI, draftEntries]);

  const balance = useMemo(() => {
    if (!entriesForCalc.length) return { balanced: false, diff: 0 };

    const entriesTotal = entriesForCalc.reduce(
      (sum, e) => sum + (e.source_amount ?? 0),
      0,
    );

    return {
      balanced: Math.abs(entriesTotal + txn.bankAmount) < 0.0001,
      diff: entriesTotal + txn.bankAmount,
    };
  }, [entriesForCalc, txn.bankAmount]);

  // Auto-save files when entry becomes valid
  const handleAutoSaveFiles = async (entryId: string) => {
    // No fallback - maintain invariant that files are never uploaded pre-ledger
    if (!txn.ledgerTransactionId) {
      return;
    }

    if (!companyId || !canAcceptFiles(entryId)) return;

    const files = draftEntryFiles.get(entryId) || [];
    const newFiles = files.filter((file) => {
      if (isServerFile(file)) return false;
      const key = getFileKey(entryId, file);
      if (savedFiles.has(key)) return false;
      if (uploadingFilesRef.current.has(key)) return false;
      return true;
    }) as File[];

    if (newFiles.length === 0) return;

    try {
      const entry = getEntryUI(entryId);
      const ledgerEntryId = entry?.ledgerEntryId;
      if (!ledgerEntryId) return;

      newFiles.forEach((file) => {
        uploadingFilesRef.current.add(getFileKey(entryId, file));
      });

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
    } catch (_error) {
      toast.error('File upload failed. Please try again.');
    } finally {
      newFiles.forEach((file) => {
        uploadingFilesRef.current.delete(getFileKey(entryId, file));
      });
    }
  };

  const handleSaveEntry = (entryId: string, field: EntryField, value: any) => {
    if (txn.isEditable === false) {
      toast.error(
        'This transaction is in a locked period and cannot be edited',
      );
      return;
    }
    // Always call updateEntry - let emitter handle accumulation and validation
    updateEntry(entryId, { [field]: value });
    clearDraftField(entryId, field);

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
    if (txn.isEditable === false) {
      toast.error(
        'This transaction is in a locked period and cannot be edited',
      );
      return;
    }
    const newEntryId = addEntry({
      coa_id: null,
      fs_date: txn.date,
      description: null,
      reference: null,
      contact_id: null,
      project_id: null,
      source_amount: 0,
    });

    // Initialize empty files array for the new entry
    setDraftEntryFiles((prev) => {
      const newFilesMap = new Map(prev);
      newFilesMap.set(newEntryId, []);
      return newFilesMap;
    });
  };

  const handleDeleteEntry = (entryId: string) => {
    if (txn.isEditable === false) {
      toast.error(
        'This transaction is in a locked period and cannot be edited',
      );
      return;
    }
    // Always call deleteEntry - it handles both new and existing entries
    // For new entries: removes from desiredState.entries (prevents sending)
    // For existing entries: tracks deletion in deleted_entry_ids
    deleteEntry(entryId);
    setDraftEntries((prev) => {
      if (!prev.has(entryId)) return prev;
      const next = new Map(prev);
      next.delete(entryId);
      return next;
    });

    // Remove files for the deleted entry
    setDraftEntryFiles((prev) => {
      const newFilesMap = new Map(prev);
      newFilesMap.delete(entryId);
      return newFilesMap;
    });
  };

  const handleFileUpload = (
    entryId: string,
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    if (txn.isEditable === false) {
      toast.error(
        'This transaction is in a locked period and cannot be edited',
      );
      e.target.value = '';
      return;
    }
    if (!e.target.files) return;

    const newFiles = Array.from(e.target.files);
    const existingFiles = draftEntryFiles.get(entryId) || [];
    const existingLocalFiles = existingFiles.filter(
      (file) => !isServerFile(file),
    ) as File[];

    // Validate file count limit
    const totalFileCount = existingLocalFiles.length + newFiles.length;
    if (totalFileCount > TRANSACTION_FILE_LIMITS.MAX_FILES_PER_ENTRY) {
      toast.error(
        `Maximum ${TRANSACTION_FILE_LIMITS.MAX_FILES_PER_ENTRY} files allowed per entry. You have ${existingLocalFiles.length} file(s) and tried to add ${newFiles.length} more.`,
      );
      e.target.value = '';
      return;
    }

    // Validate individual file sizes
    const oversizedFiles = newFiles.filter(
      (file) => file.size > TRANSACTION_FILE_LIMITS_BYTES.MAX_FILE_SIZE_BYTES,
    );
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map((f) => f.name).join(', ');
      toast.error(
        `File(s) exceed ${TRANSACTION_FILE_LIMITS.MAX_FILE_SIZE_MB}MB limit: ${fileNames}. Please upload smaller files.`,
      );
      e.target.value = '';
      return;
    }

    // Validate total size limit
    const existingTotalSize = existingLocalFiles.reduce(
      (sum, file) => sum + file.size,
      0,
    );
    const newTotalSize = newFiles.reduce((sum, file) => sum + file.size, 0);
    const combinedTotalSize = existingTotalSize + newTotalSize;

    if (
      combinedTotalSize > TRANSACTION_FILE_LIMITS_BYTES.MAX_TOTAL_SIZE_BYTES
    ) {
      toast.error(
        `Total file size exceeds ${TRANSACTION_FILE_LIMITS.MAX_TOTAL_SIZE_MB}MB limit per entry. Current: ${(existingTotalSize / (1024 * 1024)).toFixed(2)}MB, Adding: ${(newTotalSize / (1024 * 1024)).toFixed(2)}MB.`,
      );
      e.target.value = '';
      return;
    }

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
      const currentFiles = newFilesMap.get(entryId) || [];
      newFilesMap.set(entryId, [...currentFiles, ...newFiles]);
      return newFilesMap;
    });

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

  // Auto-save files when entry becomes valid or when files are added.
  // Uses entriesUIRef to avoid re-running on every render. Triggers on file/save changes.
  useEffect(() => {
    const entries = entriesUIRef.current;
    if (!entries.length || !companyId) return;

    entries.forEach((entry) => {
      if (entry.ledgerEntryId && canAcceptFiles(entry.uiEntryId)) {
        const files = draftEntryFiles.get(entry.uiEntryId) || [];
        const hasUnsavedFiles = files.some(
          (file) =>
            !isServerFile(file) &&
            !savedFiles.has(getFileKey(entry.uiEntryId, file)),
        );

        if (hasUnsavedFiles) {
          handleAutoSaveFiles(entry.uiEntryId);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftEntryFiles, savedFiles, companyId, getFileKey, entriesUISignature]);

  // Fetch presigned URLs for server files that need them.
  // Uses a ref to track requested keys so that state updates from responses
  // don't re-trigger this effect (breaking the cascade loop).
  useEffect(() => {
    if (!companyId) return;

    const requested = requestedPresignedKeysRef.current;
    const filesNeedingUrls: string[] = [];

    for (const files of draftEntryFiles.values()) {
      for (const file of files) {
        if (isServerFile(file) && !requested.has(file.key)) {
          filesNeedingUrls.push(file.key);
        }
      }
    }

    if (filesNeedingUrls.length === 0) return;

    // Mark all as requested before firing to prevent duplicates
    for (const key of filesNeedingUrls) {
      requested.add(key);
    }

    for (const key of filesNeedingUrls) {
      getObjectDownloadUrl({
        companyId,
        bucketType: 'txnFiles',
        fileKey: key,
        timeout: 3600,
      })
        .then((downloadUrlResponse) => {
          if (downloadUrlResponse.success && downloadUrlResponse.data) {
            setPresignedUrls((prev) =>
              new Map(prev).set(key, downloadUrlResponse.data!.url),
            );
            setFailedPresignedUrls((prev) => {
              if (!prev.has(key)) return prev;
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          } else {
            setFailedPresignedUrls((prev) => new Set(prev).add(key));
          }
        })
        .catch(() => {
          setFailedPresignedUrls((prev) => new Set(prev).add(key));
        });
    }
  }, [companyId, draftEntryFiles]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  const isFxTransaction =
    txn?.bankAccountCurrencyCode !== txn?.reportingCurrencyCode;
  const pendingExchangeRate = getPendingExchangeRate();
  const isLocked = txn.isEditable === false;

  if (!txn) {
    return null;
  }

  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 flex-col gap-4 overflow-hidden rounded-md border text-sm',
      )}
    >
      <div>
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
        {isLocked && (
          <div className="bg-muted/50 text-muted-foreground flex items-center gap-2 px-4 py-2 text-sm">
            <Lock className="h-4 w-4" />
            <span>
              This transaction is in a locked period. Editing is disabled.
            </span>
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col divide-y',
          isLocked && 'pointer-events-none opacity-60',
        )}
      >
        <div className="grid shrink-0 grid-cols-2 items-center gap-4 p-4 pt-0">
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
                  className="bg-muted dark:bg-foreground/70 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border"
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
            <p className="">{pendingExchangeRate ?? txn.exchangeRate}</p>
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
                amount={
                  draftExchangeRate ??
                  pendingExchangeRate ??
                  Number(txn.exchangeRate || 1)
                }
                step={0.0001}
                isEditing={editing?.entryId === 'exchange_rate'}
                onEdit={() =>
                  setEditing({
                    entryId: 'exchange_rate',
                    field: 'custom_exchange_rate',
                  })
                }
                onDraftChange={(v) => {
                  setDraftExchangeRate(v);
                }}
                onCommit={() => {
                  // Simple check: if rate changed and is valid, save it
                  const originalRate = parseFloat(txn.exchangeRate.toString());
                  const newRate = draftExchangeRate;
                  if (
                    newRate &&
                    newRate > 0 &&
                    Math.abs(originalRate - newRate) > 0.000001
                  ) {
                    updateExchangeRate(newRate);
                  }
                  setDraftExchangeRate(null);
                  setEditing(null);
                }}
                onCancel={() => {
                  setDraftExchangeRate(null);
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
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {txn.bankAmount < 0 ? 'CR' : 'DR'}
                    </span>
                    <div
                      className="truncate text-sm"
                      title={txn.bankAccountCoaName ?? txn.bankAccountName}
                    >
                      {txn.bankAccountCoaName ?? txn.bankAccountName}
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      (Bank Leg)
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
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

            {entriesUI.map((baseEntry) => {
              const entryId = baseEntry.uiEntryId;
              const draftPatch = draftEntries.get(entryId);
              const entryView = draftPatch
                ? { ...baseEntry, ...draftPatch }
                : baseEntry;
              const serverEntry = txn.entries?.find((e) => {
                const ledgerEntryId =
                  baseEntry.ledgerEntryId || baseEntry.uiEntryId;
                return (
                  e.ledgerEntryId === ledgerEntryId || e.id === ledgerEntryId
                );
              });

              const sourceAmt = entryView.source_amount ?? 0;
              const debitValue = sourceAmt > 0 ? sourceAmt : '';
              const creditValue = sourceAmt < 0 ? Math.abs(sourceAmt) : '';

              return (
                <div
                  key={baseEntry.uiEntryId}
                  className="overflow-hidden rounded border"
                >
                  <div className="bg-muted hover:bg-muted/50 px-3 py-2 transition-colors">
                    {/* Entry Header */}
                    <div
                      onClick={() => toggleEntry(baseEntry.uiEntryId)}
                      className="flex cursor-pointer items-center justify-between gap-4 overflow-clip"
                    >
                      <div className="flex min-w-0 items-center gap-1 overflow-clip">
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {sourceAmt < 0 ? 'CR' : 'DR'}
                        </span>
                        <span className="truncate text-sm">
                          {coaLabelById.get(entryView.coa_id ?? '') ??
                            'Not set'}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
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
                        {expandedEntries.has(baseEntry.uiEntryId) ? (
                          <ChevronUp className="text-muted-foreground h-4 w-4" />
                        ) : (
                          <ChevronDown className="text-muted-foreground h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Entry Details - Expanded */}
                  {expandedEntries.has(baseEntry.uiEntryId) && (
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
                        value={entryView?.coa_id ?? ''}
                        isEditing={
                          editing?.entryId === baseEntry.uiEntryId &&
                          editing?.field === 'coa_id'
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: baseEntry.uiEntryId || '',
                            field: 'coa_id',
                          })
                        }
                        onValueChange={(value) => {
                          updateEntryDraft(baseEntry.uiEntryId || '', {
                            coa_id: value,
                          });
                        }}
                        onSave={() => {
                          handleSaveEntry(
                            baseEntry.uiEntryId || '',
                            'coa_id',
                            entryView?.coa_id,
                          );
                        }}
                        onCancel={() =>
                          handleCancelEntry(baseEntry.uiEntryId || '')
                        }
                        autocompleteProps={{
                          id: `coa-${baseEntry.uiEntryId}`,
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
                            .find((item) => item.value === entryView?.coa_id)
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
                          <NumberField
                            amount={debitValue || 0}
                            onDraftChange={(v) =>
                              updateEntryDraft(baseEntry.uiEntryId || '', {
                                source_amount: v,
                              })
                            }
                            onCommit={() => {
                              // Always call updateEntry - let emitter handle accumulation and validation
                              updateEntry(baseEntry.uiEntryId || '', {
                                source_amount:
                                  entryView.source_amount ?? undefined,
                              });
                              clearDraftField(
                                baseEntry.uiEntryId || '',
                                'source_amount',
                              );
                            }}
                            onStartEditing={() => setIsEditingAmount(true)}
                            onEndEditing={() => setIsEditingAmount(false)}
                          />

                          {isFxTransaction && (serverEntry?.spent ?? 0) > 0 && (
                            <span className="text-muted-foreground text-xs">
                              ≃ {txn.reportingCurrencySymbol}{' '}
                              {formatNumber(
                                Number(
                                  pendingExchangeRate ?? txn.exchangeRate,
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
                              updateEntryDraft(baseEntry.uiEntryId || '', {
                                source_amount: v * -1,
                              })
                            }
                            onCommit={() => {
                              if (canPersistEntry(baseEntry.uiEntryId || '')) {
                                // Always call updateEntry - let emitter handle accumulation and validation
                                updateEntry(baseEntry.uiEntryId || '', {
                                  source_amount:
                                    entryView.source_amount ?? undefined,
                                });
                                clearDraftField(
                                  baseEntry.uiEntryId || '',
                                  'source_amount',
                                );
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
                                    pendingExchangeRate ?? txn.exchangeRate,
                                  ) * (serverEntry?.received || 0),
                                )}
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Description */}
                      <EditableTextField
                        label="Description"
                        value={entryView?.description || ''}
                        isEditing={
                          editing?.entryId === baseEntry.uiEntryId &&
                          editing?.field === 'description'
                        }
                        onSave={() =>
                          handleSaveEntry(
                            baseEntry.uiEntryId || '',
                            'description',
                            entryView?.description ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(baseEntry.uiEntryId || '')
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: baseEntry.uiEntryId || '',
                            field: 'description',
                          })
                        }
                        onChange={(v) =>
                          updateEntryDraft(baseEntry.uiEntryId || '', {
                            description: v || null,
                          })
                        }
                      />

                      {/* Contact */}
                      <EditableSelectField
                        label="Contact"
                        value={entryView?.contact_id ?? ''}
                        isEditing={
                          editing?.entryId === baseEntry.uiEntryId &&
                          editing?.field === 'contact_id'
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: baseEntry.uiEntryId || '',
                            field: 'contact_id',
                          })
                        }
                        onValueChange={(value) => {
                          updateEntryDraft(baseEntry.uiEntryId || '', {
                            contact_id: value || null,
                          });
                        }}
                        onSave={() =>
                          handleSaveEntry(
                            baseEntry.uiEntryId || '',
                            'contact_id',
                            entryView?.contact_id ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(baseEntry.uiEntryId || '')
                        }
                        autocompleteProps={{
                          id: `contact-${baseEntry.uiEntryId}`,
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
                            (item) => item.value === entryView?.contact_id,
                          )?.label
                        }
                      />

                      {/* Project */}
                      <EditableSelectField
                        label="Project"
                        value={entryView?.project_id || ''}
                        isEditing={
                          editing?.entryId === baseEntry.uiEntryId &&
                          editing?.field === 'project_id'
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: baseEntry.uiEntryId || '',
                            field: 'project_id',
                          })
                        }
                        onValueChange={(value) => {
                          updateEntryDraft(baseEntry.uiEntryId || '', {
                            project_id: value || null,
                          });
                        }}
                        onSave={() =>
                          handleSaveEntry(
                            baseEntry.uiEntryId || '',
                            'project_id',
                            entryView?.project_id ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(baseEntry.uiEntryId || '')
                        }
                        autocompleteProps={{
                          id: `project-${baseEntry.uiEntryId}`,
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
                            (item) => item.value === entryView?.project_id,
                          )?.label
                        }
                      />

                      {/* Reference */}
                      <EditableTextField
                        label="Reference"
                        value={entryView?.reference || ''}
                        isEditing={
                          editing?.entryId === baseEntry.uiEntryId &&
                          editing?.field === 'reference'
                        }
                        onSave={() =>
                          handleSaveEntry(
                            baseEntry.uiEntryId || '',
                            'reference',
                            entryView?.reference ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(baseEntry.uiEntryId || '')
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: baseEntry.uiEntryId || '',
                            field: 'reference',
                          })
                        }
                        onChange={(v) =>
                          updateEntryDraft(baseEntry.uiEntryId || '', {
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
                          <Pencil className="text-muted-foreground h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      )}

                      {/* Review Notes - Textarea */}
                      <EditableTextField
                        label="Review Notes"
                        value={entryView?.review_notes || ''}
                        textarea={true}
                        isEditing={
                          editing?.entryId === baseEntry.uiEntryId &&
                          editing?.field === 'review_notes'
                        }
                        onSave={() =>
                          handleSaveEntry(
                            baseEntry.uiEntryId || '',
                            'review_notes',
                            entryView?.review_notes ?? null,
                          )
                        }
                        onCancel={() =>
                          handleCancelEntry(baseEntry.uiEntryId || '')
                        }
                        onEdit={() =>
                          setEditing({
                            entryId: baseEntry.uiEntryId || '',
                            field: 'review_notes',
                          })
                        }
                        onChange={(v) =>
                          updateEntryDraft(baseEntry.uiEntryId || '', {
                            review_notes: v || null,
                          })
                        }
                      />

                      {/* Attachments */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-muted-foreground text-xs">
                            Attachments
                          </label>
                          <span className="text-muted-foreground text-xs">
                            {draftEntryFiles.get(baseEntry.uiEntryId || '')
                              ?.length ?? 0}
                            /{TRANSACTION_FILE_LIMITS.MAX_FILES_PER_ENTRY} files
                          </span>
                        </div>
                        <div className="space-y-2">
                          {(draftEntryFiles.get(baseEntry.uiEntryId || '')
                            ?.length ?? 0) > 0 &&
                            draftEntryFiles
                              .get(baseEntry.uiEntryId || '')
                              ?.map((file, fileIndex) => (
                                <div
                                  key={fileIndex}
                                  onClick={async () => {
                                    setSelectedEntryId(
                                      baseEntry.uiEntryId || '',
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
                                        baseEntry.uiEntryId || '',
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
                                handleFileUpload(baseEntry.uiEntryId || '', e)
                              }
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Delete Entry */}
                      <button
                        onClick={() =>
                          handleDeleteEntry(baseEntry.uiEntryId || '')
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
              className={cn(
                'flex w-full items-center justify-center gap-1 rounded border border-dashed px-2 py-1.5 text-sm',
                isLocked ? 'cursor-not-allowed opacity-50' : '!cursor-pointer',
              )}
              onClick={isLocked ? undefined : handleAddEntry}
            >
              <Plus className="h-4 w-4" /> <span>Add Entry</span>
            </div>
          </div>
        </div>

        <div className="shrink-0 space-y-0.5 p-2">
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
                (entriesForCalc.reduce(
                  (sum, e) => sum + Math.max(e?.source_amount ?? 0, 0),
                  0,
                ) ?? 0),
            );
            const totalCredit = Math.abs(
              Math.min(txn.bankAmount, 0) +
                (entriesForCalc.reduce(
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
          const files = getFileAttachments(selectedEntryId!);
          if (files.length === 0) return null;
          const safeIndex = Math.min(selectedFileIndex!, files.length - 1);
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
            companyId={companyId || ''}
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

export const EditableSelectField = memo(function EditableSelectField({
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
            <div className="flex shrink-0 gap-0.5">
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
            <Pencil className="text-muted-foreground h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        )}
      </div>
    </div>
  );
});

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
export const EditableTextField = memo(function EditableTextField({
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
            <div className="flex shrink-0 gap-0.5">
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
            <Pencil className="text-muted-foreground h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        )}
      </div>
    </div>
  );
});

const NumberField = memo(function NumberField({
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

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
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
            <div className="flex shrink-0 gap-0.5">
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
            <Pencil className="text-muted-foreground h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        )}
      </div>
    </div>
  );
});

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
  return URL.createObjectURL(file);
}
