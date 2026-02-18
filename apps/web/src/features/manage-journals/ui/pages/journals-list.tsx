import type { JournalListRow } from '@accountable-books/contracts/schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useJournalsInfinite } from '@/modules/accounting/journals';
import { useRegisterAiDomain } from '@/modules/ai';
import { useIsMobile } from '@/shared/hooks/use-media-query';
import { useSession } from '@session';

import { journalsAiRegistration } from '../../ai/registration';
import { JournalDetailPane } from '../components/journal-detail-pane';
import { JournalVirtualList } from '../components/journal-virtual-list';
import { JournalsListToolbar } from '../components/journals-list-toolbar';
import {
  isGeneratedJournal,
  isRecurringTemplateJournal,
} from '../lib/journal-ui';

import type {
  JournalListAdvancedStatus,
  JournalListStatusFilter,
} from '../components/journals-list-toolbar';

type JournalServerStatus = 'draft' | 'posted' | 'voided';
type JournalServerKind = 'journal' | 'recurring_template';
type JournalServerSource = 'one_off' | 'generated_from_template';
type JournalSelection = { id: string; kind: JournalListRow['kind'] };

const rowKey = (row: JournalSelection) => `${row.kind}:${row.id}`;

export function JournalsListPage() {
  useRegisterAiDomain(useMemo(() => journalsAiRegistration(), []));

  const { companyId, loading: sessionLoading } = useSession();
  const isMobile = useIsMobile();

  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const [status, setStatus] = useState<JournalListStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [defaultDateFrom, setDefaultDateFrom] = useState<string>('');
  const [defaultDateTo, setDefaultDateTo] = useState<string>('');
  const [advancedStatusFilters, setAdvancedStatusFilters] = useState<
    Set<JournalListAdvancedStatus>
  >(new Set());
  const [hideGenerated, setHideGenerated] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const hasHydratedDateRangeRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedJournalStatuses = useMemo<
    JournalServerStatus[] | undefined
  >(() => {
    const next = new Set<JournalServerStatus>();
    if (status === 'draft' || status === 'posted' || status === 'voided') {
      next.add(status);
    }
    for (const value of advancedStatusFilters) {
      if (value === 'draft' || value === 'posted' || value === 'voided') {
        next.add(value);
      }
    }
    return next.size > 0 ? Array.from(next) : undefined;
  }, [advancedStatusFilters, status]);

  const hasRecurringFilter = useMemo(
    () => status === 'recurring' || advancedStatusFilters.has('recurring'),
    [advancedStatusFilters, status],
  );

  const hasMixedRecurringAndStatuses =
    hasRecurringFilter && (selectedJournalStatuses?.length ?? 0) > 0;

  const serverKinds = useMemo<JournalServerKind[] | undefined>(() => {
    if (hasMixedRecurringAndStatuses) return undefined;
    if (hasRecurringFilter) return ['recurring_template'];
    return undefined;
  }, [hasMixedRecurringAndStatuses, hasRecurringFilter]);

  const serverJournalStatuses = useMemo<
    JournalServerStatus[] | undefined
  >(() => {
    if (hasMixedRecurringAndStatuses || hasRecurringFilter) return undefined;
    return selectedJournalStatuses;
  }, [
    hasMixedRecurringAndStatuses,
    hasRecurringFilter,
    selectedJournalStatuses,
  ]);

  const serverJournalSources = useMemo<
    JournalServerSource[] | undefined
  >(() => {
    if (hideGenerated && !hasRecurringFilter) return ['one_off'];
    return undefined;
  }, [hasRecurringFilter, hideGenerated]);

  const clientKindConstraint = useMemo<JournalServerKind[] | undefined>(() => {
    const hasRecurring =
      status === 'recurring' || advancedStatusFilters.has('recurring');
    if (hasRecurring) {
      return ['recurring_template'];
    }
    return undefined;
  }, [advancedStatusFilters, status]);

  const query = useJournalsInfinite({
    companyId: companyId ?? '',
    limit: 50,
    journalStatuses: serverJournalStatuses,
    kinds: serverKinds,
    journalSources: serverJournalSources,
    searchQuery: searchQuery.trim() || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    includeDeleted: true,
    enabled: !!companyId,
  });

  const rawJournals = useMemo(() => {
    const pages = query.data?.pages ?? [];
    return pages.flatMap((page) => page.rows);
  }, [query.data?.pages]);

  const statusCounts = useMemo(() => {
    const facets = query.data?.pages?.[0]?.facets;
    if (!facets) {
      return {
        all: 0,
        draft: 0,
        posted: 0,
        voided: 0,
        recurring: 0,
      };
    }

    return {
      all: facets.allCount,
      draft: facets.journalStatusCounts.draft,
      posted: facets.journalStatusCounts.posted,
      voided: facets.journalStatusCounts.voided,
      recurring: facets.kindCounts.recurringTemplates,
    };
  }, [query.data?.pages]);

  useEffect(() => {
    const appliedFilters = query.data?.pages?.[0]?.appliedFilters;
    if (!appliedFilters || hasHydratedDateRangeRef.current) return;

    const backendDateFrom = appliedFilters.dateFrom ?? '';
    const backendDateTo = appliedFilters.dateTo ?? '';
    if (!backendDateFrom && !backendDateTo) return;

    setDefaultDateFrom(backendDateFrom);
    setDefaultDateTo(backendDateTo);

    // Hydrate from backend defaults once so UI reflects server-applied range.
    if (!dateFrom && !dateTo) {
      setDateFrom(backendDateFrom);
      setDateTo(backendDateTo);
    }

    hasHydratedDateRangeRef.current = true;
  }, [dateFrom, dateTo, query.data?.pages]);

  // Shared handler for creating a new journal
  const handleCreateJournal = useCallback(() => {
    setSelectedRowKey(null);
    setIsCreatingNew(true);
    if (isMobile) setMobileShowDetail(true);
  }, [isMobile]);

  // Cmd+N → Create New Journal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleCreateJournal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCreateJournal]);

  const journals = useMemo(() => {
    let result = rawJournals;

    switch (status) {
      case 'draft':
      case 'posted':
      case 'voided':
        result = result.filter(
          (journal) => journal.kind === 'journal' && journal.status === status,
        );
        break;
      case 'recurring':
        result = result.filter(isRecurringTemplateJournal);
        break;
      default:
        break;
    }

    if (advancedStatusFilters.size > 0) {
      result = result.filter((journal) => {
        if (
          advancedStatusFilters.has('recurring') &&
          isRecurringTemplateJournal(journal)
        ) {
          return true;
        }
        return (
          journal.kind === 'journal' &&
          advancedStatusFilters.has(journal.status)
        );
      });
    }

    if (hideGenerated) {
      result = result.filter((journal) => !isGeneratedJournal(journal));
    }

    return result;
  }, [advancedStatusFilters, hideGenerated, rawJournals, status]);

  const rowsByKey = useMemo(
    () =>
      new Map<string, JournalListRow>(
        journals.map((journal) => [rowKey(journal), journal]),
      ),
    [journals],
  );
  const selectedRow = useMemo(
    () => (selectedRowKey ? (rowsByKey.get(selectedRowKey) ?? null) : null),
    [rowsByKey, selectedRowKey],
  );
  const selectedJournalDetailId =
    selectedRow?.kind === 'journal' ? selectedRow.id : null;
  const selectedJournalIsFx =
    selectedRow?.kind === 'journal' ? selectedRow.isFx : false;
  const selectedTemplateDetailId =
    selectedRow?.kind === 'recurring_template' ? selectedRow.id : null;

  useEffect(() => {
    if (journals.length === 0) {
      setSelectedRowKey(null);
      setIsCreatingNew(false);
      if (isMobile) setMobileShowDetail(false);
      return;
    }
    if (!selectedRowKey) {
      return; // No selection: user may be in "create new" mode; don't clear isCreatingNew
    }
    if (rowsByKey.has(selectedRowKey)) {
      return;
    }
    // Selection was set but is no longer in the list — clear it and leave create-new alone
    setSelectedRowKey(null);
    setIsCreatingNew(false);
    if (isMobile) setMobileShowDetail(false);
  }, [isMobile, journals.length, rowsByKey, selectedRowKey]);

  const resetFilters = () => {
    setStatus('all');
    setSearchQuery('');
    setDateFrom(defaultDateFrom);
    setDateTo(defaultDateTo);
    setAdvancedStatusFilters(new Set());
    setHideGenerated(false);
  };

  const clearAdvancedFilters = () => {
    setStatus('all');
    setAdvancedStatusFilters(new Set());
    setDateFrom(defaultDateFrom);
    setDateTo(defaultDateTo);
    setHideGenerated(false);
  };

  const isLoading = sessionLoading || query.isLoading;

  if (isLoading) return <CenteredLoader />;
  if (!companyId) return <ErrorPage type="default" showHeader={false} />;
  if (query.isError) return <ErrorPage type="default" showHeader={false} />;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-450 flex-col gap-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 sm:p-4 md:flex-row">
        <aside
          className={cn(
            'flex min-h-0 w-full min-w-0 flex-col gap-4 p-4 sm:p-0 md:w-80 md:shrink-0 lg:w-100',
            mobileShowDetail && 'hidden md:flex',
          )}
        >
          <JournalsListToolbar
            status={status}
            searchQuery={searchQuery}
            dateFrom={dateFrom}
            dateTo={dateTo}
            defaultDateFrom={defaultDateFrom}
            defaultDateTo={defaultDateTo}
            onStatusChange={(nextStatus) => {
              setStatus(nextStatus);
              if (nextStatus === 'all') {
                setAdvancedStatusFilters(new Set());
                return;
              }
              setAdvancedStatusFilters(new Set([nextStatus]));
            }}
            onSearchQueryChange={setSearchQuery}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onResetFilters={resetFilters}
            advancedStatusFilters={advancedStatusFilters}
            hideGenerated={hideGenerated}
            onAdvancedStatusToggle={(value) => {
              setAdvancedStatusFilters((currentFilters) => {
                const nextFilters = new Set(currentFilters);
                if (nextFilters.has(value)) {
                  nextFilters.delete(value);
                } else {
                  nextFilters.add(value);
                }
                if (nextFilters.size === 1) {
                  setStatus(nextFilters.values().next().value ?? 'all');
                } else {
                  setStatus('all');
                }
                return nextFilters;
              });
            }}
            onHideGeneratedChange={setHideGenerated}
            onClearAdvancedFilters={clearAdvancedFilters}
            counts={statusCounts}
            onCreateJournal={handleCreateJournal}
            onImportClick={() => setImportDialogOpen(true)}
            searchInputRef={searchInputRef}
            showStatusOptions={journals.length > 0}
          />

          <div className="min-h-0 flex-1">
            {journals.length === 0 ? (
              <div className="text-muted-foreground flex h-full items-center justify-center rounded-md border p-8 text-sm">
                No journals found.
              </div>
            ) : (
              <div className="h-full overflow-hidden rounded-md border">
                <JournalVirtualList
                  journals={journals}
                  selectedJournalId={selectedRow?.id ?? null}
                  onSelect={(journal) => {
                    const nextKey = rowKey(journal);
                    setSelectedRowKey((currentKey) => {
                      const resolvedNextKey =
                        currentKey === nextKey ? null : nextKey;
                      setIsCreatingNew(false);
                      if (isMobile) {
                        setMobileShowDetail(resolvedNextKey !== null);
                      }
                      return resolvedNextKey;
                    });
                  }}
                  onReachEnd={() => {
                    return query.fetchNextPage().then(() => undefined);
                  }}
                  hasNextPage={query.hasNextPage}
                  isFetchingNextPage={
                    query.isFetchingNextPage || query.isFetching
                  }
                />
              </div>
            )}
          </div>
        </aside>

        <div
          className={cn(
            'sm:bg-muted/50 sm:dark:bg-background flex min-h-0 flex-1 flex-col overflow-hidden rounded-md sm:border',
            !mobileShowDetail && 'hidden md:flex',
          )}
        >
          <JournalDetailPane
            companyId={companyId}
            journalId={selectedJournalDetailId}
            journalIsFx={selectedJournalIsFx}
            templateId={selectedTemplateDetailId}
            isCreatingNew={isCreatingNew}
            onCreatingNewChange={setIsCreatingNew}
            onJournalSelected={(journalId) =>
              setSelectedRowKey(
                journalId ? rowKey({ kind: 'journal', id: journalId }) : null,
              )
            }
            onTemplateSelected={(templateId) => {
              setIsCreatingNew(false);
              if (isMobile) setMobileShowDetail(Boolean(templateId));
              setSelectedRowKey(
                templateId
                  ? rowKey({ kind: 'recurring_template', id: templateId })
                  : null,
              );
            }}
            onBack={() => {
              setMobileShowDetail(false);
              setIsCreatingNew(false);
              setSelectedRowKey(null);
            }}
            mockDetail={null}
          />
        </div>
      </div>
      {/* // TODO: Consider if we should do this in a dialog or just use the pane on the right. Or maybe one type on desktop and the other on mobile? */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import journals</DialogTitle>
            <DialogDescription>Coming soon...</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
