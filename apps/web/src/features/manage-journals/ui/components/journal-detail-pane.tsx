import type {
  GetJournalResponse,
  JournalBatchInput,
} from '@accountable-books/contracts/schema';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
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
import {
  Check,
  Copy,
  Eye,
  Loader2,
  Pause,
  Pencil,
  Play,
  Repeat,
  RotateCcw,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { getJournalStatusBadgeVariant } from '../lib/journal-ui';
import { getShortcutModifierLabel } from '../lib/shortcut-ui';

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
  templateId,
  mockDetail,
  isCreatingNew,
  onCreatingNewChange,
  onJournalSelected,
}: {
  companyId: string;
  journalId: string | null;
  templateId?: string | null;
  mockDetail?: GetJournalResponse | null;
  isCreatingNew: boolean;
  onCreatingNewChange: (value: boolean) => void;
  onJournalSelected: (journalId: string | null) => void;
}) {
  const shortcutModifierLabel = getShortcutModifierLabel();
  const query = useJournal({
    companyId,
    journalId: journalId ?? '',
    includeFiles: true,
    includeDeleted: true,
    enabled: !!journalId && !mockDetail,
  });
  const recurringTemplateQuery = useRecurringTemplate({
    companyId,
    templateId: templateId ?? '',
    enabled: !!templateId && !mockDetail,
  });

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
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [memo, setMemo] = useState('');
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
      setLines([emptyLine('debit'), emptyLine('credit')]);
      setRecurringEnabled(false);
      setRecurringFrequency('monthly');
      setRecurringNextDate(computeNextDate(now, 'monthly'));
      setRecurringAutoPost(false);
      return;
    }

    if (!journal) return;

    const recurring = getRecurringState(journal);
    setEditing(false);
    setTitle(journal.title);
    setDate(journal.date);
    setMemo(journal.note ?? journal.description ?? '');
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
      reference: journal?.reference ?? null,
      date,
      title: title.trim(),
      description: memo.trim() || undefined,
      contactId: journal?.contactId ?? null,
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
    ],
  );

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

  const handleCancelEdit = useCallback(() => {
    if (isCreatingNew) {
      onCreatingNewChange(false);
      onJournalSelected(null);
      setEditing(false);
      return;
    }

    if (!journal) {
      setEditing(false);
      return;
    }

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
    setEditing(false);
  }, [
    detail?.entries,
    isCreatingNew,
    journal,
    onCreatingNewChange,
    onJournalSelected,
  ]);

  useEffect(() => {
    if (!editing) return;

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
  }, [canPost, canSave, editing, handlePost, handleSave, isSaving]);

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
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-foreground text-sm font-medium">
          No journal selected
        </p>
        <p className="text-muted-foreground text-xs">
          Pick one from the list, or press{' '}
          <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-[10px]">
            {shortcutModifierLabel} Shift N
          </kbd>{' '}
          (or{' '}
          <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-[10px]">
            Alt N
          </kbd>
          ) to create a new entry.
        </p>
      </div>
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
        <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-sm">
          Recurring template not found.
        </div>
      );
    }

    return (
      <div className="flex h-full flex-1 flex-col overflow-auto">
        <div className="flex items-center justify-between border-b px-5 py-2.5">
          <div className="flex items-center gap-2.5">
            <Badge variant="secondary">{template.status}</Badge>
            <span className="bg-accent text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize">
              <Repeat className="h-3 w-3" />
              {template.frequency}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {template.status === 'active' ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => void handleTemplateStatusChange('paused')}
                disabled={updateRecurringTemplateStatusMutation.isPending}
              >
                <Pause className="h-3.5 w-3.5" />
                Pause
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => void handleTemplateStatusChange('active')}
                disabled={updateRecurringTemplateStatusMutation.isPending}
              >
                <Play className="h-3.5 w-3.5" />
                {template.status === 'paused' ? 'Resume' : 'Activate'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => void handleTemplateRunNow()}
              disabled={
                template.status !== 'active' ||
                runRecurringTemplateNowMutation.isPending
              }
            >
              {runRecurringTemplateNowMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Generate next
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => void handleTemplatePreview()}
              disabled={previewRecurringTemplateMutation.isPending}
            >
              {previewRecurringTemplateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              Preview
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-foreground text-lg leading-tight font-semibold text-balance">
              {template.title || template.description || 'Recurring template'}
            </h2>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span>
                Next run: {formatDateDisplay(template.nextRunDateYMD)}
              </span>
              <span className="text-border">/</span>
              <span>Timezone: {template.templateTimezone}</span>
              <span className="text-border">/</span>
              <span>Auto post: {template.autoPost ? 'Yes' : 'No'}</span>
            </div>
            {template.note ? (
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                {template.note}
              </p>
            ) : null}
          </div>

          {templatePreview ? (
            <div className="bg-muted/40 space-y-1 rounded-md border p-3">
              <div className="text-muted-foreground text-[11px] font-medium uppercase">
                Preview for {formatDateDisplay(templatePreview.runDateYMD)}
              </div>
              <div className="text-sm font-medium">
                {templatePreview.title || '--'}
              </div>
              <div className="text-muted-foreground text-sm">
                {templatePreview.note || '--'}
              </div>
              <div className="text-muted-foreground text-xs">
                {templatePreview.entries.length} line
                {templatePreview.entries.length === 1 ? '' : 's'}
              </div>
            </div>
          ) : null}

          <div className="bg-card overflow-hidden rounded-lg border">
            <div className="text-muted-foreground grid grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_90px_110px] gap-2 border-b px-3 py-2 text-[11px] font-medium tracking-wider uppercase">
              <span>Account</span>
              <span>Description</span>
              <span>Side</span>
              <span className="text-right">Amount</span>
            </div>

            <div className="flex flex-col">
              {entries.map((entry: any, index: number) => (
                <div
                  key={entry.id}
                  className={`grid grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_90px_110px] items-center gap-2 px-3 py-1.5 ${
                    index !== entries.length - 1
                      ? 'border-border/50 border-b'
                      : ''
                  }`}
                >
                  <span className="truncate text-sm">
                    <span className="text-muted-foreground">
                      {[entry.coaCode, entry.coaName].filter(Boolean).join(' ')}
                    </span>
                    {!entry.coaCode && !entry.coaName ? (
                      <span className="text-muted-foreground font-mono text-[11px]">
                        {entry.coaId}
                      </span>
                    ) : null}
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
                      currency={template.currencyCode ?? 'USD'}
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

  if (!isCreatingNew && !journal) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-sm">
        Journal not found.
      </div>
    );
  }

  const currentStatus = journal?.status ?? 'draft';
  const isDraft = isCreatingNew || currentStatus === 'draft';
  const isPosted = !isCreatingNew && currentStatus === 'posted';
  const isVoided = !isCreatingNew && currentStatus === 'voided';
  const recurringInfo = getRecurringState(journal);

  return (
    <div className="flex h-full flex-1 flex-col overflow-auto">
      <div className="flex items-center justify-between border-b px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          {journal?.reference && (
            <span className="text-muted-foreground font-mono text-xs">
              {journal.reference}
            </span>
          )}
          <Badge variant={getJournalStatusBadgeVariant(currentStatus)}>
            {currentStatus}
          </Badge>
          {recurringInfo.enabled && (
            <span className="bg-accent text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize">
              <Repeat className="h-3 w-3" />
              {recurringInfo.frequency}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isDraft && editing && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={!canSave || isSaving}
                onClick={() => void handleSave()}
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
              {isCreatingNew ? (
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={!canPost || isSaving}
                  onClick={() => void handlePost()}
                >
                  <Send className="h-3.5 w-3.5" />
                  Post
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      disabled={!canPost || isSaving}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Post
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Post this journal?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Posted journals are immutable. You can reverse or copy
                        them afterward.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handlePost()}>
                        Post journal
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-7 gap-1.5 text-xs"
                onClick={handleCancelEdit}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </>
          )}

          {isDraft && !editing && !isCreatingNew && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-7 gap-1.5 text-xs"
                onClick={() => void handleCopy()}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive h-7 gap-1.5 text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Void
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Void this journal?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This marks the journal as voided. This action cannot be
                      undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleVoid()}>
                      Void journal
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}

          {isPosted && !editing && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reverse
                  </Button>
                </AlertDialogTrigger>
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
                    <AlertDialogAction onClick={() => void handleReverse()}>
                      Create reversal
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => void handleCopy()}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive h-7 gap-1.5 text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Void
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Void this journal?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This marks the journal as voided. This action cannot be
                      undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleVoid()}>
                      Void journal
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}

          {isVoided && !editing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => void handleCopy()}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy as new
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {editing ? (
          <div className="flex flex-col gap-3">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Journal title"
              className="h-auto rounded-none border-0 border-b bg-transparent px-0 py-1 text-lg font-semibold shadow-none focus-visible:ring-0"
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-muted-foreground text-[11px] font-medium">
                  Date
                </label>
                <Input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-muted-foreground text-[11px] font-medium">
                  Note
                </label>
                <Textarea
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  className="min-h-8 text-sm"
                  rows={2}
                />
              </div>
            </div>
          </div>
        ) : (
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
          </div>
        )}

        <div className="bg-card overflow-hidden rounded-lg border">
          <div
            className={`text-muted-foreground grid gap-2 border-b px-3 py-2 text-[11px] font-medium tracking-wider uppercase ${
              editing
                ? 'grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_90px_110px_32px]'
                : 'grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_90px_110px]'
            }`}
          >
            <span>Account</span>
            <span>Description</span>
            <span>Side</span>
            <span className="text-right">Amount</span>
            {editing ? <span /> : null}
          </div>

          <div className="flex flex-col">
            {lines.map((line, index) => (
              <div
                key={line.id}
                className={`grid items-center gap-2 px-3 py-1.5 ${
                  editing
                    ? 'grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_90px_110px_32px]'
                    : 'grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_90px_110px]'
                } ${index !== lines.length - 1 ? 'border-border/50 border-b' : ''}`}
              >
                {editing ? (
                  <Input
                    className="h-8 text-xs"
                    value={line.coaId}
                    onChange={(event) =>
                      setLines((currentLines) =>
                        currentLines.map((entry) =>
                          entry.id === line.id
                            ? { ...entry, coaId: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    placeholder="Account ID"
                  />
                ) : (
                  <span className="truncate text-sm">
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {line.coaCode || line.coaId}
                    </span>{' '}
                    <span className="text-foreground">{line.coaName}</span>
                  </span>
                )}

                {editing ? (
                  <Input
                    className="h-8 text-xs"
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
                    placeholder="Memo"
                  />
                ) : (
                  <span className="text-muted-foreground truncate text-sm">
                    {line.description || '--'}
                  </span>
                )}

                {editing ? (
                  <Select
                    value={line.side}
                    onValueChange={(value) =>
                      setLines((currentLines) =>
                        currentLines.map((entry) =>
                          entry.id === line.id
                            ? { ...entry, side: value as 'debit' | 'credit' }
                            : entry,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debit">Dr</SelectItem>
                      <SelectItem value="credit">Cr</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-muted-foreground text-[11px] uppercase">
                    {line.side === 'debit' ? 'Dr' : 'Cr'}
                  </span>
                )}

                {editing ? (
                  <Input
                    className="h-8 text-right font-mono text-xs"
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.amount || ''}
                    onChange={(event) =>
                      setLines((currentLines) =>
                        currentLines.map((entry) =>
                          entry.id === line.id
                            ? {
                                ...entry,
                                amount:
                                  Math.round(
                                    (Number(event.target.value || 0) +
                                      Number.EPSILON) *
                                      100,
                                  ) / 100,
                              }
                            : entry,
                        ),
                      )
                    }
                  />
                ) : (
                  <span className="text-right text-sm tabular-nums">
                    <FormattedAmount
                      amount={line.amount}
                      currency={journal?.currencyCode ?? 'USD'}
                      showSymbol
                    />
                  </span>
                )}

                {editing ? (
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
                    <X className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t px-3 py-2.5">
            {editing ? (
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
            ) : (
              <span />
            )}

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

        {editing ? (
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
                      setRecurringFrequency(normalizeRecurringFrequency(value))
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
        ) : (
          recurringInfo.enabled && (
            <div className="border-border bg-card rounded-lg border p-4">
              <div className="mb-3 flex items-center gap-2">
                <Repeat className="text-muted-foreground h-4 w-4" />
                <span className="text-foreground text-sm font-medium">
                  Recurring
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-[11px]">Frequency</p>
                  <p className="text-foreground font-medium capitalize">
                    {recurringInfo.frequency}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Next date</p>
                  <p className="text-foreground font-medium">
                    {formatDateDisplay(recurringInfo.nextDate)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Auto-post</p>
                  <p className="text-foreground font-medium">
                    {recurringInfo.autoPost ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
            </div>
          )
        )}

        {editing && (
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
    </div>
  );
}
