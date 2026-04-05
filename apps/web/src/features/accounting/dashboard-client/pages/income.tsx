import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  useIncomeStatement,
  useStatementLineDetails,
  useStatementLineTransactions,
} from '@/modules/accounting/reporting';
import { isAccountingRole } from '@/modules/auth/session/model/role-guards';
import { useIsMobile, useMediaQuery } from '@/shared/hooks/use-media-query';
import { useSession } from '@session';

import { DemoDataBadge } from '../components/demo-data-badge';
import { ReportToolbar } from '../components/report-toolbar';
import { CARD_HEADER_CLASS } from '../constants';
import {
  formatCompareLabel,
  formatPeriodLabel,
  getStatementColumnLabels,
  reportPeriodToApiPeriod,
} from '../report-period';
import { getIncomeStatementNomenclature } from '../statement-nomenclature';
import {
  DERIVED_STATEMENT_LINE_IDS,
  findLineById,
  SECTION_LABELS,
} from './income-statement-data';
import { getLineVarianceIntent } from './income-statement-format';
import { DetailsPanel } from './income/details-panel';
import { computeIncomeKpis } from './income/income-kpis';
import { InsightsPanel } from './income/Insights-panel';
import { KpiStrip } from './income/kpi-strip';
import { NotesPanel } from './income/notes-panel';
import { StatementRow } from './income/statement-row';
import { StatementTable } from './income/statement-table';
import { PanelEmptyState } from './shared/panel-empty-state';
import { StatementTableSkeleton } from './shared/StatementTableSkeleton';

import type { PeriodBounds } from '../period-utils';
import type { ReportPeriod } from '../report-period';
import type { StatementLine } from './income-statement-data';

const INCOME_SECTION_END_LINE_IDS = new Set([
  'gross_profit',
  'operating_result',
]);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardIncomeTab({
  period,
  bounds,
  onPeriodChange,
}: {
  period: ReportPeriod;
  bounds: PeriodBounds;
  onPeriodChange: (rp: ReportPeriod) => void;
}) {
  const { company, user } = useSession();
  const isMobile = useIsMobile();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const asOf = useMemo(() => new Date(), []);
  const showDemoBadge = company?.isDemoCompany === true;
  const currencyCode = company?.reportingCurrencyCode ?? 'USD';
  const insightsCurrencyCode = company?.reportingCurrencyCode;
  const reportingFramework = company?.reportingFramework ?? null;
  const labels = useMemo(
    () => getIncomeStatementNomenclature(reportingFramework),
    [reportingFramework],
  );

  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(
    null,
  );
  const [railTab, setRailTab] = useState<'insights' | 'details' | 'notes'>(
    'insights',
  );
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const apiPeriod = useMemo(
    () => reportPeriodToApiPeriod(period, asOf),
    [period, asOf],
  );

  const {
    data: incomeData,
    isLoading: isStatementLoading,
    isError: isStatementError,
    error: statementError,
  } = useIncomeStatement({
    companyId: company?.id ?? '',
    period: apiPeriod,
    framework: reportingFramework === 'us_gaap' ? 'us_gaap' : ('ifrs' as const),
  });

  const statementLines = incomeData?.lines ?? [];
  const visibleLines = useMemo(() => statementLines, [statementLines]);

  const parentLines = useMemo(
    () => statementLines.filter((line) => line.children?.length),
    [statementLines],
  );

  const allExpanded = useMemo(
    () =>
      parentLines.length > 0 &&
      parentLines.every((line) => expandedRows[line.id]),
    [parentLines, expandedRows],
  );

  const visibleIds = useMemo(
    () =>
      new Set([
        ...visibleLines.map((line) => line.id),
        ...visibleLines.flatMap((line) =>
          expandedRows[line.id] ? (line.children?.map((c) => c.id) ?? []) : [],
        ),
      ]),
    [expandedRows, visibleLines],
  );

  useEffect(() => {
    if (selectedLineId !== null && !visibleIds.has(selectedLineId)) {
      setSelectedLineId(null);
    }
  }, [selectedLineId, visibleIds]);

  useEffect(() => {
    setExpandedAccountId(null);
  }, [selectedLineId]);

  const selected = useMemo(
    () =>
      selectedLineId !== null
        ? findLineById(statementLines, selectedLineId)
        : null,
    [selectedLineId, statementLines],
  );
  const selectedLine = selected?.line ?? null;
  const selectedLineParent = selected?.parent;

  const compareLabel = formatCompareLabel(period.compare);
  const showCompare = period.compare !== 'none';
  const canOpenLedgerExplorer = isAccountingRole(user?.currentCompany);
  const canEditNotes = isAccountingRole(user?.currentCompany);

  // KPIs
  const { kpis, opexRatio } = useMemo(
    () => computeIncomeKpis(statementLines, currencyCode, labels),
    [statementLines, currencyCode, labels],
  );
  const revenueAmount = useMemo(
    () => statementLines.find((l) => l.id === 'revenue')?.amount ?? 0,
    [statementLines],
  );

  const { data: lineDetailsData } = useStatementLineDetails({
    companyId: company?.id ?? '',
    statementType: 'income',
    lineId: selectedLineId ?? '',
    period: apiPeriod,
  });

  const coaAccounts = useMemo(() => {
    if (!selectedLine) return [];
    if (
      selectedLine.children?.length ||
      DERIVED_STATEMENT_LINE_IDS.has(selectedLine.id)
    ) {
      return [];
    }
    return lineDetailsData?.accounts ?? [];
  }, [selectedLine, lineDetailsData?.accounts]);

  const detailAccounts = useMemo(() => {
    if (!selectedLine) return [];
    if (coaAccounts.length > 0) return coaAccounts;
    if (selectedLine.children?.length) return selectedLine.children;
    if (selectedLineParent?.children?.length)
      return selectedLineParent.children;
    return [selectedLine];
  }, [selectedLine, selectedLineParent, coaAccounts]);

  const isCoaBreakdownView =
    !!selectedLine &&
    !selectedLine.children?.length &&
    !DERIVED_STATEMENT_LINE_IDS.has(selectedLine.id) &&
    coaAccounts.length > 0;

  const {
    data: accountTxnsData,
    hasNextPage: hasMoreTransactions,
    fetchNextPage: loadMoreTransactions,
    isFetchingNextPage: isLoadingMoreTransactions,
  } = useStatementLineTransactions({
    companyId: company?.id ?? '',
    statementType: 'income',
    lineId: selectedLineId ?? '',
    accountId: expandedAccountId ?? '',
    period: apiPeriod,
  });

  const detailTransactions = useMemo(() => {
    if (!selectedLine || !isCoaBreakdownView || !expandedAccountId) return [];
    const pages = accountTxnsData?.pages ?? [];
    return pages.flatMap((page) => page.transactions);
  }, [
    selectedLine,
    isCoaBreakdownView,
    expandedAccountId,
    accountTxnsData?.pages,
  ]);

  // Notes
  const notesMap = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<typeof incomeData>['notes'][number]
    >();
    for (const note of incomeData?.notes ?? []) {
      map.set(note.lineId, note);
    }
    return map;
  }, [incomeData?.notes]);
  const selectedNote = selectedLineId
    ? (notesMap.get(selectedLineId) ?? null)
    : null;
  const periodLabel = formatPeriodLabel(period);
  const statementColumnLabels = useMemo(
    () => getStatementColumnLabels(period, asOf),
    [period, asOf],
  );

  // Callbacks for StatementRow
  const handleSelectLine = useCallback(
    (lineId: string, tab: 'details' | 'notes') => {
      setSelectedLineId(lineId);
      setRailTab(tab);
      if (!isDesktop) {
        setMobileSheetOpen(true);
      }
    },
    [isDesktop],
  );

  const handleToggleAccountExpand = useCallback((accountId: string | null) => {
    setExpandedAccountId(accountId);
  }, []);

  const handleToggleExpand = useCallback((lineId: string) => {
    setExpandedRows((current) => ({
      ...current,
      [lineId]: !current[lineId],
    }));
  }, []);

  const handleToggleExpandAll = useCallback(() => {
    if (allExpanded) {
      setExpandedRows({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const line of parentLines) {
      next[line.id] = true;
    }
    setExpandedRows(next);
  }, [allExpanded, parentLines]);

  // Row renderer (thin wrapper around StatementRow)
  const renderRow = (line: StatementLine, depth = 0) => (
    <StatementRow
      key={line.id}
      line={line}
      depth={depth}
      selectedLineId={selectedLineId}
      expandedRows={expandedRows}
      showCompare={showCompare}
      isMobile={isMobile}
      isDesktop={isDesktop}
      notesMap={notesMap}
      currencyCode={currencyCode}
      revenueAmount={revenueAmount}
      getLineVarianceIntent={getLineVarianceIntent}
      canOpenLedgerExplorer={canOpenLedgerExplorer}
      onSelectLine={handleSelectLine}
      onToggleExpand={handleToggleExpand}
    />
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row lg:items-stretch">
      {/* Left: statement canvas */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <ReportToolbar
          period={period}
          bounds={bounds}
          onPeriodChange={onPeriodChange}
          asOf={asOf}
        />

        {/* Statement card */}
        <div className="bg-background border-border/50 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
          {/* Card header */}
          <div className={cn(CARD_HEADER_CLASS, 'justify-between gap-2')}>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="min-w-0 truncate font-semibold">
                {labels.statementTitle}
              </span>
              {showDemoBadge && <DemoDataBadge />}
            </div>
            <div className="flex items-center gap-1">
              {!isDesktop && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setRailTab('insights');
                    setMobileSheetOpen(true);
                  }}
                >
                  Insights
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={handleToggleExpandAll}
              >
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </Button>
            </div>
          </div>

          {!isMobile && <KpiStrip kpis={kpis} />}

          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('[data-statement-row]')) {
                setSelectedLineId(null);
                setRailTab('insights');
              }
            }}
          >
            {isStatementLoading ? (
              <StatementTableSkeleton
                showCompare={showCompare}
                isMobile={isMobile}
                showTrailingPercentColumn={true}
              />
            ) : isStatementError ? (
              <PanelEmptyState
                message={
                  statementError instanceof Error
                    ? statementError.message
                    : 'Unable to load statement. Please try again.'
                }
              />
            ) : visibleLines.length === 0 ? (
              <PanelEmptyState message="No data for this period." />
            ) : (
              <StatementTable
                visibleLines={visibleLines}
                sectionLabels={SECTION_LABELS}
                renderRow={renderRow}
                showCompare={showCompare}
                currentColumnLabel={statementColumnLabels.currentLabel}
                compareColumnLabel={statementColumnLabels.compareLabel}
                ariaLabel={labels.statementTitle}
                isMobile={isMobile}
                sectionEndLineIds={INCOME_SECTION_END_LINE_IDS}
                showTrailingPercentColumn={true}
              />
            )}
          </div>
        </div>
      </div>

      {/* Right: context rail — desktop only */}
      {isDesktop && (
        <div className="flex min-w-0 flex-col gap-3 lg:w-[330px] lg:shrink-0 xl:w-[390px]">
          <div className="bg-background border-border/50 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
            <div className={cn(CARD_HEADER_CLASS, 'justify-between gap-3')}>
              <span className="text-sm font-semibold">Context</span>
              <div className="bg-background inline-flex rounded-md border p-0.5">
                {(['insights', 'details', 'notes'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setRailTab(tab)}
                    className={cn(
                      'rounded px-2 py-1 text-xs font-medium capitalize transition-colors',
                      railTab === tab
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {railTab === 'insights' ? (
              <InsightsPanel
                opexRatio={opexRatio}
                periodLabel={periodLabel}
                currencyCode={insightsCurrencyCode}
                storageKey={`ab:dash:income:insights:hidden:${company?.id ?? 'unknown'}`}
                period={period}
                statementLines={statementLines}
              />
            ) : railTab === 'details' ? (
              <DetailsPanel
                selectedLine={selectedLine}
                selectedLineParent={selectedLineParent ?? undefined}
                showCompare={showCompare}
                currentLabel={statementColumnLabels.currentLabel}
                compareLabel={
                  statementColumnLabels.compareLabel ?? compareLabel
                }
                detailAccounts={detailAccounts}
                detailTransactions={detailTransactions}
                isCoaBreakdownView={isCoaBreakdownView}
                expandedAccountId={expandedAccountId}
                onToggleAccountExpand={handleToggleAccountExpand}
                hasMoreTransactions={hasMoreTransactions}
                onLoadMoreTransactions={loadMoreTransactions}
                isLoadingMoreTransactions={isLoadingMoreTransactions}
                currencyCode={currencyCode}
                canOpenLedgerExplorer={canOpenLedgerExplorer}
                derivedLineIds={DERIVED_STATEMENT_LINE_IDS}
                getLineVarianceIntent={getLineVarianceIntent}
              />
            ) : (
              <NotesPanel
                selectedLine={selectedLine}
                note={selectedNote}
                canEdit={canEditNotes}
                periodLabel={periodLabel}
              />
            )}
          </div>
        </div>
      )}

      {/* Mobile/Tablet: sheet for insights/details/notes */}
      {!isDesktop && (
        <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
          <SheetContent
            side={isMobile ? 'bottom' : 'right'}
            className={cn(
              'overflow-y-auto px-0 pb-6',
              isMobile ? 'max-h-[70vh]' : 'w-full sm:max-w-md md:max-w-md',
            )}
          >
            <SheetHeader className="px-4 pb-2">
              <SheetTitle className="text-sm">
                {railTab === 'insights'
                  ? 'Insights'
                  : railTab === 'notes'
                    ? selectedLine?.label
                      ? `Notes — ${selectedLine.label}`
                      : 'Notes'
                    : (selectedLine?.label ?? 'Details')}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {railTab === 'insights'
                  ? 'Proactive observations and net income trend.'
                  : railTab === 'notes'
                    ? 'View and edit notes for this line.'
                    : 'Account breakdown and transactions for this line.'}
              </SheetDescription>
            </SheetHeader>
            {railTab === 'insights' ? (
              <InsightsPanel
                opexRatio={opexRatio}
                periodLabel={periodLabel}
                currencyCode={insightsCurrencyCode}
                storageKey={`ab:dash:income:insights:hidden:${company?.id ?? 'unknown'}`}
                period={period}
                statementLines={statementLines}
              />
            ) : railTab === 'details' ? (
              <DetailsPanel
                selectedLine={selectedLine}
                selectedLineParent={selectedLineParent ?? undefined}
                showCompare={showCompare}
                currentLabel={statementColumnLabels.currentLabel}
                compareLabel={
                  statementColumnLabels.compareLabel ?? compareLabel
                }
                detailAccounts={detailAccounts}
                detailTransactions={detailTransactions}
                isCoaBreakdownView={isCoaBreakdownView}
                expandedAccountId={expandedAccountId}
                onToggleAccountExpand={handleToggleAccountExpand}
                currencyCode={currencyCode}
                canOpenLedgerExplorer={canOpenLedgerExplorer}
                derivedLineIds={DERIVED_STATEMENT_LINE_IDS}
                getLineVarianceIntent={getLineVarianceIntent}
              />
            ) : (
              <NotesPanel
                selectedLine={selectedLine}
                note={selectedNote}
                canEdit={canEditNotes}
                periodLabel={periodLabel}
              />
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
