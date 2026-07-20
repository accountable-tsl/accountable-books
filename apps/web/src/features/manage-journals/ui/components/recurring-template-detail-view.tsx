import type {
  PreviewRecurringTemplateResponse,
  RecurringTemplateDetailEntry,
} from '@accountable-books/contracts/schema';
import { useCallback, useMemo, useState } from 'react';
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
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useDeleteRecurringTemplate,
  usePreviewRecurringTemplate,
  useRecurringTemplate,
  useRunRecurringTemplateNow,
  useUpdateRecurringTemplateStatus,
} from '@/modules/accounting/journals';
import { useSession } from '@session';
import { Eye, Repeat } from 'lucide-react';
import { toast } from 'sonner';

import { getAllowedActionsForTemplate } from '../config/journal-actions';
import { getErrorMessage, logError } from '../lib/error-utils';
import { EmptyState } from './empty-state';
import { JournalDetailHeader } from './journal-detail-header';

import type { TemplateAction } from '../config/journal-actions';
import type { JournalDetailHeaderAction } from './journal-detail-header';

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

export function RecurringTemplateDetailView({
  companyId,
  templateId,
  mockDetail,
  onBack,
  isMobile,
}: {
  companyId: string;
  templateId: string;
  mockDetail?: boolean;
  onBack?: () => void;
  isMobile: boolean;
}) {
  const { company } = useSession();
  const reportingCurrencyCode = company?.reportingCurrencyCode ?? undefined;

  const recurringTemplateQuery = useRecurringTemplate({
    companyId,
    templateId,
    enabled: !!templateId && !mockDetail,
  });

  const updateRecurringTemplateStatusMutation =
    useUpdateRecurringTemplateStatus();
  const deleteRecurringTemplateMutation = useDeleteRecurringTemplate();
  const runRecurringTemplateNowMutation = useRunRecurringTemplateNow();
  const previewRecurringTemplateMutation = usePreviewRecurringTemplate();

  const [confirmDialog, setConfirmDialog] = useState<
    null | 'run_now' | 'close' | 'delete'
  >(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] =
    useState<PreviewRecurringTemplateResponse | null>(null);

  const template = recurringTemplateQuery.data?.template ?? null;
  const entries = useMemo(
    () => recurringTemplateQuery.data?.entries ?? [],
    [recurringTemplateQuery.data?.entries],
  );

  const { totalDebit, totalCredit, isBalanced, diffAmount } = useMemo(() => {
    const totals = entries.reduce(
      (acc, entry) => {
        if (entry.side === 'debit') acc.debit += entry.amount ?? 0;
        if (entry.side === 'credit') acc.credit += entry.amount ?? 0;
        return acc;
      },
      { debit: 0, credit: 0 },
    );
    const diff = Math.abs(totals.debit - totals.credit);
    return {
      totalDebit: totals.debit,
      totalCredit: totals.credit,
      isBalanced: totals.debit === totals.credit,
      diffAmount: diff,
    };
  }, [entries]);

  const {
    previewTotalDebit,
    previewTotalCredit,
    previewIsBalanced,
    previewDiffAmount,
  } = useMemo(() => {
    const rendered = preview?.rendered?.entries ?? [];
    const totals = rendered.reduce(
      (acc, entry) => {
        if (entry.side === 'debit') acc.debit += entry.amount ?? 0;
        if (entry.side === 'credit') acc.credit += entry.amount ?? 0;
        return acc;
      },
      { debit: 0, credit: 0 },
    );
    const diff = Math.abs(totals.debit - totals.credit);
    return {
      previewTotalDebit: totals.debit,
      previewTotalCredit: totals.credit,
      previewIsBalanced: totals.debit === totals.credit,
      previewDiffAmount: diff,
    };
  }, [preview]);

  const handleTemplateStatusChange = useCallback(
    async (status: 'draft' | 'active' | 'paused' | 'closed') => {
      if (!templateId || mockDetail) return;
      try {
        const res = await updateRecurringTemplateStatusMutation.mutateAsync({
          companyId,
          templateId,
          status,
        });
        if (res.success) {
          const msg =
            status === 'active'
              ? 'Template active. It will generate journals on schedule.'
              : status === 'paused'
                ? 'Template paused. It will not generate journals until resumed.'
                : status === 'closed'
                  ? 'Template closed. It will no longer generate journals.'
                  : 'Template moved to draft.';
          toast.success(msg);
          await recurringTemplateQuery.refetch();
          return;
        }
        toast.error(res.message ?? 'Unable to update template status');
      } catch (error) {
        logError('Update template status failed', error);
        toast.error(getErrorMessage(error, 'Unable to update template status'));
      }
    },
    [
      companyId,
      templateId,
      mockDetail,
      updateRecurringTemplateStatusMutation,
      recurringTemplateQuery,
    ],
  );

  const handleTemplateRunNow = useCallback(async () => {
    if (!templateId || mockDetail) return;
    try {
      const res = await runRecurringTemplateNowMutation.mutateAsync({
        companyId,
        templateId,
      });
      if (res.success) {
        toast.success('Generated next journal from template');
        await recurringTemplateQuery.refetch();
        return;
      }
      toast.error(res.message ?? 'Unable to run template');
    } catch (error) {
      logError('Run template now failed', error);
      toast.error(getErrorMessage(error, 'Unable to run template'));
    }
  }, [
    companyId,
    templateId,
    mockDetail,
    runRecurringTemplateNowMutation,
    recurringTemplateQuery,
  ]);

  const handleTemplateDelete = useCallback(async () => {
    if (!templateId || mockDetail) return;
    try {
      const res = await deleteRecurringTemplateMutation.mutateAsync({
        companyId,
        templateId,
      });
      if (res.success) {
        toast.success('Template deleted.');
        onBack?.();
        return;
      }
      toast.error(res.message ?? 'Unable to delete template');
    } catch (error) {
      logError('Delete template failed', error);
      toast.error(getErrorMessage(error, 'Unable to delete template'));
    }
  }, [
    companyId,
    templateId,
    mockDetail,
    deleteRecurringTemplateMutation,
    onBack,
  ]);

  const handleTemplatePreview = useCallback(async () => {
    if (mockDetail || !template) return;
    try {
      const res = await previewRecurringTemplateMutation.mutateAsync({
        companyId,
        startDateYMD:
          template.startDateYMD ??
          template.nextRunDateYMD ??
          new Date().toISOString().slice(0, 10),
        frequency: template.frequency ?? 'monthly',
        title: template.title ?? null,
        note: template.note ?? null,
        previewForYMD: template.nextRunDateYMD ?? null,
        entries: entries.map((entry: RecurringTemplateDetailEntry) => ({
          description: entry.description,
          side: entry.side,
          amount: entry.amount,
          coaId: entry.coaId,
        })),
      });
      if (res.success && res.data) {
        setPreview(res.data);
        setPreviewOpen(true);
        return;
      }
      toast.error(res.message ?? 'Unable to preview template');
    } catch (error) {
      logError('Preview template failed', error);
      toast.error(getErrorMessage(error, 'Unable to preview template'));
    }
  }, [
    companyId,
    mockDetail,
    template,
    entries,
    previewRecurringTemplateMutation,
  ]);

  if (recurringTemplateQuery.isLoading) {
    return <CenteredLoader />;
  }

  if (recurringTemplateQuery.isError) {
    return <ErrorPage showHeader={false} type="default" />;
  }

  if (!template) {
    return (
      <EmptyState
        title="Recurring journal not found."
        description="Something went wrong, please try again or select another recurring journal."
      />
    );
  }

  const templateActionHandlers: Record<TemplateAction, () => void> = {
    edit: () => {
      toast.error('Editing recurring templates is not available yet.');
    },
    activate: () => {
      if (updateRecurringTemplateStatusMutation.isPending) return;
      void handleTemplateStatusChange('active');
    },
    delete: () => {
      if (deleteRecurringTemplateMutation.isPending) return;
      setConfirmDialog('delete');
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
      setConfirmDialog('close');
    },
    run_now: () => {
      if (template.status !== 'active') return;
      if (runRecurringTemplateNowMutation.isPending) return;
      setConfirmDialog('run_now');
    },
    copy: () => {},
  };

  const templateBaseActions = getAllowedActionsForTemplate(template);
  const templateHeaderActions: JournalDetailHeaderAction[] = [
    ...templateBaseActions.map((action) => ({
      key: action.key,
      label: action.action === 'run_now' ? 'Generate next' : action.label,
      icon: action.icon,
      className: action.className,
      disabled:
        updateRecurringTemplateStatusMutation.isPending ||
        deleteRecurringTemplateMutation.isPending ||
        (action.action === 'run_now'
          ? template.status !== 'active' ||
            runRecurringTemplateNowMutation.isPending
          : false),
      onClick: templateActionHandlers[action.action],
    })),
    {
      key: 'preview',
      label: 'Preview',
      icon: Eye,
      disabled:
        updateRecurringTemplateStatusMutation.isPending ||
        previewRecurringTemplateMutation.isPending,
      onClick: () => {
        if (updateRecurringTemplateStatusMutation.isPending) return;
        if (previewRecurringTemplateMutation.isPending) return;
        void handleTemplatePreview();
      },
    },
  ];

  const currencyCode = template.currencyCode ?? reportingCurrencyCode;
  const previewCurrency = currencyCode;

  return (
    <div className="flex h-full flex-1 flex-col overflow-auto">
      <JournalDetailHeader
        systemReference={null}
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

      <AlertDialog
        open={confirmDialog === 'run_now'}
        onOpenChange={(open) => setConfirmDialog(open ? 'run_now' : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate the next journal now?</AlertDialogTitle>
            <AlertDialogDescription>
              This will generate the next occurrence immediately and advance the
              schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDialog(null);
                void handleTemplateRunNow();
              }}
            >
              Generate next
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDialog === 'close'}
        onOpenChange={(open) => setConfirmDialog(open ? 'close' : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this template?</AlertDialogTitle>
            <AlertDialogDescription>
              Closing stops future generation and marks this template as ended.
              You can still copy it to create a new template later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDialog(null);
                void handleTemplateStatusChange('closed');
              }}
            >
              Close template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDialog === 'delete'}
        onOpenChange={(open) => setConfirmDialog(open ? 'delete' : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft template?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes discarded setup from the recurring journal list.
              Templates that have generated journals cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDialog(null);
                void handleTemplateDelete();
              }}
            >
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>
              {preview?.runDateYMD
                ? `Generated for ${formatDateDisplay(preview.runDateYMD)}`
                : 'This is what the next generated journal will look like.'}
            </DialogDescription>
          </DialogHeader>

          {preview ? (
            <div className="flex max-h-[85vh] flex-col gap-4 overflow-auto">
              <div className="rounded-md border p-4">
                <div className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                  Title
                </div>
                <div className="mt-1 text-sm">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="truncate">
                        {preview.rendered.title ?? '--'}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>
                      {preview.rendered.title ?? '--'}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-muted-foreground mt-4 text-[11px] font-medium tracking-wider uppercase">
                  Note
                </div>
                <div className="mt-1 text-sm whitespace-pre-wrap">
                  {preview.rendered.note ?? '--'}
                </div>
              </div>

              <div className="bg-card overflow-hidden rounded-lg border">
                {/* Keep header + rows aligned by sharing the same horizontal scroll container. */}
                <div className="overflow-x-auto">
                  <div className="min-w-[640px] md:min-w-[760px] lg:min-w-[820px]">
                    {/* Fixed-ish widths on larger screens for scanability; truncate+tooltip for overflow. */}
                    <div className="text-muted-foreground grid grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_80px_110px] gap-2 border-b px-3 py-2 text-[11px] font-medium tracking-wider uppercase md:grid-cols-[240px_320px_80px_120px] lg:grid-cols-[260px_360px_80px_120px]">
                      <span>Account</span>
                      <span>Description</span>
                      <span>Side</span>
                      <span className="text-right">Amount</span>
                    </div>
                    <div className="flex flex-col">
                      {preview.rendered.entries.map((entry, idx) => {
                        const meta = entries.find(
                          (e) => e.coaId === entry.coaId,
                        );
                        const accountLabel = meta
                          ? `${meta.coaCode ? `${meta.coaCode} · ` : ''}${meta.coaName ?? ''}`.trim()
                          : entry.coaId;
                        return (
                          <div
                            // preview entries have no stable id; index is ok here
                            key={`${entry.coaId}-${idx}`}
                            className="border-border/50 grid grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_80px_110px] items-center gap-2 border-b px-3 py-1.5 last:border-0 md:grid-cols-[240px_320px_80px_120px] lg:grid-cols-[260px_360px_80px_120px]"
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate text-sm">
                                  {accountLabel || '--'}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" sideOffset={6}>
                                {accountLabel || '--'}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-muted-foreground truncate text-sm">
                                  {entry.description || '--'}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" sideOffset={6}>
                                {entry.description || '--'}
                              </TooltipContent>
                            </Tooltip>
                            <span className="text-muted-foreground text-[11px] uppercase">
                              {entry.side === 'debit' ? 'Dr' : 'Cr'}
                            </span>
                            <span className="text-right font-mono text-sm">
                              <FormattedAmount
                                amount={entry.amount}
                                currency={previewCurrency}
                                showSymbol
                              />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="bg-muted/25 border-border flex items-center justify-end gap-4 border-t px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    Dr{' '}
                    <span className="text-foreground font-mono font-medium tabular-nums">
                      <FormattedAmount
                        amount={previewTotalDebit}
                        currency={previewCurrency}
                        showSymbol
                      />
                    </span>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Cr{' '}
                    <span className="text-foreground font-mono font-medium tabular-nums">
                      <FormattedAmount
                        amount={previewTotalCredit}
                        currency={previewCurrency}
                        showSymbol
                      />
                    </span>
                  </span>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      previewTotalDebit === 0 && previewTotalCredit === 0
                        ? 'bg-muted/50 text-muted-foreground'
                        : previewIsBalanced
                          ? 'bg-success/10 text-success'
                          : 'bg-destructive/10 text-destructive'
                    }`}
                  >
                    {previewTotalDebit === 0 && previewTotalCredit === 0
                      ? 'Empty'
                      : previewIsBalanced
                        ? '✓ Balanced'
                        : `Diff ${previewDiffAmount.toFixed(2)}`}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">
              No preview data.
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-foreground text-lg leading-tight font-semibold text-balance">
            {template.title || template.description || 'Recurring template'}
          </h2>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span>Next run: {formatDateDisplay(template.nextRunDateYMD)}</span>
          </div>
        </div>

        {isMobile ? (
          <div className="mt-2 flex flex-col gap-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="bg-card border-border flex flex-col gap-2 rounded-xl border p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {entry.coaCode ? (
                      <div className="text-muted-foreground font-mono text-[11px]">
                        {entry.coaCode}
                      </div>
                    ) : null}
                    <div className="text-foreground truncate text-sm font-medium">
                      {entry.coaName || entry.coaId}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                      {entry.side === 'debit' ? 'Dr' : 'Cr'}
                    </div>
                    <div className="text-foreground font-mono text-base font-semibold tabular-nums">
                      <FormattedAmount
                        amount={entry.amount}
                        currency={currencyCode}
                        showSymbol
                      />
                    </div>
                  </div>
                </div>

                {entry.description ? (
                  <div className="text-muted-foreground text-sm leading-snug">
                    {entry.description}
                  </div>
                ) : null}
              </div>
            ))}
            <div className="bg-card border-border flex items-center justify-between gap-3 rounded-xl border p-4 shadow-sm">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground text-xs">
                  Dr{' '}
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    <FormattedAmount
                      amount={totalDebit}
                      currency={currencyCode}
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
                      currency={currencyCode}
                      showSymbol
                    />
                  </span>
                </span>
              </div>
              <span
                className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
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
                    : `Diff ${diffAmount.toFixed(2)}`}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-card overflow-hidden rounded-lg border">
            <div className="text-muted-foreground grid grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_90px_110px] gap-2 border-b px-3 py-2 text-[11px] font-medium tracking-wider uppercase">
              <span>Account</span>
              <span>Description</span>
              <span>Side</span>
              <span className="text-right">Amount</span>
            </div>
            <div className="flex flex-col">
              {entries.map((entry) => (
                <div
                  key={entry.id}
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
                      currency={currencyCode}
                      showSymbol
                    />
                  </span>
                </div>
              ))}
            </div>
            <div className="bg-muted/25 border-border flex items-center justify-end gap-4 border-t px-3 py-2.5">
              <span className="text-muted-foreground text-xs">
                Dr{' '}
                <span className="text-foreground font-mono font-medium tabular-nums">
                  <FormattedAmount
                    amount={totalDebit}
                    currency={currencyCode}
                    showSymbol
                  />
                </span>
              </span>
              <span className="text-muted-foreground text-xs">
                Cr{' '}
                <span className="text-foreground font-mono font-medium tabular-nums">
                  <FormattedAmount
                    amount={totalCredit}
                    currency={currencyCode}
                    showSymbol
                  />
                </span>
              </span>
              <span
                className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
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
                    : `Diff ${diffAmount.toFixed(2)}`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
