import type {
  GetJournalResponse,
  JournalBatchInput,
  JournalFileInput,
} from '@accountable-books/contracts/schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AiAssistButton } from '@/components/ai/ai-assist-button';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { CenteredLoader } from '@/components/CenteredLoader';
import { DatePicker } from '@/components/date-picker/date-picker';
import ErrorPage from '@/components/ErrorPage';
import { FileUploader } from '@/components/FileUploader';
import { FormattedAmount } from '@/components/FormattedAmount';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useChartOfAccountsQuery } from '@/modules/accounting/chart-of-accounts';
import {
  useCopyJournal,
  useCreateJournal,
  useJournal,
  usePostJournal,
  usePreviewRecurringTemplate,
  useRecurringTemplate,
  useReverseJournal,
  useRunRecurringTemplateNow,
  useUpdateJournal,
  useUpdateRecurringTemplateStatus,
  useVoidJournal,
} from '@/modules/accounting/journals';
import { useContacts } from '@/modules/contacts/model/hooks';
import { getObjectUploadUrl, uploadFileToR2 } from '@/modules/objects/api';
import { useIsMobile, useMediaQuery } from '@/shared/hooks/use-media-query';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Eye,
  Loader2,
  Paperclip,
  Plus,
  Repeat,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  getAllowedActionsForJournal,
  getAllowedActionsForTemplate,
} from '../config/journal-actions';
import { getShortcutModifierLabel } from '../lib/shortcut-ui';
import { EmptyState } from './empty-state';
import { JournalDetailHeader } from './journal-detail-header';

import type { JournalAction, TemplateAction } from '../config/journal-actions';
import type { JournalDetailHeaderAction } from './journal-detail-header';

type EditableLine = {
  id: string;
  description: string;
  side: 'debit' | 'credit';
  amount: number;
  coaId: string;
  coaCode: string;
  coaName: string;
  projectId: string | null;
};

const createLineId = () =>
  globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random()}`;

const emptyLine = (side: 'debit' | 'credit'): EditableLine => ({
  id: createLineId(),
  description: '',
  side,
  amount: 0,
  coaId: '',
  coaCode: '',
  coaName: '',
  projectId: null,
});

type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

type RecurringState = {
  enabled: boolean;
  frequency: RecurringFrequency;
  nextDate: string;
  autoPost: boolean;
  generatedFromTemplate: boolean;
};

const recurringFrequencyValues = new Set<RecurringFrequency>([
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
]);

function normalizeRecurringFrequency(value: unknown): RecurringFrequency {
  if (typeof value !== 'string') return 'monthly';
  return recurringFrequencyValues.has(value as RecurringFrequency)
    ? (value as RecurringFrequency)
    : 'monthly';
}

function computeNextDate(
  dateInput: string,
  frequency: RecurringFrequency,
): string {
  if (!dateInput) return '';
  const date = new Date(`${dateInput}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';

  switch (frequency) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
  }
  return date.toISOString().slice(0, 10);
}

function formatDateDisplay(value?: string | null) {
  if (!value) return '--';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getRecurringState(
  journal: GetJournalResponse['journal'] | null,
): RecurringState {
  const metadata =
    (journal?.metadata as Record<string, unknown> | null | undefined) ?? {};
  const recurringMeta =
    metadata && typeof metadata === 'object'
      ? ((metadata.recurring as Record<string, unknown> | undefined) ?? {})
      : {};

  const isGeneratedFromTemplate =
    journal?.journalSource === 'generated_from_template';
  const enabled = Boolean(recurringMeta.enabled) || isGeneratedFromTemplate;
  const frequency = normalizeRecurringFrequency(recurringMeta.frequency);
  const nextDate =
    (typeof recurringMeta.nextDate === 'string' && recurringMeta.nextDate) ||
    journal?.autoReversalDate ||
    computeNextDate(journal?.date ?? '', frequency);
  const autoPost = recurringMeta.autoPost === true;

  return {
    enabled,
    frequency,
    nextDate: nextDate ?? '',
    autoPost,
    generatedFromTemplate: isGeneratedFromTemplate,
  };
}

export function JournalDetailPane({
  companyId,
  journalId,
  journalIsFx = false,
  templateId,
  mockDetail,
  isCreatingNew,
  onCreatingNewChange,
  onJournalSelected,
  onBack,
}: {
  companyId: string;
  journalId: string | null;
  journalIsFx?: boolean;
  templateId?: string | null;
  mockDetail?: GetJournalResponse | null;
  isCreatingNew: boolean;
  onCreatingNewChange: (value: boolean) => void;
  onJournalSelected: (journalId: string | null) => void;
  onBack?: () => void;
}) {
  const isMobile = useIsMobile();
  // Using 1280px as the desktop breakpoint for the spreadsheet-like view
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const shortcutModifierLabel = getShortcutModifierLabel();
  const query = useJournal({
    companyId,
    journalId: journalId ?? '',
    includeLedgerTotals: journalIsFx,
    includeFiles: true,
    includeDeleted: true,
    enabled: !!journalId && !mockDetail,
  });
  const recurringTemplateQuery = useRecurringTemplate({
    companyId,
    templateId: templateId ?? '',
    enabled: !!templateId && !mockDetail,
  });

  const { data: coaData } = useChartOfAccountsQuery({
    companyId,
  });

  const coaItems = useMemo(() => {
    return (
      coaData?.map((coa) => ({
        value: coa.id,
        label: `${coa.code ? `${coa.code} · ` : ''}${coa.name}`,
      })) ?? []
    );
  }, [coaData]);

  // Contacts query for the contact picker
  const { data: contactsData } = useContacts({
    companyId,
    limit: 100,
    page: 1,
  });
  const contactItems = useMemo(() => {
    const contacts = contactsData?.data?.contacts ?? [];
    return contacts.map((c: { id: string; displayName: string }) => ({
      value: c.id,
      label: c.displayName,
    }));
  }, [contactsData]);

  const createMutation = useCreateJournal();
  const updateMutation = useUpdateJournal();
  const postMutation = usePostJournal();
  const voidMutation = useVoidJournal();
  const reverseMutation = useReverseJournal();
  const copyMutation = useCopyJournal();
  const updateRecurringTemplateStatusMutation =
    useUpdateRecurringTemplateStatus();
  const runRecurringTemplateNowMutation = useRunRecurringTemplateNow();
  const previewRecurringTemplateMutation = usePreviewRecurringTemplate();

  const detail = useMemo(() => {
    if (mockDetail) return mockDetail;
    return query.data ?? null;
  }, [mockDetail, query.data]);

  const journal = detail?.journal ?? null;

  const [editing, setEditing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<
    'post' | 'void' | 'reverse' | 'suggest' | 'discard' | null
  >(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [contactId, setContactId] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [memo, setMemo] = useState('');
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isDescriptionFocused, setIsDescriptionFocused] = useState(false);
  const [isSuggestingEntries, setIsSuggestingEntries] = useState(false);
  const [lines, setLines] = useState<EditableLine[]>([
    emptyLine('debit'),
    emptyLine('credit'),
  ]);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringFrequency, setRecurringFrequency] =
    useState<RecurringFrequency>('monthly');
  const [recurringNextDate, setRecurringNextDate] = useState('');
  const [recurringAutoPost, setRecurringAutoPost] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<{
    runDateYMD: string;
    title: string | null;
    note: string | null;
    entries: Array<{
      description: string;
      side: 'debit' | 'credit';
      amount: number;
      coaId: string;
    }>;
  } | null>(null);

  // File Upload State
  const [uploadingFiles, setUploadingFiles] = useState<
    { name: string; id: string }[]
  >([]);
  const [attachedFiles, setAttachedFiles] = useState<JournalFileInput[]>([]);

  // Ref for auto-scrolling to newly added entries
  const lastEntryRef = useRef<HTMLDivElement>(null);

  // Track which amount field is focused (to show raw vs formatted)
  const [focusedAmountId, setFocusedAmountId] = useState<string | null>(null);

  // Helper: format a number as "1,234.50" for display
  const formatAmount = useCallback((val: number): string => {
    if (!val) return '';
    return val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, []);

  // Helper: abbreviate large numbers for compact display (M, B, T)
  // Threshold at 100M — tens of millions are common enough to need full precision
  const compactAmount = useCallback((val: number): string => {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e8) return `${sign}${(abs / 1e6).toFixed(2)}M`;
    return abs.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, []);

  // Helper: determine smart default side for new entries
  const getSmartDefaultSide = useCallback((): 'debit' | 'credit' => {
    if (lines.length === 0) return 'debit';
    const dr = lines
      .filter((l) => l.side === 'debit')
      .reduce((s, l) => s + l.amount, 0);
    const cr = lines
      .filter((l) => l.side === 'credit')
      .reduce((s, l) => s + l.amount, 0);
    return dr > cr ? 'credit' : 'debit';
  }, [lines]);

  useEffect(() => {
    setTemplatePreview(null);
  }, [templateId]);

  useEffect(() => {
    if (isCreatingNew) {
      setEditing(true);
      setTitle('');
      const now = new Date().toISOString().slice(0, 10);
      setDate(now);
      setMemo('');
      setDescription('');
      setShowMoreDetails(false);
      setLines([emptyLine('debit'), emptyLine('credit')]);
      setRecurringEnabled(false);
      setRecurringFrequency('monthly');
      setRecurringNextDate(computeNextDate(now, 'monthly'));
      setRecurringAutoPost(false);
      setUploadingFiles([]);
      setAttachedFiles([]);
      setContactId(null);
      setReference('');
      return;
    }

    if (!journal) return;

    const recurring = getRecurringState(journal);
    setEditing(false);
    setTitle(journal.title);
    setDate(journal.date);
    setMemo(journal.note ?? '');
    setDescription(journal.description ?? '');
    if (journal.reference) setShowMoreDetails(true);
    setRecurringEnabled(recurring.enabled);
    setRecurringFrequency(recurring.frequency);
    setRecurringNextDate(recurring.nextDate);
    setRecurringAutoPost(recurring.autoPost);
    setLines(
      (detail?.entries ?? []).map((entry) => ({
        id: entry.id,
        description: entry.description ?? '',
        side: entry.side,
        amount: entry.amount,
        coaId: entry.coaId,
        coaCode: entry.coaCode,
        coaName: entry.coaName,
        projectId: entry.projectId ?? null,
      })),
    );
    // Initialize attached files from journal data if available
    setUploadingFiles([]);
    setAttachedFiles((journal.files as JournalFileInput[]) ?? []);
    setContactId(journal.contactId ?? null);
    setReference(journal.reference ?? '');
  }, [detail?.entries, isCreatingNew, journal]);

  useEffect(() => {
    if (!editing || !recurringEnabled || !date) return;
    setRecurringNextDate(computeNextDate(date, recurringFrequency));
  }, [date, editing, recurringEnabled, recurringFrequency]);

  const totalDebit = useMemo(
    () =>
      lines
        .filter((line) => line.side === 'debit')
        .reduce((sum, line) => sum + line.amount, 0),
    [lines],
  );
  const totalCredit = useMemo(
    () =>
      lines
        .filter((line) => line.side === 'credit')
        .reduce((sum, line) => sum + line.amount, 0),
    [lines],
  );
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const canSave =
    title.trim().length > 0 &&
    !!date &&
    lines.length >= 2 &&
    lines.every((line) => line.coaId && line.amount > 0);
  const canPost = canSave && isBalanced;

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    postMutation.isPending ||
    voidMutation.isPending ||
    reverseMutation.isPending ||
    copyMutation.isPending ||
    updateRecurringTemplateStatusMutation.isPending ||
    runRecurringTemplateNowMutation.isPending ||
    previewRecurringTemplateMutation.isPending;

  const payload = useMemo<JournalBatchInput>(
    () => ({
      reference: reference.trim() || journal?.reference || null,
      date,
      title: title.trim(),
      description: description.trim() || undefined,
      contactId: contactId ?? journal?.contactId ?? null,
      currencyId: journal?.currencyId ?? null,
      exchangeRate: Number(journal?.exchangeRate ?? 1),
      status: 'draft',
      autoReversalDate: journal?.autoReversalDate ?? null,
      note: memo.trim() || null,
      metadata: {
        ...(((journal?.metadata as
          | Record<string, unknown>
          | null
          | undefined) ?? {}) as Record<string, unknown>),
        recurring: recurringEnabled
          ? {
              enabled: true,
              frequency: recurringFrequency,
              nextDate:
                recurringNextDate || computeNextDate(date, recurringFrequency),
              autoPost: recurringAutoPost,
            }
          : {
              enabled: false,
            },
      },
      entries: lines.map((line) => ({
        description: line.description || '',
        side: line.side,
        amount: line.amount,
        coaId: line.coaId,
        projectId: line.projectId,
      })),
      files: attachedFiles,
    }),
    [
      date,
      journal,
      lines,
      memo,
      recurringAutoPost,
      recurringEnabled,
      recurringFrequency,
      recurringNextDate,
      title,
      attachedFiles,
    ],
  );

  const handleSuggestEntries = () => {
    setIsSuggestingEntries(true);
    setTimeout(() => {
      setLines((currentLines) => {
        const newLines = [...currentLines];
        let runningDebit = 0;
        let runningCredit = 0;

        // 1. Calculate totals from existing valid lines
        newLines.forEach((line) => {
          if (line.coaId && line.amount) {
            if (line.side === 'debit') runningDebit += line.amount;
            else runningCredit += line.amount;
          }
        });

        // 2. Scan for empty/incomplete lines to fill
        let filledCount = 0;
        newLines.forEach((line, index) => {
          if (!line.coaId || !line.amount) {
            // Mock: Fill with a placeholder amount/description if empty
            // In real app, AI would choose specific account based on description
            if (
              filledCount === 0 &&
              runningDebit === 0 &&
              runningCredit === 0
            ) {
              // Case A: First line empty -> Mock Expense
              newLines[index] = {
                ...line,
                amount: 100,
                side: 'debit',
                description: description || title,
              };
              runningDebit += 100;
            } else if (runningDebit > runningCredit) {
              // Case B: Needs credit to balance
              const diff = runningDebit - runningCredit;
              newLines[index] = {
                ...line,
                amount: diff,
                side: 'credit',
                description: description || title,
              };
              runningCredit += diff;
            } else if (runningCredit > runningDebit) {
              // Case C: Needs debit to balance
              const diff = runningCredit - runningDebit;
              newLines[index] = {
                ...line,
                amount: diff,
                side: 'debit',
                description: description || title,
              };
              runningDebit += diff;
            }
            filledCount++;
          }
        });

        // 3. If still unbalanced, append a balancing line
        const diff = Math.abs(runningDebit - runningCredit);
        if (diff > 0.01) {
          const side = runningDebit > runningCredit ? 'credit' : 'debit';
          newLines.push({
            ...emptyLine(side),
            amount: diff,
            description: description || title,
          });
        }

        // 4. If completely empty (no fills, no imbalance), add a default pair
        if (runningDebit === 0 && runningCredit === 0 && filledCount === 0) {
          newLines.push({
            ...emptyLine('debit'),
            amount: 100,
            description: title,
          });
          newLines.push({
            ...emptyLine('credit'),
            amount: 100,
            description: title,
          });
        }

        return newLines;
      });
      setIsSuggestingEntries(false);
      toast.success('Entries suggested — review and adjust as needed');
    }, 1000);
  };

  const handleFileUpload = async (files: File[]) => {
    // Enforce 5-file limit
    const remaining = 5 - attachedFiles.length;
    if (remaining <= 0) {
      toast.error('Maximum 5 files allowed');
      return;
    }
    const filesToUpload = files.slice(0, remaining);
    if (filesToUpload.length < files.length) {
      toast.warning(
        `Only ${remaining} more file${remaining === 1 ? '' : 's'} allowed — uploading first ${filesToUpload.length}`,
      );
    }
    // Optimistically update list with pending uploads
    const pendingUploads = filesToUpload.map((f) => ({
      name: f.name,
      id: Math.random().toString(36).slice(2),
    }));
    setUploadingFiles((prev) => [...prev, ...pendingUploads]);

    const newAttachments: JournalFileInput[] = [];

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      const pendingId = pendingUploads[i].id;

      try {
        const uploadUrlRes = await getObjectUploadUrl({
          companyId,
          bucketType: 'txnFiles',
          fileName: file.name,
          contentType: (file.type as any) || 'application/octet-stream',
        });

        if (uploadUrlRes.success && uploadUrlRes.data) {
          const { signedUrl, fileKey, bucketName } = uploadUrlRes.data;
          await uploadFileToR2(file, signedUrl);

          const url = `https://${bucketName}/${fileKey}`;

          newAttachments.push({
            name: file.name,
            key: fileKey,
            type: file.type,
            size: file.size,
            url,
          });
        } else {
          toast.error(`Failed to get upload URL for ${file.name}`);
        }
      } catch (error) {
        console.error('File upload failed', error);
        toast.error(`Failed to upload ${file.name}`);
      } finally {
        // Remove from pending
        setUploadingFiles((prev) => prev.filter((p) => p.id !== pendingId));
      }
    }

    if (newAttachments.length > 0) {
      setAttachedFiles((prev) => [...prev, ...newAttachments]);
    }
  };

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    if (mockDetail) {
      toast.success('Draft saved (mock mode)');
      setEditing(false);
      return;
    }

    try {
      if (isCreatingNew) {
        const res = await createMutation.mutateAsync({
          companyId,
          data: payload,
        });
        if (res.success && res.data?.id) {
          onCreatingNewChange(false);
          onJournalSelected(res.data.id);
          toast.success('Draft created');
          return;
        }
      } else if (journalId) {
        const res = await updateMutation.mutateAsync({
          companyId,
          journalId,
          data: payload,
        });
        if (res.success) {
          toast.success('Draft saved');
          setEditing(false);
          await query.refetch();
          return;
        }
      }
      toast.error('Unable to save draft');
    } catch {
      toast.error('Unable to save draft');
    }
  }, [
    canSave,
    companyId,
    createMutation,
    isCreatingNew,
    journalId,
    mockDetail,
    onCreatingNewChange,
    onJournalSelected,
    payload,
    query,
    updateMutation,
  ]);

  const handlePost = useCallback(async () => {
    if (!canPost) return;

    if (mockDetail) {
      toast.success('Journal posted (mock mode)');
      setEditing(false);
      return;
    }

    try {
      if (isCreatingNew) {
        const createRes = await createMutation.mutateAsync({
          companyId,
          data: payload,
        });
        if (!createRes.success || !createRes.data?.id) {
          toast.error('Unable to create draft for posting');
          return;
        }
        const postRes = await postMutation.mutateAsync({
          companyId,
          journalId: createRes.data.id,
        });
        if (postRes.success) {
          onCreatingNewChange(false);
          onJournalSelected(createRes.data.id);
          toast.success('Journal posted');
          return;
        }
      } else if (journalId) {
        if (editing) {
          const updateRes = await updateMutation.mutateAsync({
            companyId,
            journalId,
            data: payload,
          });
          if (!updateRes.success) {
            toast.error('Unable to save draft before posting');
            return;
          }
        }

        const postRes = await postMutation.mutateAsync({
          companyId,
          journalId,
        });
        if (postRes.success) {
          toast.success('Journal posted');
          setEditing(false);
          await query.refetch();
          return;
        }
      }
      toast.error('Unable to post journal');
    } catch {
      toast.error('Unable to post journal');
    }
  }, [
    canPost,
    companyId,
    createMutation,
    editing,
    isCreatingNew,
    journalId,
    mockDetail,
    onCreatingNewChange,
    onJournalSelected,
    payload,
    postMutation,
    query,
    updateMutation,
  ]);

  const isDirty = useMemo(() => {
    if (!isCreatingNew) return false;
    const hasTitle = title.trim().length > 0;
    const hasDesc = description.trim().length > 0;
    const hasLines = lines.some(
      (l) => l.amount > 0 || l.coaId || l.description,
    );
    return hasTitle || hasDesc || hasLines;
  }, [isCreatingNew, title, description, lines]);

  const handleConfirmDiscard = useCallback(() => {
    if (isCreatingNew) {
      if (onBack) {
        onBack();
      } else {
        onCreatingNewChange(false);
        onJournalSelected(null);
      }
    } else if (journal) {
      // Restore original values for existing journal
      const recurring = getRecurringState(journal);
      setTitle(journal.title);
      setDate(journal.date);
      setMemo(journal.note ?? journal.description ?? '');
      setLines(
        (detail?.entries ?? []).map((entry) => ({
          id: entry.id,
          description: entry.description ?? '',
          side: entry.side,
          amount: entry.amount,
          coaId: entry.coaId,
          coaCode: entry.coaCode,
          coaName: entry.coaName,
          projectId: entry.projectId ?? null,
        })),
      );
      setRecurringEnabled(recurring.enabled);
      setRecurringFrequency(recurring.frequency);
      setRecurringNextDate(recurring.nextDate);
      setRecurringAutoPost(recurring.autoPost);
      setAttachedFiles((journal.files as JournalFileInput[]) ?? []);
    }
    setEditing(false);
    setConfirmDialog(null);
  }, [
    isCreatingNew,
    onBack,
    onCreatingNewChange,
    onJournalSelected,
    journal,
    detail?.entries,
  ]);

  const handleCancelEdit = useCallback(() => {
    if (isCreatingNew && isDirty) {
      setConfirmDialog('discard');
      return;
    }

    // Not dirty or not creating new (for now treating edit cancel as safe or handled elsewhere?
    // actually edit cancel usually reverts to view mode which is safe.
    // The user asked about "Back button" which triggers this.
    // If editing existing, back button reverts. Detailed dirty check for editing existing is complex unless we compare with original.
    // For now maximizing safety for NEW journals as requested.

    handleConfirmDiscard();
  }, [isCreatingNew, isDirty, handleConfirmDiscard]);

  const handleBack = useCallback(() => {
    // If we are editing, treat "Back" as "Cancel Edit" (with dirty checks)
    if (editing) {
      handleCancelEdit();
      return;
    }
    // If not editing (View Mode), standard back navigation
    if (onBack) onBack();
  }, [editing, handleCancelEdit, onBack]);

  useEffect(() => {
    if (!editing) return;
    // Disable shortcuts on mobile
    if (isMobile) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (canSave && !isSaving) {
          void handleSave();
        }
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (canPost && !isSaving) {
          void handlePost();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canPost, canSave, editing, handlePost, handleSave, isSaving, isMobile]);

  async function handleCopy() {
    if (!journalId || mockDetail) {
      if (mockDetail) toast.success('Journal copied (mock mode)');
      return;
    }
    try {
      const res = await copyMutation.mutateAsync({ companyId, journalId });
      if (res.success && res.data?.id) {
        onCreatingNewChange(false);
        onJournalSelected(res.data.id);
        toast.success('Copied as draft');
        return;
      }
      toast.error('Unable to copy journal');
    } catch {
      toast.error('Unable to copy journal');
    }
  }

  async function handleReverse() {
    if (!journalId || mockDetail) {
      if (mockDetail) toast.success('Reversal posted (mock mode)');
      return;
    }
    try {
      const res = await reverseMutation.mutateAsync({ companyId, journalId });
      if (res.success) {
        toast.success('Reversal posted');
        await query.refetch();
        return;
      }
      toast.error('Unable to reverse journal');
    } catch {
      toast.error('Unable to reverse journal');
    }
  }

  async function handleVoid() {
    if (!journalId || mockDetail) {
      if (mockDetail) toast.success('Journal voided (mock mode)');
      return;
    }
    try {
      const res = await voidMutation.mutateAsync({ companyId, journalId });
      if (res.success) {
        toast.success('Journal voided');
        await query.refetch();
        return;
      }
      toast.error('Unable to void journal');
    } catch {
      toast.error('Unable to void journal');
    }
  }

  const showEmptyState = !journalId && !templateId && !isCreatingNew;

  if (showEmptyState) {
    return (
      <EmptyState
        title="No journal selected"
        description={
          <>
            Pick one from the list, or press{' '}
            <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-[10px]">
              {shortcutModifierLabel} Shift N
            </kbd>{' '}
            (or{' '}
            <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-[10px]">
              Alt N
            </kbd>
            ) to create a new entry.
          </>
        }
      />
    );
  }

  if (
    !mockDetail &&
    ((!!journalId && query.isLoading) ||
      (!!templateId && recurringTemplateQuery.isLoading))
  ) {
    return <CenteredLoader />;
  }
  if (
    !mockDetail &&
    ((!!journalId && query.isError) ||
      (!!templateId && recurringTemplateQuery.isError))
  ) {
    return <ErrorPage showHeader={false} type="default" />;
  }

  if (!isCreatingNew && templateId) {
    const template = recurringTemplateQuery.data?.template;
    const entries = recurringTemplateQuery.data?.entries ?? [];

    const handleTemplateStatusChange = async (
      status: 'draft' | 'active' | 'paused' | 'closed',
    ) => {
      if (!templateId || mockDetail) return;
      try {
        const res = await updateRecurringTemplateStatusMutation.mutateAsync({
          companyId,
          templateId,
          status,
        });
        if (res.success) {
          toast.success('Template status updated');
          await recurringTemplateQuery.refetch();
          return;
        }
        toast.error(res.message ?? 'Unable to update template status');
      } catch {
        toast.error('Unable to update template status');
      }
    };

    const handleTemplateRunNow = async () => {
      if (!templateId || mockDetail) return;
      try {
        const res = await runRecurringTemplateNowMutation.mutateAsync({
          companyId,
          templateId,
        });
        if (res.success) {
          toast.success('Generated journal from template');
          await recurringTemplateQuery.refetch();
          return;
        }
        toast.error(res.message ?? 'Unable to run template');
      } catch {
        toast.error('Unable to run template');
      }
    };

    const handleTemplatePreview = async () => {
      if (mockDetail) return;
      try {
        const res = await previewRecurringTemplateMutation.mutateAsync({
          companyId,
          startDateYMD:
            template?.startDateYMD ??
            template?.nextRunDateYMD ??
            new Date().toISOString().slice(0, 10),
          frequency: template?.frequency ?? 'monthly',
          title: template?.title ?? null,
          note: template?.note ?? null,
          previewForYMD: template?.nextRunDateYMD ?? null,
          entries: entries.map((entry: any) => ({
            description: entry.description,
            side: entry.side,
            amount: entry.amount,
            coaId: entry.coaId,
          })),
        });
        if (res.success && res.data) {
          setTemplatePreview({
            runDateYMD: res.data.runDateYMD,
            title: res.data.rendered.title,
            note: res.data.rendered.note,
            entries: res.data.rendered.entries,
          });
          toast.success('Preview generated');
          return;
        }
        toast.error(res.message ?? 'Unable to preview template');
      } catch {
        toast.error('Unable to preview template');
      }
    };

    if (!template) {
      return (
        <EmptyState
          title="Recurring journal not found."
          description="Something went wrong, please try again or select another recurring journal."
        />
      );
    }

    const templateActionHandlers: Record<TemplateAction, () => void> = {
      edit: () => {},
      activate: () => {
        if (updateRecurringTemplateStatusMutation.isPending) return;
        void handleTemplateStatusChange('active');
      },
      pause: () => {
        if (updateRecurringTemplateStatusMutation.isPending) return;
        void handleTemplateStatusChange('paused');
      },
      resume: () => {
        if (updateRecurringTemplateStatusMutation.isPending) return;
        void handleTemplateStatusChange('active');
      },
      close: () => {
        if (updateRecurringTemplateStatusMutation.isPending) return;
        void handleTemplateStatusChange('closed');
      },
      run_now: () => {
        if (updateRecurringTemplateStatusMutation.isPending) return;
        if (template.status !== 'active') return;
        if (runRecurringTemplateNowMutation.isPending) return;
        void handleTemplateRunNow();
      },
      copy: () => {},
    } satisfies Record<TemplateAction, () => void>;

    const templateBaseActions = getAllowedActionsForTemplate(template);
    const templateHeaderActions: JournalDetailHeaderAction[] = [
      ...templateBaseActions.map((action) => ({
        key: action.key,
        label: action.action === 'run_now' ? 'Generate next' : action.label,
        icon: action.icon,
        className: action.className,
        onClick: templateActionHandlers[action.action],
      })),
      {
        key: 'preview',
        label: 'Preview',
        icon: Eye,
        onClick: () => {
          if (updateRecurringTemplateStatusMutation.isPending) return;
          if (previewRecurringTemplateMutation.isPending) return;
          void handleTemplatePreview();
        },
      },
    ];

    return (
      <div className="flex h-full flex-1 flex-col overflow-auto">
        <JournalDetailHeader
          reference={null}
          status={template.status}
          leftAddon={
            <span className="bg-accent text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize">
              <Repeat className="h-3 w-3" />
              {template.frequency}
            </span>
          }
          actions={templateHeaderActions}
          onBack={onBack}
          isMobile={isMobile}
        />

        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-foreground text-lg leading-tight font-semibold text-balance">
              {template.title || template.description || 'Recurring template'}
            </h2>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span>
                Next run: {formatDateDisplay(template.nextRunDateYMD)}
              </span>
            </div>
          </div>

          {/* Template Entries Table (Read Only) */}
          <div className="bg-card overflow-hidden rounded-lg border">
            <div className="text-muted-foreground grid grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_90px_110px] gap-2 border-b px-3 py-2 text-[11px] font-medium tracking-wider uppercase">
              <span>Account</span>
              <span>Description</span>
              <span>Side</span>
              <span className="text-right">Amount</span>
            </div>
            <div className="flex flex-col">
              {entries.map((entry: any, i: number) => (
                <div
                  key={i}
                  className="border-border/50 grid grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_90px_110px] items-center gap-2 border-b px-3 py-1.5 last:border-0"
                >
                  <span className="truncate text-sm">
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {entry.coaCode}
                    </span>{' '}
                    <span className="text-foreground">{entry.coaName}</span>
                  </span>
                  <span className="text-muted-foreground truncate text-sm">
                    {entry.description || '--'}
                  </span>
                  <span className="text-muted-foreground text-[11px] uppercase">
                    {entry.side === 'debit' ? 'Dr' : 'Cr'}
                  </span>
                  <span className="text-right font-mono text-sm">
                    <FormattedAmount
                      amount={entry.amount}
                      currency={template.currencyId === 'USD' ? 'USD' : 'USD'} // Mock fallback
                      showSymbol
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- STANDARD JOURNAL UI ---

  if (!isCreatingNew && !journal) {
    return (
      <EmptyState
        title="Journal not found."
        description="Something went wrong, please try again or select another journal."
      />
    );
  }

  const currentStatus = journal?.status ?? 'draft';
  const isDraft = isCreatingNew || currentStatus === 'draft';
  const isPosted = !isCreatingNew && currentStatus === 'posted';
  const isVoided = !isCreatingNew && currentStatus === 'voided';
  const recurringInfo = getRecurringState(journal);

  const journalActionHandlers = {
    edit: () => {
      if (isSaving) return;
      setEditing(true);
    },
    post: () => {
      if (isSaving) return;
      if (!canPost || isSaving) return;
      if (isCreatingNew) {
        void handlePost();
        return;
      }
      setConfirmDialog('post');
    },
    void: () => {
      if (isSaving) return;
      setConfirmDialog('void');
    },
    copy: () => {
      if (isSaving) return;
      void handleCopy();
    },
    reverse: () => {
      if (isSaving) return;
      setConfirmDialog('reverse');
    },
  } satisfies Record<JournalAction, () => void>;

  const baseActions = getAllowedActionsForJournal(journal);
  const visibleActions =
    isDraft && !editing
      ? baseActions.filter((action) => action.action !== 'post')
      : baseActions;

  // Header actions for Edit Mode
  const editHeaderActions: JournalDetailHeaderAction[] = [
    {
      key: 'save',
      label: 'Save Draft',
      icon: Save,
      variant: 'secondary',
      onClick: () => {
        if (isSaving) return;
        if (canSave && !isSaving) void handleSave();
      },
    },
    {
      key: 'post',
      label: 'Post Journal',
      icon: Send,
      variant: 'default',
      onClick: () => {
        if (isSaving) return;
        if (!canPost || isSaving) return;
        if (isCreatingNew) {
          void handlePost();
          return;
        }
        setConfirmDialog('post');
      },
    },
    {
      key: 'cancel',
      label: 'Cancel',
      icon: X,
      variant: 'ghost',
      onClick: () => {
        if (isSaving) return;
        handleCancelEdit();
      },
    },
  ];

  // For Mobile Edit mode, we move actions to the sticky footer
  const journalHeaderActions: JournalDetailHeaderAction[] =
    isDraft && editing && isMobile
      ? [] // On mobile, 'Back' serves as Cancel. Menu is redundant.
      : isDraft && editing
        ? editHeaderActions // Desktop Edit use Topbar
        : visibleActions.map((action) => ({
            key: action.key,
            label:
              action.action === 'copy' && isVoided
                ? 'Copy as new'
                : action.label,
            icon: action.icon,
            className:
              action.action === 'copy' && currentStatus === 'draft' && !editing
                ? 'text-muted-foreground'
                : action.className,
            onClick: journalActionHandlers[action.action],
          }));

  return (
    <div className={`flex h-full flex-col overflow-hidden`}>
      <AlertDialog
        open={confirmDialog === 'post'}
        onOpenChange={(open) => setConfirmDialog(open ? 'post' : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post this journal?</AlertDialogTitle>
            <AlertDialogDescription>
              Posted journals are immutable. You can reverse or copy them
              afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDialog(null);
                void handlePost();
              }}
            >
              Post journal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDialog === 'void'}
        onOpenChange={(open) => setConfirmDialog(open ? 'void' : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this journal?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks the journal as voided. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDialog(null);
                void handleVoid();
              }}
            >
              Void journal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDialog === 'reverse'}
        onOpenChange={(open) => setConfirmDialog(open ? 'reverse' : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse this journal?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a new posted journal with opposite debits and
              credits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDialog(null);
                void handleReverse();
              }}
            >
              Create reversal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDialog === 'discard'}
        onOpenChange={(open) => setConfirmDialog(open ? 'discard' : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* HEADER SECTION (Static at top) */}
      <JournalDetailHeader
        reference={journal?.reference ?? null}
        status={currentStatus}
        leftAddon={
          recurringInfo.enabled ? (
            <span className="bg-accent text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize">
              <Repeat className="h-3 w-3" />
              {recurringInfo.frequency}
            </span>
          ) : null
        }
        actions={journalHeaderActions}
        onBack={handleBack}
        isMobile={isMobile}
      />

      {/* CONTENT SECTION (Scrollable) */}
      <div
        className={`flex flex-1 flex-col gap-5 overflow-y-auto p-5 ${isMobile ? 'gap-6 px-4' : ''}`}
      >
        {editing ? (
          <div className="flex flex-col gap-6">
            {/* Header: Title and Date */}
            <div className="flex flex-col gap-4">
              {/* Recurring toggle — visible pill on mobile, full card when enabled */}
              {isMobile && !recurringEnabled ? (
                <button
                  type="button"
                  onClick={() => setRecurringEnabled(true)}
                  className="border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  <Repeat className="h-3 w-3" />
                  Make recurring
                </button>
              ) : (
                <div className="border-border bg-card rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Repeat className="text-muted-foreground h-4 w-4" />
                      <Label
                        htmlFor="recurring-toggle"
                        className="text-foreground cursor-pointer text-sm font-medium"
                      >
                        Recurring
                      </Label>
                    </div>
                    <Switch
                      id="recurring-toggle"
                      checked={recurringEnabled}
                      onCheckedChange={setRecurringEnabled}
                    />
                  </div>
                  {recurringEnabled && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <Label className="text-muted-foreground text-[11px] font-medium">
                          Frequency
                        </Label>
                        <Select
                          value={recurringFrequency}
                          onValueChange={(value) =>
                            setRecurringFrequency(
                              normalizeRecurringFrequency(value),
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="yearly">Yearly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-muted-foreground text-[11px] font-medium">
                          Next date
                        </Label>
                        <Input
                          type="date"
                          value={recurringNextDate}
                          onChange={(event) =>
                            setRecurringNextDate(event.target.value)
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <Switch
                          id="auto-post-toggle"
                          checked={recurringAutoPost}
                          onCheckedChange={setRecurringAutoPost}
                        />
                        <Label
                          htmlFor="auto-post-toggle"
                          className="text-muted-foreground cursor-pointer text-xs"
                        >
                          Auto-post generated entries
                        </Label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Title */}
              <div className={isDesktop ? 'flex flex-row items-end gap-4' : ''}>
                <div className="flex-1">
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={200}
                    placeholder="Journal Title"
                    className={`text-foreground placeholder:text-muted-foreground/40 h-auto rounded-none border-0 border-b bg-transparent px-0 py-1 text-lg font-semibold shadow-none placeholder:font-normal focus-visible:ring-0 ${isMobile ? 'py-1.5 text-base' : ''}`}
                  />
                </div>
              </div>

              {/* Description — single-line narration below title */}
              <div className="relative">
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  onFocus={() => setIsDescriptionFocused(true)}
                  onBlur={() => {
                    // Slight delay to allow button click to register
                    setTimeout(() => setIsDescriptionFocused(false), 200);
                  }}
                  maxLength={500}
                  placeholder="Add a short description..."
                  className={`text-muted-foreground placeholder:text-muted-foreground/30 h-auto rounded-none border-0 border-b bg-transparent px-0 py-1 pr-20 text-sm shadow-none focus-visible:ring-0 ${isMobile ? 'py-1.5' : ''}`}
                />
                {/* AI: Generate/Improve description */}
                {title.trim().length >= 3 &&
                  (!description.trim() || isDescriptionFocused) && (
                    <div className="absolute top-1/2 right-0 -translate-y-1/2">
                      <AiAssistButton
                        onClick={() => {
                          // TODO: Replace mock with AI call — POST /api/{companyId}/ai/chat
                          // capability: 'journals.generate_description.v1' (or improve)
                          // context: { title, currentDescription: description }
                          setIsGeneratingDesc(true);
                          setTimeout(() => {
                            if (description.trim()) {
                              setDescription(
                                `${description.trim()} (improved)`,
                              );
                            } else {
                              setDescription(
                                `Journal entry for: ${title.trim()}`,
                              );
                            }
                            setIsGeneratingDesc(false);
                          }, 800);
                        }}
                        isLoading={isGeneratingDesc}
                        label={description.trim() ? 'Improve' : 'Generate'}
                        loadingLabel={
                          description.trim() ? 'Improving...' : 'Writing...'
                        }
                      />
                    </div>
                  )}
              </div>

              {/* Metadata row: Date · Contact */}
              <div
                className={
                  isDesktop
                    ? 'grid grid-cols-3 gap-4'
                    : 'grid grid-cols-2 gap-3'
                }
              >
                {/* Date */}
                <div className="min-w-0 overflow-hidden">
                  {isMobile ? (
                    <DatePicker
                      value={date ? new Date(date + 'T00:00:00') : undefined}
                      onChange={(d) =>
                        setDate(d ? d.toISOString().slice(0, 10) : '')
                      }
                      label="Date"
                      showLabel={true}
                      buttonVariant="outline"
                      classNames={{
                        wrapper: 'flex-col gap-0.5 w-full',
                        trigger:
                          'w-full border-0 border-b rounded-none px-0 shadow-none h-auto py-1.5 truncate max-w-full overflow-hidden text-sm',
                        label:
                          'text-[11px] uppercase text-muted-foreground font-medium w-auto p-0',
                      }}
                    />
                  ) : (
                    <div className="flex flex-col gap-1">
                      <Label className="text-muted-foreground mb-1 block text-[10px] font-medium uppercase">
                        Date
                      </Label>
                      <DatePicker
                        value={date ? new Date(date + 'T00:00:00') : undefined}
                        onChange={(d) =>
                          setDate(d ? d.toISOString().slice(0, 10) : '')
                        }
                        showLabel={false}
                        buttonVariant="outline"
                        classNames={{ trigger: 'w-full h-9' }}
                      />
                    </div>
                  )}
                </div>

                {/* Contact */}
                <div className="min-w-0">
                  <Label className="text-muted-foreground mb-0.5 block text-[11px] font-medium uppercase">
                    Contact
                  </Label>
                  <AutocompleteDropdown
                    value={contactId ?? ''}
                    items={contactItems}
                    onValueChange={(value) => setContactId(value || null)}
                    placeholder="Optional"
                    className={`h-auto w-full text-sm ${isMobile ? 'rounded-none border-0 border-b !px-0 py-1.5 shadow-none [&>span]:text-sm [&>span]:font-normal' : 'h-9'}`}
                  />
                </div>

                {/* Reference — desktop only inline */}
                {isDesktop && (
                  <div>
                    <Label className="text-muted-foreground mb-0.5 block text-[11px] font-medium uppercase">
                      Reference
                    </Label>
                    <Input
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      placeholder="e.g. INV-001"
                      className="h-9 text-sm"
                    />
                  </div>
                )}
              </div>

              {/* Add reference — mobile only */}
              {isMobile && (
                <>
                  {!showMoreDetails ? (
                    <button
                      type="button"
                      onClick={() => setShowMoreDetails(true)}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start text-xs font-medium transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Add reference
                    </button>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setShowMoreDetails(false)}
                        className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start text-xs font-medium transition-colors"
                      >
                        <ChevronDown className="h-3 w-3 rotate-180 transition-transform" />
                        Hide reference
                      </button>
                      <Input
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder="e.g. INV-001"
                        className="h-auto rounded-none border-0 border-b bg-transparent px-0 py-1.5 text-sm shadow-none focus-visible:ring-0"
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Lines Grid / Cards */}
            {isMobile ? (
              // --- MOBILE EDIT VIEW: CARDS ---
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between pl-1">
                  <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Entries
                  </h3>
                  {/* AI: Suggest entries */}
                  {title.trim().length >= 3 && (
                    <AiAssistButton
                      onClick={handleSuggestEntries}
                      isLoading={isSuggestingEntries}
                      label="Suggest entries"
                      loadingLabel="Thinking..."
                    />
                  )}
                </div>
                {lines.map((line, index) => (
                  <div
                    key={line.id}
                    ref={index === lines.length - 1 ? lastEntryRef : undefined}
                    className="bg-card border-border relative flex flex-col gap-3 rounded-xl border p-5 shadow-sm"
                  >
                    {/* Remove Button */}
                    <div className="absolute top-2 right-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-7 w-7 rounded-full"
                        disabled={lines.length <= 2}
                        onClick={() =>
                          setLines((currentLines) =>
                            currentLines.length <= 2
                              ? currentLines
                              : currentLines.filter(
                                  (entry) => entry.id !== line.id,
                                ),
                          )
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Row 1: Account — §6 styling fix */}
                    <div className="w-full min-w-0 pr-8">
                      <AutocompleteDropdown
                        value={line.coaId}
                        items={coaItems}
                        onValueChange={(value) =>
                          setLines((currentLines) =>
                            currentLines.map((entry) =>
                              entry.id === line.id
                                ? { ...entry, coaId: value }
                                : entry,
                            ),
                          )
                        }
                        placeholder="Select account"
                        className="border-input focus:border-primary h-auto w-full rounded-none border-0 border-b !px-0 py-1.5 text-sm shadow-none focus-visible:ring-0 [&>span]:text-sm [&>span]:font-normal"
                      />
                    </div>

                    {/* Row 2: Description */}
                    <div>
                      <Input
                        className="placeholder:text-muted-foreground/50 border-input focus:border-primary h-auto rounded-none border-0 border-b px-0 py-1 text-sm shadow-none focus-visible:ring-0"
                        value={line.description}
                        onChange={(event) =>
                          setLines((currentLines) =>
                            currentLines.map((entry) =>
                              entry.id === line.id
                                ? { ...entry, description: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        placeholder={
                          description.trim() ||
                          title.trim() ||
                          'Add description...'
                        }
                        maxLength={500}
                      />
                    </div>

                    {/* Row 3: Side & Amount */}
                    <div className="mt-2 grid grid-cols-[120px_1fr] items-end gap-4">
                      <div>
                        <Label className="text-muted-foreground mb-1.5 block text-[10px] font-medium uppercase">
                          Side
                        </Label>
                        <div className="bg-muted flex rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              setLines(
                                lines.map((e) =>
                                  e.id === line.id
                                    ? { ...e, side: 'debit' }
                                    : e,
                                ),
                              )
                            }
                            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${line.side === 'debit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
                          >
                            Debit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setLines(
                                lines.map((e) =>
                                  e.id === line.id
                                    ? { ...e, side: 'credit' }
                                    : e,
                                ),
                              )
                            }
                            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${line.side === 'credit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
                          >
                            Credit
                          </button>
                        </div>
                      </div>
                      <div>
                        <Label className="text-muted-foreground mb-1 block text-right text-[10px] font-medium uppercase">
                          Amount
                        </Label>
                        <div className="relative">
                          <span className="text-muted-foreground absolute top-1/2 left-0 -translate-y-1/2 text-sm font-medium">
                            USD
                          </span>
                          {/* §3: text input with decimal keyboard + format on blur */}
                          <Input
                            className="border-input focus:border-primary h-auto rounded-none border-0 border-b px-0 py-1 pl-10 text-right font-mono text-lg font-semibold shadow-none focus-visible:ring-0"
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={
                              focusedAmountId === line.id
                                ? line.amount || ''
                                : formatAmount(line.amount)
                            }
                            onFocus={() => setFocusedAmountId(line.id)}
                            onChange={(event) => {
                              const raw = event.target.value.replace(
                                /[^0-9.]/g,
                                '',
                              );
                              setLines((currentLines) =>
                                currentLines.map((entry) =>
                                  entry.id === line.id
                                    ? {
                                        ...entry,
                                        amount: parseFloat(raw) || 0,
                                      }
                                    : entry,
                                ),
                              );
                            }}
                            onBlur={() => {
                              setFocusedAmountId(null);
                              setLines((currentLines) =>
                                currentLines.map((entry) =>
                                  entry.id === line.id
                                    ? {
                                        ...entry,
                                        amount:
                                          Math.round(
                                            (entry.amount + Number.EPSILON) *
                                              100,
                                          ) / 100,
                                      }
                                    : entry,
                                ),
                              );
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* §2: Smart side defaulting + §9: auto-scroll */}
                <Button
                  variant="outline"
                  className="h-12 w-full gap-2 border-dashed"
                  onClick={() => {
                    const side = getSmartDefaultSide();
                    setLines((currentLines) => [
                      ...currentLines,
                      emptyLine(side),
                    ]);
                    // §9: scroll to newly added entry
                    requestAnimationFrame(() => {
                      lastEntryRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                    });
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add Entry
                </Button>
              </div>
            ) : (
              // --- DESKTOP EDIT VIEW ---
              <div className="bg-card overflow-hidden rounded-lg border">
                <div className="text-muted-foreground grid grid-cols-[250px_1fr_120px_120px_32px] gap-2 border-b px-3 py-2 text-[11px] font-medium tracking-wider uppercase">
                  <span>Account</span>
                  <span>Description</span>
                  <span className="text-right">Debit</span>
                  <span className="text-right">Credit</span>
                  <span />
                </div>

                <div className="flex flex-col">
                  {lines.map((line, index) => (
                    <div
                      key={line.id}
                      className="group border-border/50 grid grid-cols-[250px_1fr_120px_120px_32px] items-start gap-2 border-b px-3 py-2 last:border-0"
                    >
                      {/* Account Selection */}
                      <div>
                        <AutocompleteDropdown
                          value={line.coaId}
                          items={coaItems}
                          onValueChange={(value) =>
                            setLines((currentLines) =>
                              currentLines.map((entry) =>
                                entry.id === line.id
                                  ? { ...entry, coaId: value }
                                  : entry,
                              ),
                            )
                          }
                          placeholder="Select account..."
                          className="h-8 w-full text-xs"
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <Input
                          className="h-8 text-xs"
                          value={line.description}
                          onChange={(event) =>
                            setLines((currentLines) =>
                              currentLines.map((entry) =>
                                entry.id === line.id
                                  ? {
                                      ...entry,
                                      description: event.target.value,
                                    }
                                  : entry,
                              ),
                            )
                          }
                          placeholder={
                            description.trim() || title.trim() || 'Description'
                          }
                          maxLength={500}
                        />
                      </div>

                      {/* Debit Input */}
                      <div>
                        <Input
                          className="h-8 text-right font-mono text-xs"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={
                            line.side === 'debit' && line.amount
                              ? line.amount
                              : ''
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            setLines((currentLines) =>
                              currentLines.map((entry) =>
                                entry.id === line.id
                                  ? {
                                      ...entry,
                                      side: 'debit',
                                      amount: value
                                        ? Math.round(
                                            (Number(value) + Number.EPSILON) *
                                              100,
                                          ) / 100
                                        : 0,
                                    }
                                  : entry,
                              ),
                            );
                          }}
                        />
                      </div>

                      {/* Credit Input */}
                      <div>
                        <Input
                          className="h-8 text-right font-mono text-xs"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={
                            line.side === 'credit' && line.amount
                              ? line.amount
                              : ''
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            setLines((currentLines) =>
                              currentLines.map((entry) =>
                                entry.id === line.id
                                  ? {
                                      ...entry,
                                      side: 'credit',
                                      amount: value
                                        ? Math.round(
                                            (Number(value) + Number.EPSILON) *
                                              100,
                                          ) / 100
                                        : 0,
                                    }
                                  : entry,
                              ),
                            );
                          }}
                        />
                      </div>

                      {/* Delete Action */}
                      <div className="flex justify-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive h-7 w-7"
                          disabled={lines.length <= 2}
                          onClick={() =>
                            setLines((currentLines) =>
                              currentLines.length <= 2
                                ? currentLines
                                : currentLines.filter(
                                    (entry) => entry.id !== line.id,
                                  ),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t px-3 py-2.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground h-7 gap-1.5 text-xs"
                    onClick={() =>
                      setLines((currentLines) => [
                        ...currentLines,
                        emptyLine('debit'),
                      ])
                    }
                  >
                    <Check className="h-3 w-3" />
                    Add line
                  </Button>

                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground text-xs">
                      Dr{' '}
                      <span className="text-foreground font-mono font-medium tabular-nums">
                        <FormattedAmount
                          amount={totalDebit}
                          currency={journal?.currencyCode ?? 'USD'}
                          showSymbol
                        />
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Cr{' '}
                      <span className="text-foreground font-mono font-medium tabular-nums">
                        <FormattedAmount
                          amount={totalCredit}
                          currency={journal?.currencyCode ?? 'USD'}
                          showSymbol
                        />
                      </span>
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        isBalanced
                          ? 'bg-success/10 text-success'
                          : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {isBalanced ? 'Balanced' : 'Out of balance'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* AI: Suggest entries — desktop */}
            {!isMobile && title.trim().length >= 3 && (
              <div className="flex justify-end">
                <AiAssistButton
                  onClick={handleSuggestEntries}
                  isLoading={isSuggestingEntries}
                  label="Suggest entries"
                  loadingLabel="Thinking..."
                />
              </div>
            )}

            {/* Bottom Actions: Memo & Attachments */}
            <div className="grid gap-6 pb-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground text-[11px] font-medium uppercase">
                  Memo
                </Label>
                <Textarea
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  className="min-h-[80px] resize-none text-sm"
                  placeholder="Add a memo for this journal..."
                  rows={3}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground text-[11px] font-medium uppercase">
                  Attachments
                  {attachedFiles.length > 0 && (
                    <span className="text-muted-foreground/60 ml-1">
                      ({attachedFiles.length})
                    </span>
                  )}
                </Label>

                {/* Optimistic Upload List */}
                {uploadingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {uploadingFiles.map((file) => (
                      <div
                        key={file.id}
                        className="bg-muted/30 border-input flex animate-pulse items-center gap-1.5 rounded-full border px-3 py-1"
                      >
                        <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
                        <span className="text-muted-foreground text-[11px]">
                          Uploading...
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Attached file chips */}
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {attachedFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="bg-muted/40 border-border flex items-center gap-1.5 rounded-full border px-2.5 py-1"
                      >
                        <Paperclip className="text-muted-foreground h-3 w-3 shrink-0" />
                        <span className="max-w-[120px] truncate text-[11px]">
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setAttachedFiles((prev) =>
                              prev.filter((_, i) => i !== idx),
                            )
                          }
                          className="text-muted-foreground hover:text-destructive -mr-0.5 ml-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {isMobile ? (
                  /* Mobile: slim attach button + hint */
                  <div className="flex items-center gap-2">
                    <label className="border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors">
                      <Paperclip className="h-3 w-3" />
                      Attach files
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        accept="image/*,application/pdf,text/csv,application/vnd.ms-excel"
                        onChange={(e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) {
                            void handleFileUpload(Array.from(files));
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                    <span className="text-muted-foreground/50 text-[10px]">
                      Images, PDFs, CSV · Max 5 MB
                    </span>
                  </div>
                ) : (
                  /* Desktop: full dropzone */
                  <FileUploader
                    value={[]}
                    onValueChange={() => {}}
                    onUpload={handleFileUpload}
                    maxFileCount={5}
                    maxSize={5 * 1024 * 1024}
                    accept={{
                      'image/*': [],
                      'application/pdf': [],
                      'text/csv': [],
                      'application/vnd.ms-excel': [],
                    }}
                    className="h-40"
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          // --- VIEW MODE ---
          <div className="flex flex-col gap-1.5">
            <h2 className="text-foreground text-lg leading-tight font-semibold text-balance">
              {title || journal?.title || 'Untitled'}
            </h2>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span>{formatDateDisplay(date || journal?.date)}</span>
              {journal?.contactName && (
                <>
                  <span className="text-border">/</span>
                  <span>{journal.contactName}</span>
                </>
              )}
            </div>
            {memo && (
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                {memo}
              </p>
            )}
            {attachedFiles.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <Label className="text-muted-foreground mb-2 block text-xs font-medium uppercase">
                  Attachments
                </Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {attachedFiles.map((file, idx) => (
                    <a
                      key={idx}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-muted/30 hover:bg-muted/50 flex flex-col items-center justify-center gap-2 rounded-md border p-3 text-center transition-colors"
                    >
                      <span className="text-muted-foreground w-full max-w-[120px] truncate text-xs font-medium">
                        {file.name}
                      </span>
                      <span className="text-muted-foreground/50 text-[10px]">
                        {Math.round(file.size / 1024)} KB
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Shortcuts Hint (Desktop Only) */}
        {editing && !isMobile && (
          <div className="text-muted-foreground/70 flex flex-wrap items-center gap-3 text-[11px]">
            <span>
              <kbd className="bg-muted rounded border px-1 py-0.5 font-mono text-[10px]">
                {shortcutModifierLabel} S
              </kbd>{' '}
              save
            </span>
            <span>
              <kbd className="bg-muted rounded border px-1 py-0.5 font-mono text-[10px]">
                {shortcutModifierLabel} Enter
              </kbd>{' '}
              post
            </span>
          </div>
        )}

        <div className="flex flex-col gap-1">
          {recurringInfo.generatedFromTemplate && (
            <p className="text-muted-foreground/70 text-[11px]">
              <span className="bg-accent text-muted-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
                Auto-generated
              </span>{' '}
              from recurring template
            </p>
          )}
          {journal?.createdAt && (
            <p className="text-muted-foreground/50 text-[11px]">
              Created {formatDateDisplay(journal.createdAt)}
            </p>
          )}
        </div>
      </div>

      {/* MOBILE STICKY FOOTER (SMART TOTALS) */}
      {isMobile && editing && (
        <div className="bg-background border-border z-10 flex w-full flex-col gap-3 border-t p-4 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          {/* Smart totals — compact for large numbers */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground text-xs">
                Dr{' '}
                <span className="text-foreground font-mono font-medium">
                  ${compactAmount(totalDebit)}
                </span>
              </span>
              <span className="text-border">·</span>
              <span className="text-muted-foreground text-xs">
                Cr{' '}
                <span className="text-foreground font-mono font-medium">
                  ${compactAmount(totalCredit)}
                </span>
              </span>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                isBalanced
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {isBalanced
                ? '✓ Balanced'
                : `Diff $${formatAmount(Math.abs(totalDebit - totalCredit))}`}
            </span>
          </div>

          {/* §8: Loading spinners on buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={handleSave}
              disabled={!canSave || isSaving}
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Draft
            </Button>
            <Button
              className="flex-1 gap-1.5"
              onClick={() => setConfirmDialog('post')}
              disabled={!canPost || isSaving}
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Post Journal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
