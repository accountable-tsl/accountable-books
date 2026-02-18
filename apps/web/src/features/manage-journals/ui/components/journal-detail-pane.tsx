import type {
  GetJournalResponse,
  JournalBatchInput,
  JournalMetadata,
  JournalMetadataRecurring,
  TxnFileBase,
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
import { AddProjectDialog } from '@/features/manage-projects/ui/components/projects-add';
import { useChartOfAccountsQuery } from '@/modules/accounting/chart-of-accounts';
import {
  useCopyJournal,
  useCreateJournal,
  useCreateRecurringTemplate,
  useJournal,
  usePostJournal,
  useReverseJournal,
  useUpdateJournal,
  useVoidJournal,
} from '@/modules/accounting/journals';
import { useContacts } from '@/modules/contacts/model/hooks';
import {
  getObjectDownloadUrl,
  getObjectUploadUrl,
  uploadFileToR2,
} from '@/modules/objects/api';
import {
  TRANSACTION_FILE_LIMITS,
  TRANSACTION_FILE_LIMITS_BYTES,
} from '@/modules/objects/constants';
import { useProjectsInfinite } from '@/modules/projects';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { useLocalStorage } from '@/shared/hooks/useLocalStorage';
import { useSession } from '@session';
import {
  Calendar,
  CalendarX,
  CheckCircle,
  ChevronDown,
  Clock,
  Columns3,
  Loader2,
  Paperclip,
  Plus,
  Repeat,
  Save,
  Send,
  Tag,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { getAllowedActionsForJournal } from '../config/journal-actions';
import { getErrorMessage, logError } from '../lib/error-utils';
import { getShortcutModifierLabel } from '../lib/shortcut-ui';
import { EmptyState } from './empty-state';
import { JournalDetailHeader } from './journal-detail-header';
import { JournalEntryLine } from './journal-entry-line';
import { RecurringTemplateDetailView } from './recurring-template-detail-view';

import type { JournalAction } from '../config/journal-actions';
import type { JournalDetailHeaderAction } from './journal-detail-header';
import type { EditableLine } from './journal-entry-line';

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
  projectName: null,
});

// Keep in sync with backend/contracts (no "quarterly" yet).
type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';

type RecurringState = {
  enabled: boolean;
  frequency: RecurringFrequency;
  nextDate: string;
  endDate: string;
  autoPost: boolean;
  generatedFromTemplate: boolean;
};

const DEFAULT_RECURRING_STATE: RecurringState = {
  enabled: false,
  frequency: 'monthly',
  nextDate: '',
  endDate: '',
  autoPost: false,
  generatedFromTemplate: false,
};

/** Snapshot of form state used to detect dirty when editing an existing journal. */
type EditSnapshot = {
  title: string;
  date: string;
  description: string;
  reference: string;
  contactId: string | null;
  memo: string;
  lines: EditableLine[];
  recurringState: RecurringState;
  attachedFileKeySig: string;
};

function linesEqual(a: EditableLine[], b: EditableLine[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (line, i) =>
      line.coaId === b[i].coaId &&
      line.description === b[i].description &&
      line.side === b[i].side &&
      line.amount === b[i].amount &&
      (line.projectId ?? null) === (b[i].projectId ?? null),
  );
}

function recurringStateEqual(a: RecurringState, b: RecurringState): boolean {
  return (
    a.enabled === b.enabled &&
    a.frequency === b.frequency &&
    a.nextDate === b.nextDate &&
    a.endDate === b.endDate &&
    a.autoPost === b.autoPost
  );
}

function getFileKeySig(files: TxnFileBase[]): string {
  // File "key" is the stable identifier (R2 key). Use a sorted signature to ignore ordering.
  return files
    .map((f) => f.key)
    .filter(Boolean)
    .sort()
    .join('|');
}

function mapJournalFilesToTxnFileBase(
  files?: GetJournalResponse['files'],
): TxnFileBase[] {
  if (!files?.length) return [];
  return files.map((f) => ({
    name: f.name,
    key: f.key,
    bucket_name: f.bucket_name,
    url: f.url,
    type: f.type,
    size_bytes: Number(f.size_bytes),
    checksum: f.checksum ?? null,
    provider: f.provider === 'cloudflare_r2' ? 'cloudflare_r2' : undefined,
    region: f.region ?? null,
    endpoint: f.endpoint ?? null,
  }));
}

const recurringFrequencyValues = new Set<RecurringFrequency>([
  'weekly',
  'monthly',
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
  if (!dateInput || dateInput.length < 10) return '';
  const y = Number(dateInput.slice(0, 4));
  const m = Number(dateInput.slice(5, 7));
  const d = Number(dateInput.slice(8, 10));
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return '';
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return '';

  switch (frequency) {
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'monthly':
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case 'yearly':
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
  }
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
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
  const metadata: JournalMetadata =
    (journal?.metadata as JournalMetadata | null | undefined) ?? {};
  const recurringMeta: Partial<JournalMetadataRecurring> =
    metadata.recurring ?? {};

  const isGeneratedFromTemplate =
    journal?.journalSource === 'generated_from_template';
  const enabled = Boolean(recurringMeta.enabled) || isGeneratedFromTemplate;
  const frequency = normalizeRecurringFrequency(recurringMeta.frequency);
  const nextDate =
    (typeof recurringMeta.nextDate === 'string' && recurringMeta.nextDate) ||
    computeNextDate(journal?.date ?? '', frequency);
  const endDate =
    (typeof recurringMeta.endDate === 'string' && recurringMeta.endDate) || '';

  return {
    enabled,
    frequency,
    nextDate: nextDate ?? '',
    endDate,
    autoPost: recurringMeta.autoPost === true,
    generatedFromTemplate: isGeneratedFromTemplate,
  };
}

function normalizeYMD(input: string | null | undefined): string {
  if (!input) return '';
  const s = String(input).trim();
  if (!s) return '';
  // Handle both YYYY-MM-DD and full ISO strings by taking the date prefix.
  const prefix = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(prefix) ? prefix : '';
}

function resolveEntryDescription(p: {
  lineDescription: string;
  journalDescription: string;
  journalTitle: string;
}): string {
  const line = p.lineDescription.trim();
  if (line) return line;
  const journalDesc = p.journalDescription.trim();
  if (journalDesc) return journalDesc;
  return p.journalTitle.trim();
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
  onTemplateSelected,
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
  onTemplateSelected?: (templateId: string | null) => void;
  onBack?: () => void;
}) {
  // Tablet/Hybrid range: 1024px - 1279px
  const isMobile = useMediaQuery('(max-width: 1023px)');
  // Using 1280px as the desktop breakpoint for the spreadsheet-like view
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const shortcutModifierLabel = getShortcutModifierLabel();
  const { company } = useSession();
  const reportingCurrencyCode = company?.reportingCurrencyCode || undefined;
  const query = useJournal({
    companyId,
    journalId: journalId ?? '',
    includeLedgerTotals: journalIsFx,
    includeFiles: true,
    includeDeleted: true,
    enabled: !!journalId && !mockDetail,
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

  // Projects query for per-entry project assignment
  const [projectSearch, setProjectSearch] = useState('');
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const projectsQuery = useProjectsInfinite({
    companyId,
    limit: 30,
    search: projectSearch ? projectSearch : undefined,
  });
  const projectItems = useMemo(() => {
    const pages = projectsQuery.data?.pages ?? [];
    const merged =
      pages.flatMap((p) => p.data?.projects ?? []).filter((p) => p.id) ?? [];
    const unique = new Map<string, string>();
    for (const p of merged) {
      const label = p.code ? `${p.code} · ${p.name}` : p.name;
      unique.set(p.id!, label);
    }
    return Array.from(unique.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [projectsQuery.data?.pages]);

  const {
    hasNextPage: projectsHasNextPage,
    isFetchingNextPage: projectsIsFetchingNextPage,
    fetchNextPage: projectsFetchNextPage,
  } = projectsQuery;

  const handleProjectLoadMore = useCallback(() => {
    if (projectsHasNextPage && !projectsIsFetchingNextPage) {
      projectsFetchNextPage();
    }
  }, [projectsHasNextPage, projectsIsFetchingNextPage, projectsFetchNextPage]);

  const createMutation = useCreateJournal();
  const createRecurringTemplateMutation = useCreateRecurringTemplate();
  const updateMutation = useUpdateJournal();
  const postMutation = usePostJournal();
  const voidMutation = useVoidJournal();
  const reverseMutation = useReverseJournal();
  const copyMutation = useCopyJournal();

  const detail = useMemo(() => {
    if (mockDetail) return mockDetail;
    return query.data ?? null;
  }, [mockDetail, query.data]);

  const journal = detail?.journal ?? null;
  const amountCurrencyCode = journal?.currencyCode ?? reportingCurrencyCode;

  const [editing, setEditing] = useState(false);
  const [showProjectColumn, setShowProjectColumn] = useLocalStorage(
    'journal-detail.show-project-column',
    false,
  );
  const [confirmDialog, setConfirmDialog] = useState<
    | 'post'
    | 'void'
    | 'reverse'
    | 'suggest'
    | 'discard'
    | 'discard-for-new'
    | null
  >(null);
  const pendingNewRef = useRef(false);
  const previousJournalIdRef = useRef<string | null>(null);
  const lastJournalIdRef = useRef<string | null>(null);
  const skipHydrateForRestoreRef = useRef(false);
  const initialSnapshotRef = useRef<EditSnapshot | null>(null);
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
  const [recurringState, setRecurringState] = useState<RecurringState>(
    DEFAULT_RECURRING_STATE,
  );
  // File Upload State
  const [uploadingFiles, setUploadingFiles] = useState<
    { name: string; id: string }[]
  >([]);
  const [attachedFiles, setAttachedFiles] = useState<TxnFileBase[]>([]);

  // Ref for auto-scrolling to newly added entries
  const lastEntryRef = useRef<HTMLDivElement>(null);

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

  const updateLine = useCallback(
    (lineId: string, updates: Partial<EditableLine>) => {
      setLines((cur) =>
        cur.map((e) => (e.id === lineId ? { ...e, ...updates } : e)),
      );
    },
    [],
  );

  const removeLine = useCallback((lineId: string) => {
    setLines((cur) =>
      cur.length <= 2 ? cur : cur.filter((e) => e.id !== lineId),
    );
  }, []);

  // --- HOISTED LOGIC FOR KEYBOARD SHORTCUTS ---
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
  const viewModeShowProjectColumn = useMemo(
    () => !isMobile && lines.some((l) => Boolean(l.projectId || l.projectName)),
    [isMobile, lines],
  );

  const canSave =
    title.trim().length > 0 &&
    !!normalizeYMD(date) &&
    lines.length >= 2 &&
    lines.every((line) => line.coaId && line.amount > 0);
  const isRecurringNew = isCreatingNew && recurringState.enabled;
  const canPost = canSave && isBalanced && !isRecurringNew;

  const recurringHintText = recurringState.autoPost
    ? 'Journals will be automatically posted to the ledger on each recurring date.'
    : 'Journals will be saved as drafts for your review before posting.';

  const isSaving =
    createMutation.isPending ||
    createRecurringTemplateMutation.isPending ||
    updateMutation.isPending ||
    postMutation.isPending ||
    voidMutation.isPending ||
    reverseMutation.isPending ||
    copyMutation.isPending;

  const savingSpinner = isSaving ? (
    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
  ) : null;

  const applyRecurringState = useCallback((state: RecurringState) => {
    setRecurringState(state);
  }, []);

  // --- SMART VALIDATION UI ---
  const [errorHighlight, setErrorHighlight] = useState<{
    title?: boolean;
    date?: boolean;
    unbalanced?: boolean;
    emptyLines?: boolean;
  }>({});
  const validationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (validationTimerRef.current != null) {
        window.clearTimeout(validationTimerRef.current);
      }
    };
  }, []);

  const validateInteraction = useCallback(
    (action: 'save' | 'post') => {
      const errors: typeof errorHighlight = {};
      let isValid = true;
      const issues: string[] = [];

      // 1. Basic Fields
      if (!title.trim()) {
        errors.title = true;
        issues.push('Title is required');
        isValid = false;
      }
      if (!date) {
        errors.date = true;
        issues.push('Date is required');
        isValid = false;
      }

      // 2. Lines Constraints
      if (lines.length < 2) {
        issues.push('At least 2 lines required');
        isValid = false;
      }
      const hasEmptyLines = lines.some((l) => !l.coaId || l.amount <= 0);
      if (hasEmptyLines) {
        errors.emptyLines = true;
        issues.push('All lines must have an account and amount');
        isValid = false;
      }

      // 3. Post-Specific
      if (action === 'post') {
        if (!isBalanced) {
          errors.unbalanced = true;
          issues.push('Journal must be balanced');
          isValid = false;
        }
        if (isRecurringNew) {
          issues.push('Cannot post a recurring template directly');
          isValid = false;
        }
      }

      if (!isValid) {
        setErrorHighlight(errors);
        // Clear highlights after animation (e.g. 2s)
        if (validationTimerRef.current != null) {
          window.clearTimeout(validationTimerRef.current);
        }
        validationTimerRef.current = window.setTimeout(
          () => setErrorHighlight({}),
          2000,
        );

        // Show toast with first issue or summary
        if (issues.length === 1) {
          toast.error(issues[0]);
        } else {
          toast.error(
            `Cannot ${action}: ${issues[0]} (+${issues.length - 1} more)`,
          );
        }
        return false;
      }

      return true;
    },
    [title, date, lines, isBalanced, isRecurringNew],
  );

  const hydrateFromJournal = useCallback(
    (
      j: NonNullable<typeof journal>,
      entries: Array<{
        id: string;
        description: string | null;
        side: 'debit' | 'credit';
        amount: number;
        coaId: string;
        coaCode?: string;
        coaName?: string;
        projectId?: string | null;
        projectName?: string | null;
      }>,
      files: TxnFileBase[],
    ) => {
      const recurring = getRecurringState(j);
      setEditing(false);
      setTitle(j.title);
      setDate(normalizeYMD(j.date));
      setMemo(j.note ?? '');
      setDescription(j.description ?? '');
      setShowMoreDetails(!!(j.reference ?? ''));
      applyRecurringState(recurring);
      setLines(
        (entries ?? []).map((entry) => ({
          id: entry.id,
          description: entry.description ?? '',
          side: entry.side,
          amount: entry.amount,
          coaId: entry.coaId,
          coaCode: entry.coaCode ?? '',
          coaName: entry.coaName ?? '',
          projectId: entry.projectId ?? null,
          projectName: entry.projectName ?? null,
        })),
      );
      setUploadingFiles([]);
      setAttachedFiles(files);
      setContactId(j.contactId ?? null);
      setReference(j.reference ?? '');
    },
    [applyRecurringState],
  );

  useEffect(() => {
    if (journalId) lastJournalIdRef.current = journalId;
  }, [journalId]);

  useEffect(() => {
    if (isCreatingNew) {
      // If we're currently editing with changes, defer and show discard dialog
      if (editing && !pendingNewRef.current) {
        // Use the same dirty detection we use elsewhere; otherwise we miss fields
        // like memo/reference/contact/recurring.
        if (isDirty) {
          pendingNewRef.current = true;
          previousJournalIdRef.current = lastJournalIdRef.current;
          setConfirmDialog('discard-for-new');
          return;
        }
      }
      pendingNewRef.current = false;
      setEditing(true);
      setTitle('');
      const now = new Date().toISOString().slice(0, 10);
      const newLines = [emptyLine('debit'), emptyLine('credit')];
      const newRecurring: RecurringState = {
        ...DEFAULT_RECURRING_STATE,
        nextDate: computeNextDate(now, 'monthly'),
      };
      setDate(now);
      setMemo('');
      setDescription('');
      setShowMoreDetails(false);
      setLines(newLines);
      applyRecurringState(newRecurring);
      setUploadingFiles([]);
      setAttachedFiles([]);
      setContactId(null);
      setReference('');
      // Snapshot the "clean" state for create-new, so we can warn on discard for
      // memo/reference/contact/recurring/etc (not only title/description/lines).
      initialSnapshotRef.current = {
        title: '',
        date: now,
        description: '',
        reference: '',
        contactId: null,
        memo: '',
        lines: newLines,
        recurringState: newRecurring,
        attachedFileKeySig: '',
      };
      return;
    }

    if (!journal) return;

    if (skipHydrateForRestoreRef.current) {
      skipHydrateForRestoreRef.current = false;
      return;
    }

    const entries = detail?.entries ?? [];
    const files = mapJournalFilesToTxnFileBase(detail?.files);
    hydrateFromJournal(journal, entries, files);

    const recurring = getRecurringState(journal);
    initialSnapshotRef.current = {
      title: journal.title,
      date: normalizeYMD(journal.date),
      description: journal.description ?? '',
      reference: journal.reference ?? '',
      contactId: journal.contactId ?? null,
      memo: journal.note ?? '',
      lines: entries.map((entry) => ({
        id: entry.id,
        description: entry.description ?? '',
        side: entry.side,
        amount: entry.amount,
        coaId: entry.coaId,
        coaCode: entry.coaCode ?? '',
        coaName: entry.coaName ?? '',
        projectId: entry.projectId ?? null,
        projectName: entry.projectName ?? null,
      })),
      recurringState: recurring,
      attachedFileKeySig: getFileKeySig(files),
    };
    // Intentionally "sync from props": run only when journal/data identity changes,
    // not when local form state (title, description, lines, etc.) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    detail?.entries,
    detail?.files,
    isCreatingNew,
    journal,
    hydrateFromJournal,
  ]);

  useEffect(() => {
    if (!editing || !recurringState.enabled || !date) return;
    setRecurringState((prev) => ({
      ...prev,
      nextDate: computeNextDate(date, prev.frequency),
    }));
  }, [date, editing, recurringState.enabled, recurringState.frequency]);

  const payload = useMemo<JournalBatchInput>(
    () => ({
      reference: reference.trim() || journal?.reference || null,
      date: normalizeYMD(date),
      title: title.trim(),
      description: description.trim() || undefined,
      contactId: contactId ?? journal?.contactId ?? null,
      currencyId: journal?.currencyId ?? null,
      exchangeRate: Number(journal?.exchangeRate ?? 1),
      status: 'draft',
      autoReversalDate: journal?.autoReversalDate ?? null,
      note: memo.trim() || null,
      metadata: {
        ...((journal?.metadata as JournalMetadata | null | undefined) ?? {}),
        recurring: recurringState.enabled
          ? {
              enabled: true,
              frequency: recurringState.frequency,
              nextDate:
                recurringState.nextDate ||
                computeNextDate(date, recurringState.frequency),
              autoPost: recurringState.autoPost,
              endDate: recurringState.endDate || null,
            }
          : {
              enabled: false,
            },
      },
      entries: lines.map((line) => ({
        description: resolveEntryDescription({
          lineDescription: line.description,
          journalDescription: description,
          journalTitle: title,
        }),
        side: line.side,
        amount: line.amount,
        coaId: line.coaId,
        projectId: line.projectId,
      })),
      files: attachedFiles,
    }),
    [
      date,
      description,
      reference,
      contactId,
      journal,
      lines,
      memo,
      recurringState.autoPost,
      recurringState.enabled,
      recurringState.endDate,
      recurringState.frequency,
      recurringState.nextDate,
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
    // Enforce file count limit
    const remaining =
      TRANSACTION_FILE_LIMITS.MAX_FILES_PER_ENTRY - attachedFiles.length;
    if (remaining <= 0) {
      toast.error(
        `Maximum ${TRANSACTION_FILE_LIMITS.MAX_FILES_PER_ENTRY} files allowed`,
      );
      return;
    }
    const filesToUpload = files.slice(0, remaining);
    if (filesToUpload.length < files.length) {
      toast.warning(
        `Only ${remaining} more file${remaining === 1 ? '' : 's'} allowed — uploading first ${filesToUpload.length}`,
      );
    }

    // Enforce limits for mobile input as well (desktop FileUploader already enforces).
    const allowedFiles = filesToUpload.filter(
      (f) => f.size <= TRANSACTION_FILE_LIMITS_BYTES.MAX_FILE_SIZE_BYTES,
    );
    const rejectedCount = filesToUpload.length - allowedFiles.length;
    if (rejectedCount > 0) {
      toast.error(
        `${rejectedCount} file${rejectedCount === 1 ? '' : 's'} exceeded ${TRANSACTION_FILE_LIMITS.MAX_FILE_SIZE_MB} MB and ${rejectedCount === 1 ? 'was' : 'were'} skipped`,
      );
    }
    if (allowedFiles.length === 0) return;

    const existingTotalSize = attachedFiles.reduce(
      (sum, f) => sum + Number(f.size_bytes || 0),
      0,
    );
    const incomingTotalSize = allowedFiles.reduce((sum, f) => sum + f.size, 0);
    const totalSize = existingTotalSize + incomingTotalSize;
    if (totalSize > TRANSACTION_FILE_LIMITS_BYTES.MAX_TOTAL_SIZE_BYTES) {
      toast.error(
        `Total size exceeds ${TRANSACTION_FILE_LIMITS.MAX_TOTAL_SIZE_MB} MB limit`,
      );
      return;
    }

    // Optimistically update list with pending uploads
    const pendingUploads = allowedFiles.map((f) => ({
      name: f.name,
      id: Math.random().toString(36).slice(2),
    }));
    setUploadingFiles((prev) => [...prev, ...pendingUploads]);

    const newAttachments: TxnFileBase[] = [];

    for (let i = 0; i < allowedFiles.length; i++) {
      const file = allowedFiles[i];
      const pendingId = pendingUploads[i].id;

      try {
        const uploadUrlRes = await getObjectUploadUrl({
          companyId,
          bucketType: 'txnFiles',
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          folderContext: 'journals',
        });

        if (uploadUrlRes.success && uploadUrlRes.data) {
          const { signedUrl, fileKey, bucketName, url } = uploadUrlRes.data;
          await uploadFileToR2(file, signedUrl);

          newAttachments.push({
            name: file.name,
            key: fileKey,
            bucket_name: bucketName,
            url,
            type: file.type || 'application/octet-stream',
            size_bytes: file.size,
            checksum: null,
            provider: 'cloudflare_r2',
            region: null,
            endpoint: null,
          });
        } else {
          toast.error(
            uploadUrlRes.message ?? `Failed to get upload URL for ${file.name}`,
          );
        }
      } catch (error) {
        logError('File upload failed', error);
        toast.error(getErrorMessage(error, `Failed to upload ${file.name}`), {
          position: isMobile ? 'top-center' : 'bottom-right',
        });
      } finally {
        // Remove from pending
        setUploadingFiles((prev) => prev.filter((p) => p.id !== pendingId));
      }
    }

    if (newAttachments.length > 0) {
      setAttachedFiles((prev) => [...prev, ...newAttachments]);
    }
  };

  const openAttachment = useCallback(async (file: TxnFileBase) => {
    if (!file.key) {
      toast.error('Unable to open file (missing file key)');
      return;
    }

    // Avoid pop-up blockers by opening a blank tab immediately.
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
      toast.error('Popup blocked. Please allow popups to open attachments.');
      return;
    }

    try {
      const res = await getObjectDownloadUrl({
        bucketType: 'txnFiles',
        fileKey: file.key,
        timeout: 3600,
      });
      if (res.success && res.data?.url) {
        w.location.href = res.data.url;
        return;
      }
      w.close();
      toast.error(res.message ?? 'Unable to open attachment');
    } catch (error) {
      w.close();
      logError('Open attachment failed', error);
      toast.error(getErrorMessage(error, 'Unable to open attachment'));
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    if (mockDetail) {
      toast.success('Draft saved (mock mode)');
      setEditing(false);
      return;
    }

    try {
      if (isRecurringNew) {
        const templateDescription =
          description.trim() || title.trim() || 'Recurring journal template';
        const res = await createRecurringTemplateMutation.mutateAsync({
          companyId,
          data: {
            description: templateDescription,
            title: title.trim() || null,
            note: memo.trim() || null,
            contactId: contactId ?? null,
            currencyId: journal?.currencyId ?? null,
            frequency: recurringState.frequency,
            startDateYMD: date,
            endDateYMD: recurringState.endDate || null,
            autoPost: recurringState.autoPost,
            entries: lines.map((line) => ({
              description:
                resolveEntryDescription({
                  lineDescription: line.description,
                  journalDescription: templateDescription,
                  journalTitle: templateDescription,
                }) || templateDescription,
              side: line.side,
              amount: line.amount,
              coaId: line.coaId,
            })),
          },
        });
        if (res.success) {
          onCreatingNewChange(false);
          onJournalSelected(null);
          toast.success('Template saved');
          return;
        }
        toast.error(res.message ?? 'Unable to save template');
        return;
      }
      if (isCreatingNew) {
        const res = await createMutation.mutateAsync({
          companyId,
          data: payload,
        });
        const createdId = res.data?.journalBatchId ?? res.data?.journalId;
        if (res.success && createdId) {
          onCreatingNewChange(false);
          onJournalSelected(createdId);
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
    } catch (error) {
      logError('Save draft failed', error);
      toast.error(getErrorMessage(error, 'Unable to save draft'));
    }
  }, [
    canSave,
    companyId,
    contactId,
    createMutation,
    createRecurringTemplateMutation,
    date,
    description,
    isCreatingNew,
    isRecurringNew,
    journalId,
    journal?.currencyId,
    lines,
    memo,
    mockDetail,
    onCreatingNewChange,
    onJournalSelected,
    payload,
    query,
    recurringState.autoPost,
    recurringState.endDate,
    recurringState.frequency,
    title,
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
        const createdId =
          createRes.data?.journalBatchId ?? createRes.data?.journalId;
        if (!createRes.success || !createdId) {
          toast.error(
            createRes.message ?? 'Unable to create draft for posting',
          );
          return;
        }
        const postRes = await postMutation.mutateAsync({
          companyId,
          journalId: createdId,
        });
        if (postRes.success) {
          onCreatingNewChange(false);
          onJournalSelected(createdId);
          toast.success('Journal posted');
          return;
        }
        toast.error(postRes.message ?? 'Unable to post journal');
        return;
      } else if (journalId) {
        if (editing) {
          const updateRes = await updateMutation.mutateAsync({
            companyId,
            journalId,
            data: payload,
          });
          if (!updateRes.success) {
            toast.error(
              updateRes.message ?? 'Unable to save draft before posting',
            );
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
        toast.error(postRes.message ?? 'Unable to post journal');
        return;
      }
      toast.error('Unable to post journal');
    } catch (error) {
      logError('Post journal failed', error);
      toast.error(getErrorMessage(error, 'Unable to post journal'));
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
    const snap = initialSnapshotRef.current;
    if (!snap) return false;
    return (
      title !== snap.title ||
      date !== snap.date ||
      description !== snap.description ||
      reference !== snap.reference ||
      (contactId ?? null) !== snap.contactId ||
      memo !== snap.memo ||
      !linesEqual(lines, snap.lines) ||
      !recurringStateEqual(recurringState, snap.recurringState) ||
      getFileKeySig(attachedFiles) !== snap.attachedFileKeySig ||
      uploadingFiles.length > 0
    );
  }, [
    title,
    date,
    description,
    reference,
    contactId,
    memo,
    lines,
    recurringState,
    attachedFiles,
    uploadingFiles.length,
  ]);

  const handleConfirmDiscard = useCallback(() => {
    if (isCreatingNew) {
      if (onBack) {
        onBack();
      } else {
        onCreatingNewChange(false);
        onJournalSelected(null);
      }
    } else if (journal) {
      hydrateFromJournal(
        journal,
        detail?.entries ?? [],
        mapJournalFilesToTxnFileBase(detail?.files),
      );
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
    detail?.files,
    hydrateFromJournal,
  ]);

  const handleCancelEdit = useCallback(() => {
    if (isDirty) {
      setConfirmDialog('discard');
      return;
    }
    handleConfirmDiscard();
  }, [isDirty, handleConfirmDiscard]);

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
      const copiedId = res.data?.journalBatchId ?? res.data?.journalId;
      if (res.success && copiedId) {
        onCreatingNewChange(false);
        onJournalSelected(copiedId);
        toast.success('Copied as draft');
        return;
      }
      toast.error(res.message ?? 'Unable to copy journal');
    } catch (error) {
      logError('Copy journal failed', error);
      toast.error(getErrorMessage(error, 'Unable to copy journal'));
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
      toast.error(res.message ?? 'Unable to reverse journal');
    } catch (error) {
      logError('Reverse journal failed', error);
      toast.error(getErrorMessage(error, 'Unable to reverse journal'));
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
      toast.error(res.message ?? 'Unable to void journal');
    } catch (error) {
      logError('Void journal failed', error);
      toast.error(getErrorMessage(error, 'Unable to void journal'));
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
              {shortcutModifierLabel} K
            </kbd>{' '}
            to ask AI for help.
          </>
        }
      />
    );
  }

  if (!mockDetail && !!journalId && query.isLoading) {
    return <CenteredLoader />;
  }
  if (!mockDetail && !!journalId && query.isError) {
    return <ErrorPage showHeader={false} type="default" />;
  }

  if (!isCreatingNew && templateId) {
    return (
      <RecurringTemplateDetailView
        companyId={companyId}
        templateId={templateId}
        mockDetail={!!mockDetail}
        onBack={onBack}
        isMobile={isMobile}
      />
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
  const editHeaderActions: JournalDetailHeaderAction[] = isRecurringNew
    ? [
        {
          key: 'save',
          label: 'Save Template',
          icon: Save,
          variant: 'default',
          title: 'Save template',
          disabled: isSaving,
          onClick: () => {
            if (isSaving) return;
            if (!canSave) {
              validateInteraction('save');
              return;
            }
            void handleSave();
          },
        },
        {
          key: 'cancel',
          label: 'Cancel',
          icon: X,
          variant: 'ghost',
          disabled: isSaving,
          onClick: () => {
            if (isSaving) return;
            handleCancelEdit();
          },
        },
      ]
    : [
        {
          key: 'save',
          label: 'Save Draft',
          icon: Save,
          variant: 'secondary',
          title: 'Save draft',
          disabled: isSaving,
          onClick: () => {
            if (isSaving) return;
            if (!canSave) {
              validateInteraction('save');
              return;
            }
            void handleSave();
          },
        },
        {
          key: 'post',
          label: 'Post Journal',
          icon: Send,
          variant: 'default',
          title: 'Post journal',
          disabled: isSaving,
          onClick: () => {
            if (isSaving) return;
            if (!canPost) {
              validateInteraction('post');
              return;
            }
            // If valid, show confirmation dialog (or post directly if new)
            if (isCreatingNew) {
              void handlePost();
            } else {
              setConfirmDialog('post');
            }
          },
        },
        {
          key: 'cancel',
          label: 'Cancel',
          icon: X,
          variant: 'ghost',
          disabled: isSaving,
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
            disabled: isSaving,
            title: action.label,
            onClick: () => {
              if (action.action === 'post') {
                if (!canPost) {
                  validateInteraction('post');
                  return;
                }
                if (isCreatingNew) {
                  void handlePost();
                } else {
                  setConfirmDialog('post');
                }
              } else {
                journalActionHandlers[action.action]();
              }
            },
          }));

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
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

        <AlertDialog
          open={confirmDialog === 'discard-for-new'}
          onOpenChange={(open) => {
            if (!open) {
              pendingNewRef.current = false;
              skipHydrateForRestoreRef.current = true;
              onCreatingNewChange(false);
              if (previousJournalIdRef.current) {
                onJournalSelected(previousJournalIdRef.current);
                previousJournalIdRef.current = null;
              }
              setConfirmDialog(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard changes?</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes. Discard them and create a new journal?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  pendingNewRef.current = false;
                  skipHydrateForRestoreRef.current = true;
                  onCreatingNewChange(false);
                  if (previousJournalIdRef.current) {
                    onJournalSelected(previousJournalIdRef.current);
                    previousJournalIdRef.current = null;
                  }
                  setConfirmDialog(null);
                }}
              >
                Keep editing
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  // Proceed to new journal — reset form
                  pendingNewRef.current = false;
                  setConfirmDialog(null);
                  setEditing(true);
                  setTitle('');
                  const now = new Date().toISOString().slice(0, 10);
                  const newLines = [emptyLine('debit'), emptyLine('credit')];
                  const newRecurring: RecurringState = {
                    ...DEFAULT_RECURRING_STATE,
                    nextDate: computeNextDate(now, 'monthly'),
                  };
                  setDate(now);
                  setMemo('');
                  setDescription('');
                  setShowMoreDetails(false);
                  setLines(newLines);
                  applyRecurringState(newRecurring);
                  setUploadingFiles([]);
                  setAttachedFiles([]);
                  setContactId(null);
                  setReference('');
                  initialSnapshotRef.current = {
                    title: '',
                    date: now,
                    description: '',
                    reference: '',
                    contactId: null,
                    memo: '',
                    lines: newLines,
                    recurringState: newRecurring,
                    attachedFileKeySig: '',
                  };
                }}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                Discard & create new
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
          showStatusLabel={!!!isRecurringNew}
        />

        {/* CONTENT SECTION (Scrollable) */}
        <div
          className={`flex flex-1 flex-col gap-5 overflow-y-auto p-5 ${isMobile ? 'gap-6 px-4' : ''}`}
        >
          {editing ? (
            <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-8">
              {/* Header: Title and Date */}
              <div className="flex flex-col gap-4">
                {/* Recurring toggle — visible pill on mobile, full card when enabled */}
                {isMobile && !recurringState.enabled ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRecurringState((prev) => ({ ...prev, enabled: true }))
                    }
                    className="border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    <Repeat className="h-3 w-3" />
                    Make recurring
                  </button>
                ) : (
                  <div className="border-border bg-card/40 hover:border-primary/20 group relative overflow-hidden rounded-lg border p-4 shadow-sm transition-all duration-200 hover:shadow-md">
                    <div className="pointer-events-none absolute inset-0" />
                    <div className="relative z-10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Repeat className="text-primary h-4 w-4" />
                        <Label
                          htmlFor="recurring-toggle"
                          className="text-foreground cursor-pointer text-sm font-semibold"
                        >
                          Recurring Template
                        </Label>
                      </div>
                      <Switch
                        id="recurring-toggle"
                        checked={recurringState.enabled}
                        onCheckedChange={(checked) =>
                          setRecurringState((prev) => ({
                            ...prev,
                            enabled: checked,
                          }))
                        }
                      />
                    </div>
                    {recurringState.enabled && (
                      <div className="mt-4 flex flex-col gap-1">
                        <div
                          className={`grid gap-x-6 gap-y-5 ${
                            isMobile
                              ? 'grid-cols-2'
                              : isDesktop
                                ? 'grid-cols-4 items-end'
                                : 'grid-cols-3'
                          }`}
                        >
                          {/* Frequency */}
                          <div className="flex flex-col gap-1.5">
                            <Label className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium tracking-wider uppercase">
                              <Clock className="h-3 w-3" />
                              Frequency
                            </Label>
                            <Select
                              value={recurringState.frequency}
                              onValueChange={(value) =>
                                setRecurringState((prev) => ({
                                  ...prev,
                                  frequency: normalizeRecurringFrequency(value),
                                }))
                              }
                            >
                              <SelectTrigger className="h-9 w-full text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="yearly">Yearly</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Start Date */}
                          <div className="flex flex-col gap-1.5">
                            <Label className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium tracking-wider uppercase">
                              <Calendar className="h-3 w-3" />
                              Start Date
                            </Label>
                            <DatePicker
                              value={
                                normalizeYMD(date)
                                  ? new Date(normalizeYMD(date) + 'T00:00:00')
                                  : undefined
                              }
                              onChange={(d) =>
                                setDate(d ? d.toISOString().slice(0, 10) : '')
                              }
                              showLabel={false}
                              buttonVariant="outline"
                              classNames={{ trigger: 'w-full h-9' }}
                            />
                          </div>

                          {/* End Date */}
                          <div
                            className={`flex flex-col gap-1.5 ${isMobile ? 'col-span-2' : ''}`}
                          >
                            <Label className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium tracking-wider uppercase">
                              <CalendarX className="h-3 w-3" />
                              End Date{' '}
                              <span className="px-1 leading-none font-normal normal-case opacity-50">
                                (optional)
                              </span>
                            </Label>
                            <DatePicker
                              value={
                                recurringState.endDate
                                  ? new Date(
                                      recurringState.endDate + 'T00:00:00',
                                    )
                                  : undefined
                              }
                              onChange={(d) =>
                                setRecurringState((prev) => ({
                                  ...prev,
                                  endDate: d
                                    ? d.toISOString().slice(0, 10)
                                    : '',
                                }))
                              }
                              showLabel={false}
                              buttonVariant="outline"
                              classNames={{ trigger: 'w-full h-9' }}
                            />
                          </div>

                          {/* When generated — Segmented Control */}
                          <div
                            className={`flex flex-col gap-2 ${isMobile || !isDesktop ? 'col-span-full' : ''}`}
                          >
                            <Label className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium tracking-wider uppercase">
                              <CheckCircle className="h-3 w-3" />
                              When generated
                            </Label>

                            <div className="flex gap-4">
                              <div className="bg-muted/40 border-border flex w-full max-w-[320px] rounded-lg border p-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRecurringState((prev) => ({
                                      ...prev,
                                      autoPost: false,
                                    }))
                                  }
                                  className={`flex flex-1 items-center justify-center rounded-md py-1.5 text-xs font-semibold transition-all ${
                                    !recurringState.autoPost
                                      ? 'bg-background text-foreground shadow-sm'
                                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
                                  }`}
                                >
                                  Save as Draft
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRecurringState((prev) => ({
                                      ...prev,
                                      autoPost: true,
                                    }))
                                  }
                                  className={`flex flex-1 items-center justify-center rounded-md py-1.5 text-xs font-semibold transition-all ${
                                    recurringState.autoPost
                                      ? 'bg-background text-foreground shadow-sm'
                                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
                                  }`}
                                >
                                  Post to Ledger
                                </button>
                              </div>

                              <div
                                title={recurringHintText}
                                className="text-muted-foreground/60 line-clamp-2 hidden w-full text-[11px] leading-relaxed lg:block xl:hidden"
                              >
                                {recurringHintText}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Hint Text Footer */}
                        <div
                          title={recurringHintText}
                          className="text-muted-foreground/60 w-full text-[11px] leading-relaxed lg:hidden xl:text-right"
                        >
                          {recurringHintText}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Title — floating label */}
                <div
                  className={isDesktop ? 'flex flex-row items-end gap-4' : ''}
                >
                  <div className="group/title relative flex-1">
                    <Input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      maxLength={200}
                      placeholder="Journal Title"
                      className={`peer text-foreground placeholder:text-muted-foreground/40 h-auto rounded-none border-0 border-b bg-transparent px-0 py-1 text-lg font-semibold shadow-none transition-[padding] duration-200 placeholder:font-normal focus-visible:pl-[3.25rem] focus-visible:ring-0 dark:bg-transparent ${isMobile ? 'py-1.5 text-base focus-visible:pl-[2.75rem]' : ''} ${title ? 'pl-[3.25rem]' + (isMobile ? ' !pl-[2.75rem]' : '') : ''} ${errorHighlight.title ? 'border-destructive/50 ring-destructive animate-pulse ring-2 ring-offset-2' : ''}`}
                    />
                    <span
                      className={`text-muted-foreground pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 text-xs font-medium tracking-wide capitalize opacity-0 transition-all duration-200 peer-focus:translate-x-0 peer-focus:opacity-100 ${isMobile ? 'text-[11px]' : 'text-xs'} ${title ? 'translate-x-0 opacity-100' : '-translate-x-1'} ${errorHighlight.title ? 'text-destructive' : ''}`}
                    >
                      Title
                    </span>
                  </div>
                </div>

                {/* Description — floating label + AI assist */}
                <div className="group/desc relative">
                  <Input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    onFocus={() => setIsDescriptionFocused(true)}
                    onBlur={() => setIsDescriptionFocused(false)}
                    maxLength={500}
                    placeholder="Add a short description..."
                    className={`peer text-muted-foreground placeholder:text-muted-foreground/30 h-auto rounded-none border-0 border-b bg-transparent px-0 py-1 pr-20 text-sm shadow-none transition-[padding] duration-200 focus-visible:pl-[5.5rem] focus-visible:ring-0 dark:bg-transparent ${isMobile ? 'py-1.5 focus-visible:pl-[5rem]' : ''} ${description ? 'pl-[5.5rem]' + (isMobile ? ' !pl-[5rem]' : '') : ''}`}
                  />
                  <span
                    className={`text-muted-foreground pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 text-[11px] font-medium tracking-wide capitalize opacity-0 transition-all duration-200 peer-focus:translate-x-0 peer-focus:opacity-100 ${description ? 'translate-x-0 opacity-100' : '-translate-x-1'}`}
                  >
                    Description
                  </span>
                  {/* AI: Generate/Improve description */}
                  {title.trim().length >= 3 &&
                    (!description.trim() || isDescriptionFocused) && (
                      <div className="absolute top-1/2 right-0 -translate-y-1/2">
                        <AiAssistButton
                          onMouseDown={(e) => e.preventDefault()}
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

                {/* Metadata row: Date · Contact · Reference */}
                <div
                  className={
                    isMobile
                      ? 'grid grid-cols-2 gap-3'
                      : 'grid grid-cols-3 gap-6'
                  }
                >
                  {/* Date — hidden when recurring is ON (Start Date is in the recurring card) */}
                  {!(isCreatingNew && recurringState.enabled) && (
                    <div className="min-w-0 overflow-hidden">
                      {isMobile ? (
                        <DatePicker
                          value={
                            normalizeYMD(date)
                              ? new Date(normalizeYMD(date) + 'T00:00:00')
                              : undefined
                          }
                          onChange={(d) =>
                            setDate(d ? d.toISOString().slice(0, 10) : '')
                          }
                          label="Date"
                          showLabel={true}
                          buttonVariant="outline"
                          classNames={{
                            wrapper: 'flex-col gap-0.5 w-full',
                            trigger: `dark:bg-transparent w-full border-0 border-b rounded-none px-0 shadow-none h-auto py-1.5 truncate max-w-full overflow-hidden text-sm ${errorHighlight.date ? 'border-destructive text-destructive animate-pulse' : ''}`,
                            label: `text-[11px] uppercase text-muted-foreground font-medium w-auto p-0 ${errorHighlight.date ? 'text-destructive' : ''}`,
                          }}
                        />
                      ) : (
                        <div className="min-w-0">
                          <Label
                            className={`text-muted-foreground mb-0.5 block text-[11px] font-medium uppercase ${errorHighlight.date ? 'text-destructive' : ''}`}
                          >
                            Date
                          </Label>
                          <DatePicker
                            value={
                              normalizeYMD(date)
                                ? new Date(normalizeYMD(date) + 'T00:00:00')
                                : undefined
                            }
                            onChange={(d) =>
                              setDate(d ? d.toISOString().slice(0, 10) : '')
                            }
                            showLabel={false}
                            buttonVariant="outline"
                            classNames={{
                              trigger: `dark:bg-transparent w-full h-9 ${errorHighlight.date ? 'border-destructive ring-destructive ring-1 animate-pulse' : ''}`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

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
                      className={`h-auto w-full bg-transparent text-sm dark:bg-transparent ${isMobile ? 'rounded-none border-0 border-b !px-0 py-1.5 shadow-none [&>span]:text-sm [&>span]:font-normal' : 'h-9'}`}
                    />
                  </div>

                  {/* Reference — non-mobile (hybrid + desktop) */}
                  {!isMobile && (
                    <div className="min-w-0">
                      <Label className="text-muted-foreground mb-0.5 block text-[11px] font-medium uppercase">
                        Reference
                      </Label>
                      <Input
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder="e.g. JL-001"
                        className="h-9 bg-transparent text-sm dark:bg-transparent"
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
                        <div className="group/mref relative">
                          <Input
                            value={reference}
                            onChange={(event) =>
                              setReference(event.target.value)
                            }
                            placeholder="e.g. INV-001"
                            className={`peer h-auto rounded-none border-0 border-b bg-transparent px-0 py-1.5 text-sm shadow-none transition-[padding] duration-200 focus-visible:pl-[5rem] focus-visible:ring-0 dark:bg-transparent ${reference ? 'pl-[5rem]' : ''}`}
                          />
                          <span
                            className={`text-muted-foreground pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 text-[11px] font-medium tracking-wide capitalize opacity-0 transition-all duration-200 peer-focus:translate-x-0 peer-focus:opacity-100 ${reference ? 'translate-x-0 opacity-100' : '-translate-x-1'}`}
                          >
                            Reference
                          </span>
                        </div>
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
                    <h3
                      className={`text-xs font-semibold tracking-wider uppercase ${
                        errorHighlight.emptyLines
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      }`}
                    >
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
                    <JournalEntryLine
                      key={line.id}
                      variant="card"
                      line={line}
                      updateLine={updateLine}
                      removeLine={removeLine}
                      coaItems={coaItems}
                      projectItems={projectItems}
                      projectAsync
                      onProjectSearchChange={setProjectSearch}
                      onProjectLoadMore={handleProjectLoadMore}
                      projectIsLoading={projectsQuery.isFetching}
                      projectHasMore={projectsQuery.hasNextPage ?? false}
                      onAddProject={() => setProjectDialogOpen(true)}
                      descriptionPlaceholder={
                        description.trim() ||
                        title.trim() ||
                        'Add description...'
                      }
                      canRemove={lines.length > 2}
                      amountCurrencyCode={amountCurrencyCode ?? ''}
                      formatAmount={formatAmount}
                      lastEntryRef={lastEntryRef}
                      isLastLine={index === lines.length - 1}
                    />
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
                <div
                  className={`bg-card overflow-hidden rounded-lg border ${
                    errorHighlight.emptyLines
                      ? 'border-destructive ring-destructive animate-pulse ring-1'
                      : ''
                  }`}
                >
                  <div
                    className={`text-muted-foreground grid gap-2 border-b px-3 py-2 text-[11px] font-medium tracking-wider uppercase ${
                      isDesktop
                        ? showProjectColumn
                          ? 'grid-cols-[250px_1fr_180px_120px_120px_32px]'
                          : 'grid-cols-[250px_1fr_120px_120px_32px]'
                        : 'grid-cols-[160px_1fr_80px_120px_32px]'
                    }`}
                  >
                    <span>Account</span>
                    <div className="flex items-center justify-between border-r border-transparent pr-2">
                      <span>Description</span>
                      {isDesktop && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-4 w-4 rounded ${
                            showProjectColumn
                              ? 'text-foreground bg-accent'
                              : 'text-muted-foreground/50 hover:text-foreground'
                          }`}
                          title={
                            showProjectColumn
                              ? 'Hide project column'
                              : 'Show project column'
                          }
                          aria-label={
                            showProjectColumn
                              ? 'Hide project column'
                              : 'Show project column'
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowProjectColumn((v) => !v);
                          }}
                        >
                          <Columns3 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                    {isDesktop && showProjectColumn && (
                      <span className="truncate">Project</span>
                    )}
                    {isDesktop ? (
                      <>
                        <span className="text-right">
                          Debit
                          {amountCurrencyCode ? ` (${amountCurrencyCode})` : ''}
                        </span>
                        <span className="text-right">
                          Credit
                          {amountCurrencyCode ? ` (${amountCurrencyCode})` : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-center">Side</span>
                        <span className="text-right">
                          Amount
                          {amountCurrencyCode ? ` (${amountCurrencyCode})` : ''}
                        </span>
                      </>
                    )}
                    <span className="flex items-center justify-end" />
                  </div>

                  <div className="flex flex-col">
                    {lines.map((line) => (
                      <JournalEntryLine
                        key={line.id}
                        variant="row"
                        line={line}
                        updateLine={updateLine}
                        removeLine={removeLine}
                        coaItems={coaItems}
                        projectItems={projectItems}
                        projectAsync
                        onProjectSearchChange={setProjectSearch}
                        onProjectLoadMore={handleProjectLoadMore}
                        projectIsLoading={projectsQuery.isFetching}
                        projectHasMore={projectsQuery.hasNextPage ?? false}
                        onAddProject={() => setProjectDialogOpen(true)}
                        showProjectColumn={isDesktop && showProjectColumn}
                        descriptionPlaceholder={
                          description.trim() || title.trim() || 'Description'
                        }
                        canRemove={lines.length > 2}
                        isDesktop={isDesktop}
                        formatAmount={formatAmount}
                      />
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
                          emptyLine(getSmartDefaultSide()),
                        ])
                      }
                    >
                      <Plus className="h-3 w-3" />
                      Add line
                    </Button>

                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground text-xs">
                        Dr{' '}
                        <span className="text-foreground font-mono font-medium tabular-nums">
                          <FormattedAmount
                            amount={totalDebit}
                            currency={amountCurrencyCode}
                            showSymbol
                          />
                        </span>
                      </span>
                      <span className="text-muted-foreground text-xs">
                        Cr{' '}
                        <span className="text-foreground font-mono font-medium tabular-nums">
                          <FormattedAmount
                            amount={totalCredit}
                            currency={amountCurrencyCode}
                            showSymbol
                          />
                        </span>
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          totalDebit === 0 && totalCredit === 0
                            ? 'bg-muted/50 text-muted-foreground'
                            : isBalanced
                              ? 'bg-success/10 text-success'
                              : 'bg-destructive/10 text-destructive'
                        }`}
                      >
                        {totalDebit === 0 && totalCredit === 0
                          ? 'Empty'
                          : isBalanced
                            ? '✓ Balanced'
                            : `Diff ${formatAmount(Math.abs(totalDebit - totalCredit))}`}
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
                      {attachedFiles.map((file) => (
                        <div
                          key={file.key}
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
                                prev.filter((f) => f.key !== file.key),
                              )
                            }
                            className="text-muted-foreground hover:text-destructive -mr-0.5 ml-0.5"
                            aria-label="Remove attachment"
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
                        Images, PDFs, CSV · Max{' '}
                        {TRANSACTION_FILE_LIMITS.MAX_FILE_SIZE_MB} MB
                      </span>
                    </div>
                  ) : (
                    /* Desktop: full dropzone */
                    <FileUploader
                      value={[]}
                      onValueChange={() => {}}
                      onUpload={handleFileUpload}
                      maxFileCount={TRANSACTION_FILE_LIMITS.MAX_FILES_PER_ENTRY}
                      maxSize={
                        TRANSACTION_FILE_LIMITS_BYTES.MAX_FILE_SIZE_BYTES
                      }
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

              {/* Desktop Bottom Actions — inline at end of form */}
              {!isMobile && (
                <div className="flex items-center justify-end gap-3 pt-4 pb-2">
                  {isRecurringNew ? (
                    <Button
                      onClick={() => {
                        if (isSaving) return;
                        if (!canSave) {
                          validateInteraction('save');
                          return;
                        }
                        void handleSave();
                      }}
                      disabled={isSaving}
                      title="Save template"
                      className="w-36 gap-2"
                    >
                      {savingSpinner}
                      Save Template
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (isSaving) return;
                          if (!canSave) {
                            validateInteraction('save');
                            return;
                          }
                          void handleSave();
                        }}
                        disabled={isSaving}
                        title="Save draft"
                        className="w-32 gap-2"
                      >
                        {savingSpinner}
                        Save Draft
                      </Button>
                      <Button
                        onClick={() => {
                          if (isSaving) return;
                          if (!canPost) {
                            validateInteraction('post');
                            return;
                          }
                          setConfirmDialog('post');
                        }}
                        disabled={isSaving}
                        title="Post journal"
                        className="w-32 gap-2"
                      >
                        {savingSpinner}
                        Post Journal
                      </Button>
                    </>
                  )}
                </div>
              )}
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

              {(journal?.generatedFromTemplateId ||
                detail?.relatedJournals?.originalJournal?.id ||
                detail?.relatedJournals?.reversalJournal?.id) && (
                <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                  {journal?.generatedFromTemplateId ? (
                    <span className="inline-flex items-center gap-1">
                      <span>From template</span>
                      {onTemplateSelected ? (
                        <button
                          type="button"
                          className="text-foreground hover:underline"
                          onClick={() =>
                            onTemplateSelected(journal.generatedFromTemplateId)
                          }
                        >
                          View
                        </button>
                      ) : null}
                    </span>
                  ) : null}

                  {detail?.relatedJournals?.originalJournal?.id ? (
                    <span className="inline-flex items-center gap-1">
                      <span>Reversal of</span>
                      <button
                        type="button"
                        className="text-foreground hover:underline"
                        onClick={() =>
                          onJournalSelected(
                            detail.relatedJournals.originalJournal!.id,
                          )
                        }
                        title={`${detail.relatedJournals.originalJournal!.title} (${detail.relatedJournals.originalJournal!.date})`}
                      >
                        {detail.relatedJournals.originalJournal!.reference ??
                          detail.relatedJournals.originalJournal!.title}
                      </button>
                    </span>
                  ) : null}

                  {detail?.relatedJournals?.reversalJournal?.id ? (
                    <span className="inline-flex items-center gap-1">
                      <span>Reversed by</span>
                      <button
                        type="button"
                        className="text-foreground hover:underline"
                        onClick={() =>
                          onJournalSelected(
                            detail.relatedJournals.reversalJournal!.id,
                          )
                        }
                        title={`${detail.relatedJournals.reversalJournal!.title} (${detail.relatedJournals.reversalJournal!.date})`}
                      >
                        {detail.relatedJournals.reversalJournal!.reference ??
                          detail.relatedJournals.reversalJournal!.title}
                      </button>
                    </span>
                  ) : null}
                </div>
              )}

              {/* Entries (read-only) — same structure as edit mode for consistent feel */}
              {lines.length > 0 &&
                (isMobile ? (
                  <div className="bg-card mt-4 overflow-hidden rounded-lg border">
                    {lines.map((line) => {
                      const sideLabel = line.side === 'debit' ? 'Dr' : 'Cr';
                      const account = line.coaName || line.coaCode || '—';
                      const meta =
                        [line.description?.trim(), line.projectName?.trim()]
                          .filter(Boolean)
                          .join(' · ') || null;

                      return (
                        <div
                          key={line.id}
                          className="border-border/40 flex flex-col gap-1 border-b px-4 py-4 last:border-0"
                        >
                          {/* Top Row: Account & Amount */}
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2 truncate">
                                <span className="text-foreground truncate text-sm font-medium">
                                  {account}
                                </span>
                                {line.coaCode ? (
                                  <span className="text-muted-foreground/60 font-mono text-[10px]">
                                    {line.coaCode}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="text-foreground shrink-0 text-right font-mono text-sm font-semibold tabular-nums">
                              {line.amount !== 0 ? (
                                <FormattedAmount
                                  amount={line.amount}
                                  currency={amountCurrencyCode}
                                  showSymbol
                                />
                              ) : (
                                '—'
                              )}
                            </div>
                          </div>

                          {/* Bottom Row: Meta & Side Text */}
                          <div className="flex items-end justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              {meta ? (
                                <div
                                  className="text-muted-foreground line-clamp-1 text-xs leading-snug"
                                  title={meta}
                                >
                                  {meta}
                                </div>
                              ) : (
                                <div className="text-muted-foreground/30 text-[11px] italic">
                                  No description
                                </div>
                              )}
                            </div>
                            <span className="text-muted-foreground shrink-0 text-[11px] font-medium tracking-wider uppercase">
                              {sideLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    <div className="bg-muted/30 border-border/50 flex items-center justify-between gap-3 border-t px-4 py-3">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground text-xs">
                          Dr{' '}
                          <span className="text-foreground font-mono font-medium tabular-nums">
                            <FormattedAmount
                              amount={totalDebit}
                              currency={amountCurrencyCode}
                              showSymbol
                            />
                          </span>
                        </span>
                        <span className="text-border">·</span>
                        <span className="text-muted-foreground text-xs">
                          Cr{' '}
                          <span className="text-foreground font-mono font-medium tabular-nums">
                            <FormattedAmount
                              amount={totalCredit}
                              currency={amountCurrencyCode}
                              showSymbol
                            />
                          </span>
                        </span>
                      </div>
                      <span
                        className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          totalDebit === 0 && totalCredit === 0
                            ? 'bg-muted/50 text-muted-foreground'
                            : isBalanced
                              ? 'bg-success/10 text-success'
                              : 'bg-destructive/10 text-destructive'
                        } ${errorHighlight.unbalanced ? 'ring-destructive animate-pulse ring-2' : ''}`}
                      >
                        {totalDebit === 0 && totalCredit === 0
                          ? 'Empty'
                          : isBalanced
                            ? '✓ Balanced'
                            : `Diff ${formatAmount(Math.abs(totalDebit - totalCredit))}`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-card mt-4 overflow-x-auto rounded-lg border">
                    <div
                      className={`min-w-[560px] ${viewModeShowProjectColumn ? 'min-w-[760px]' : ''}`}
                    >
                      <div
                        className={`text-muted-foreground grid gap-2 border-b px-3 py-2 text-[11px] font-medium tracking-wider uppercase ${
                          isDesktop
                            ? viewModeShowProjectColumn
                              ? 'grid-cols-[250px_1fr_180px_120px_120px]'
                              : 'grid-cols-[250px_1fr_120px_120px]'
                            : viewModeShowProjectColumn
                              ? 'grid-cols-[minmax(120px,1fr)_1fr_160px_100px_100px]'
                              : 'grid-cols-[minmax(120px,1fr)_1fr_100px_100px]'
                        }`}
                      >
                        <span>Account</span>
                        <span>Description</span>
                        {viewModeShowProjectColumn ? (
                          <span className="truncate">Project</span>
                        ) : null}
                        <span className="text-right">
                          Debit
                          {amountCurrencyCode ? ` (${amountCurrencyCode})` : ''}
                        </span>
                        <span className="text-right">
                          Credit
                          {amountCurrencyCode ? ` (${amountCurrencyCode})` : ''}
                        </span>
                      </div>

                      <div className="flex flex-col">
                        {lines.map((line) => (
                          <div
                            key={line.id}
                            className={`text-foreground border-border/50 grid gap-2 border-b px-3 py-2 text-sm last:border-0 ${
                              isDesktop
                                ? viewModeShowProjectColumn
                                  ? 'grid-cols-[250px_1fr_180px_120px_120px]'
                                  : 'grid-cols-[250px_1fr_120px_120px]'
                                : viewModeShowProjectColumn
                                  ? 'grid-cols-[minmax(120px,1fr)_1fr_160px_100px_100px]'
                                  : 'grid-cols-[minmax(120px,1fr)_1fr_100px_100px]'
                            }`}
                          >
                            <span className="font-medium">
                              {line.coaName || line.coaCode || '—'}
                            </span>

                            {viewModeShowProjectColumn ? (
                              <>
                                <span className="text-muted-foreground truncate">
                                  {line.description || '—'}
                                </span>
                                <span className="text-muted-foreground truncate">
                                  {line.projectName || '—'}
                                </span>
                              </>
                            ) : (
                              <div className="min-w-0">
                                <div className="text-muted-foreground truncate">
                                  {line.description || '—'}
                                </div>
                                {line.projectName ? (
                                  <div className="text-muted-foreground/70 truncate text-[11px]">
                                    {line.projectName}
                                  </div>
                                ) : null}
                              </div>
                            )}

                            <span className="text-right font-mono tabular-nums">
                              {line.side === 'debit' && line.amount !== 0 ? (
                                <FormattedAmount
                                  amount={line.amount}
                                  currency={amountCurrencyCode}
                                  showSymbol
                                />
                              ) : (
                                '—'
                              )}
                            </span>
                            <span className="text-right font-mono tabular-nums">
                              {line.side === 'credit' && line.amount !== 0 ? (
                                <FormattedAmount
                                  amount={line.amount}
                                  currency={amountCurrencyCode}
                                  showSymbol
                                />
                              ) : (
                                '—'
                              )}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="border-border flex items-center justify-end gap-4 border-t px-3 py-2.5">
                        <span className="text-muted-foreground text-xs">
                          Dr{' '}
                          <span className="text-foreground font-mono font-medium tabular-nums">
                            <FormattedAmount
                              amount={totalDebit}
                              currency={amountCurrencyCode}
                              showSymbol
                            />
                          </span>
                        </span>
                        <span className="text-muted-foreground text-xs">
                          Cr{' '}
                          <span className="text-foreground font-mono font-medium tabular-nums">
                            <FormattedAmount
                              amount={totalCredit}
                              currency={amountCurrencyCode}
                              showSymbol
                            />
                          </span>
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            totalDebit === 0 && totalCredit === 0
                              ? 'bg-muted/50 text-muted-foreground'
                              : isBalanced
                                ? 'bg-success/10 text-success'
                                : 'bg-destructive/10 text-destructive'
                          } ${errorHighlight.unbalanced ? 'ring-destructive animate-pulse ring-2' : ''}`}
                        >
                          {totalDebit === 0 && totalCredit === 0
                            ? 'Empty'
                            : isBalanced
                              ? '✓ Balanced'
                              : `Diff ${formatAmount(Math.abs(totalDebit - totalCredit))}`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

              {memo && (
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  {memo}
                </p>
              )}
              <div className="mt-4 border-t pt-4">
                <Label className="text-muted-foreground mb-2 block text-xs font-medium uppercase">
                  Attachments
                </Label>
                {attachedFiles.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {attachedFiles.map((file) => (
                      <button
                        type="button"
                        key={file.key}
                        onClick={() => void openAttachment(file)}
                        className="bg-muted/30 hover:bg-muted/50 flex flex-col items-center justify-center gap-2 rounded-md border p-3 text-center transition-colors"
                      >
                        <span className="text-muted-foreground w-full max-w-[120px] truncate text-xs font-medium">
                          {file.name}
                        </span>
                        <span className="text-muted-foreground/50 text-[10px]">
                          {Math.round(Number(file.size_bytes) / 1024)} KB
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No attachments
                  </p>
                )}
              </div>
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
                    <FormattedAmount
                      amount={totalDebit}
                      currency={amountCurrencyCode}
                      showSymbol
                    />
                  </span>
                </span>
                <span className="text-border">·</span>
                <span className="text-muted-foreground text-xs">
                  Cr{' '}
                  <span className="text-foreground font-mono font-medium">
                    <FormattedAmount
                      amount={totalCredit}
                      currency={amountCurrencyCode}
                      showSymbol
                    />
                  </span>
                </span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  totalDebit === 0 && totalCredit === 0
                    ? 'bg-muted/50 text-muted-foreground'
                    : isBalanced
                      ? 'bg-success/10 text-success'
                      : 'bg-destructive/10 text-destructive'
                }`}
              >
                {totalDebit === 0 && totalCredit === 0 ? (
                  'Empty'
                ) : isBalanced ? (
                  '✓ Balanced'
                ) : (
                  <>
                    Diff{' '}
                    <FormattedAmount
                      amount={Math.abs(totalDebit - totalCredit)}
                      currency={amountCurrencyCode}
                      showSymbol
                    />
                  </>
                )}
              </span>
            </div>

            {/* §8: Loading spinners on buttons */}
            <div className="flex gap-2">
              {isRecurringNew ? (
                <Button
                  className="flex-1 gap-1.5"
                  onClick={() => {
                    if (isSaving) return;
                    if (!canSave) {
                      validateInteraction('save');
                      return;
                    }
                    void handleSave();
                  }}
                  disabled={isSaving}
                  title="Save template"
                >
                  {savingSpinner}
                  Save Template
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => {
                      if (isSaving) return;
                      if (!canSave) {
                        validateInteraction('save');
                        return;
                      }
                      void handleSave();
                    }}
                    disabled={isSaving}
                    title="Save draft"
                  >
                    {savingSpinner}
                    Save Draft
                  </Button>
                  <Button
                    className="flex-1 gap-1.5"
                    onClick={() => {
                      if (isSaving) return;
                      if (!canPost) {
                        validateInteraction('post');
                        return;
                      }
                      setConfirmDialog('post');
                    }}
                    disabled={isSaving}
                    title="Post journal"
                  >
                    {savingSpinner}
                    Post Journal
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <AddProjectDialog
        open={projectDialogOpen}
        onOpenChange={(open) => {
          setProjectDialogOpen(open);
          if (!open) setProjectSearch('');
        }}
      />
    </>
  );
}
