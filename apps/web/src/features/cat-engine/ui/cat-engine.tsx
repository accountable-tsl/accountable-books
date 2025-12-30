import type { DataTableInputOptions } from '@/components/data-table/types/data-table';
import type {
  CategorizationTransactionStatus,
  GroupedTransaction,
} from '@/modules/accounting/categorization';
import type { CoaResponse } from '@/modules/accounting/chart-of-accounts/model/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/app/session';
import { CenteredLoader } from '@/components/CenteredLoader';
import { DataTable } from '@/components/data-table/data-table';
import { useDataTable } from '@/components/data-table/use-data-table';
import { DateRangePicker } from '@/components/date-picker/date-range-picker';
import { SmallScreenMessage } from '@/components/SmallScreenMessage';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { cn } from '@/lib/utils';
import {
  LedgerIntentManagerV2Provider,
  useCategorizationTransactionsInfinite,
  useLedgerIntentManagerV2,
} from '@/modules/accounting/categorization';
import { useChartOfAccountsQuery } from '@/modules/accounting/chart-of-accounts';
import { useCompanyBankAccounts } from '@/modules/banking/accounts/model/hooks';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { toast } from 'sonner';

import { CatEngineAdvFilter } from './components/cat-engine-adv-filter';
import {
  CenterCatEngineToolbar,
  LeftCatEngineToolbar,
  RightCatEngineToolbar,
} from './components/cat-engine-toolbar';
import { TransactionView } from './components/transaction-view-v2';
import { getCatEngineColumns } from './config/table-columns';
import { accountElementOrder } from './constants';
import { testCategorizationTransactions } from './test-data';

import type { CatEngineMode, GroupedCoaData } from './types';

export const accordionItems = [
  {
    id: 'uncategorized',
    title: 'Uncategorized',
    textClass: 'text-gray-700 dark:text-gray-400',
    borderClass: 'border-gray-300 dark:border-gray-900',
    backgroundClass: 'bg-gray-50 dark:bg-gray-950',
  },
  {
    id: 'high-confidence',
    title: 'High Confidence',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    borderClass: 'border-emerald-300 dark:border-emerald-900',
    backgroundClass: 'bg-emerald-50 dark:bg-emerald-950',
  },
  {
    id: 'medium-confidence',
    title: 'Medium Confidence',
    textClass: 'text-amber-700 dark:text-amber-400',
    borderClass: 'border-amber-300 dark:border-amber-900/60',
    backgroundClass: 'bg-amber-50 dark:bg-amber-950',
  },
  {
    id: 'low-confidence',
    title: 'Low Confidence',
    textClass: 'text-rose-700 dark:text-rose-400',
    borderClass: 'border-rose-300 dark:border-rose-900',
    backgroundClass: 'bg-rose-50 dark:bg-rose-950',
  },
  {
    id: 'reviewed',
    title: 'Reviewed & Posted',
    textClass: 'text-sky-700 dark:text-sky-400',
    borderClass: 'border-sky-300 dark:border-sky-900',
    backgroundClass: 'bg-sky-50 dark:bg-sky-950',
  },
];

function getInitialDateRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const startMonth = day < 10 ? month - 1 : month;
  const startDate = new Date(year, startMonth, 1);
  return { from: startDate, to: now } as { from: Date; to?: Date };
}

/**
 * Map accordion item ID to status filter
 */
function getStatusFromAccordionItem(
  itemId: string,
): 'uncategorized' | 'proposed' | 'posted' | undefined {
  switch (itemId) {
    case 'uncategorized':
      return 'uncategorized';
    case 'high-confidence':
    case 'medium-confidence':
    case 'low-confidence':
      return 'proposed';
    case 'reviewed':
      return 'posted';
    default:
      return undefined;
  }
}

export function CatEngine() {
  const { companyId, company, loading: isLoadingSession } = useSession();
  const [view, setView] = useState<'table' | 'group'>('table');
  const [rowHeight, setRowHeight] = useState<'min' | 'mid' | 'max'>('mid');
  const [isFullScreen, setIsFullScreen] = useState(false);
  // Default to 'uncategorized' to show the most important transactions first
  const [openAccordionItem, setOpenAccordionItem] = useState<string>(
    'uncategorized,proposed',
  );
  const [dateRange, setDateRange] = useState<{ from: Date; to?: Date }>(
    getInitialDateRange(),
  );
  const [selectedTransactionId, setSelectedTransactionId] = useState<
    string | null
  >(null);
  // Draft transactions state for optimistic UI updates
  const [draftTransactions, setDraftTransactions] = useState<
    GroupedTransaction[]
  >([]);
  // Mode state with localStorage persistence
  const MODE_STORAGE_KEY = `cat-engine-mode-${companyId || 'default'}`;
  const USER_PREFERENCE_KEY = `cat-engine-user-preference-${companyId || 'default'}`;
  const [mode, setMode] = useState<CatEngineMode>(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(MODE_STORAGE_KEY);
      if (saved === 'review' || saved === 'autosave') {
        return saved;
      }
    }
    return 'review';
  });
  const [hasUserPreference, setHasUserPreference] = useState(() => {
    // Check if user has manually set a preference (separate from auto-switched values)
    if (typeof window !== 'undefined') {
      return localStorage.getItem(USER_PREFERENCE_KEY) === 'true';
    }
    return false;
  });

  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const [selectedBankAccountIds, setSelectedBankAccountIds] = useState<
    string[]
  >([]);
  // Status filter for table view (separate from accordion status)
  const [statusFilterForTable, setStatusFilterForTable] = useState<
    Set<CategorizationTransactionStatus>
  >(new Set());

  const manager = useLedgerIntentManagerV2();
  const getPendingTransactionsSummary = manager.getPendingTransactionsSummary;
  const hasAnyPendingChanges = manager.hasAnyPendingChanges;

  // Debounce date range changes
  const dateRangeRef = useRef(dateRange);
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    dateRangeRef.current = dateRange;
  }, [dateRange]);

  const handleDateRangeChange = useCallback(
    (range: { from: Date; to?: Date }) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(() => {
        setDateRange(range);
      }, 300);
    },
    [],
  );

  const is1024 = useMediaQuery('(min-width: 1024px)');
  const is1440 = useMediaQuery('(min-width: 1440px)');

  // Determine if we should auto-switch to autosave (1024px <= width < 1440px)
  const shouldAutoSave = is1024 && !is1440;

  const statusFilter = getStatusFromAccordionItem(openAccordionItem);

  // Fetch bank accounts for bank name/logo lookup and filtering
  const { data: bankAccountsData } = useCompanyBankAccounts(companyId ?? '');
  const bankAccounts = useMemo(
    () => bankAccountsData?.data || [],
    [bankAccountsData],
  );

  // Memoize selected bank account IDs for efficient filtering
  const selectedBankAccountIdsSet = useMemo(() => {
    if (selectedBankAccountIds.length === 0) return new Set<string>();
    return new Set(selectedBankAccountIds);
  }, [selectedBankAccountIds]);

  // Fetch categorization transactions
  const {
    data: txnData,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCategorizationTransactionsInfinite({
    companyId: companyId ?? '',
    // dateFrom: dateRange.from,
    dateFrom: new Date('2025-01-01'),
    dateTo: dateRange.to || new Date(),
    limit: 100,
  });

  const { data: coaData, isLoading: isLoadingCoa } = useChartOfAccountsQuery({
    companyId: companyId || '',
    active: true,
    includeDeleted: false,
  });

  const groupedCoaData = useMemo<GroupedCoaData[]>(() => {
    if (!coaData) return [];

    const groups = new Map<string, GroupedCoaData['items']>();

    coaData.forEach((c: CoaResponse) => {
      const key = c.accountElementKey || 'ungrouped';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({
        label: c.name,
        value: c.id,
        accountElementKey: c.accountElementKey,
        accountElementLabel: c.accountElementLabel,
        parentElementKey: c.parentAccountElementKey,
      });
    });

    return Array.from(groups.entries())
      .map(([key, items]) => ({
        id: key,
        label: items[0]?.accountElementLabel || key,
        items,
      }))
      .sort((a, b) => {
        const priA = accountElementOrder.indexOf(a.id);
        const priB = accountElementOrder.indexOf(b.id);
        if (priA === -1 && priB === -1) return a.id.localeCompare(b.id);
        if (priA === -1) return 1;
        if (priB === -1) return -1;
        return priA - priB;
      });
  }, [coaData]);

  // Use test data for development - set to false to use real API data
  const USE_TEST_DATA = false;

  const testTxns = useMemo(() => testCategorizationTransactions, []);
  const rawTransactions = useMemo(() => {
    if (USE_TEST_DATA) return testTxns;
    return txnData?.pages?.flatMap((page) => page.transactions) || [];
  }, [USE_TEST_DATA, testTxns, txnData?.pages]);

  console.log(rawTransactions.length);
  // Sync draft transactions with server data
  useEffect(() => {
    setDraftTransactions(rawTransactions);
  }, [rawTransactions]);

  // Use draft transactions for display (includes optimistic updates and filtering)
  const transactions = useMemo(() => {
    let filtered = draftTransactions;

    // Filter by selected bank accounts if any are selected (O(1) lookup using Set)
    if (selectedBankAccountIdsSet.size > 0) {
      filtered = filtered.filter((txn) =>
        selectedBankAccountIdsSet.has(txn.bankAccountId),
      );
    }

    // Filter by status based on current view
    if (view === 'group' && statusFilter) {
      filtered = filtered.filter((txn) => txn.status === statusFilter);
    } else if (view === 'table' && statusFilterForTable.size > 0) {
      filtered = filtered.filter((txn) => statusFilterForTable.has(txn.status));
    }

    return filtered;
  }, [
    draftTransactions,
    selectedBankAccountIdsSet,
    view,
    statusFilter,
    statusFilterForTable,
  ]);

  const rowClickHandler = useCallback((row: any) => {
    const id = row.original.id;

    setSelectedTransactionId((prevId) => (prevId === id ? null : id));
  }, []);

  // Handler to update exchange rate and recalculate spent/received
  const handleExchangeRateUpdate = useCallback(
    (bankTransactionId: string, newRate: number) => {
      setDraftTransactions((prev) =>
        prev.map((txn) => {
          if (txn.bankTransactionId !== bankTransactionId) return txn;

          // For single entry transactions, update the transaction itself
          if (!txn.hasMultipleEntries) {
            const newReportingAmount = txn.nativeAmount * newRate;
            return {
              ...txn,
              exchangeRate: newRate.toFixed(4),
              reportingAmount: newReportingAmount,
              spent: newReportingAmount > 0 ? newReportingAmount : 0,
              received:
                newReportingAmount < 0 ? Math.abs(newReportingAmount) : 0,
            };
          }

          // For multiple entries, update each entry
          const updatedEntries = txn.entries!.map((entry) => {
            const newReportingAmount = entry.nativeAmount * newRate;
            return {
              ...entry,
              reportingAmount: newReportingAmount,
              exchangeRate: newRate.toFixed(4),
              spent: newReportingAmount > 0 ? newReportingAmount : 0,
              received:
                newReportingAmount < 0 ? Math.abs(newReportingAmount) : 0,
            };
          });

          // Recalculate totals from entries
          const newSpent = updatedEntries.reduce(
            (sum, entry) =>
              sum + (entry.reportingAmount > 0 ? entry.reportingAmount : 0),
            0,
          );
          const newReceived = updatedEntries.reduce(
            (sum, entry) =>
              sum +
              (entry.reportingAmount < 0 ? Math.abs(entry.reportingAmount) : 0),
            0,
          );

          return {
            ...txn,
            exchangeRate: newRate.toFixed(4),
            reportingAmount: updatedEntries.reduce(
              (sum, e) => sum + e.reportingAmount,
              0,
            ),
            spent: newSpent,
            received: newReceived,
            entries: updatedEntries,
          };
        }),
      );
    },
    [],
  );

  const markFieldClean = useCallback((fieldKey: string) => {
    setDirtyFields((prev) => {
      const next = new Set(prev);
      next.delete(fieldKey);
      return next;
    });
  }, []);

  const markFieldDirty = useCallback((fieldKey: string) => {
    setDirtyFields((prev) => new Set(prev).add(fieldKey));
  }, []);

  const columns = useMemo(
    () =>
      getCatEngineColumns({
        groupedCoaData,
        mode,
        reportingCurrency: company?.reportingCurrencyCode,
        onFxRateChange: handleExchangeRateUpdate,
        markFieldClean,
        markFieldDirty,
      }),
    [
      groupedCoaData,
      mode,
      company,
      handleExchangeRateUpdate,
      markFieldClean,
      markFieldDirty,
    ],
  );

  const estimatedRowHeight = useMemo(() => {
    switch (rowHeight) {
      case 'min':
        return 28;
      case 'max':
        return 48;
      default:
        return 36;
    }
  }, [rowHeight]);

  const customOptions = useMemo(() => {
    return {
      // virtualization: {
      //   enabled: true,
      //   estimatedRowHeight,
      //   overscan: 8,
      // },
      infiniteScroll: {
        enabled: !USE_TEST_DATA,
        onEndReached: () => {
          if (hasNextPage) {
            fetchNextPage();
          }
        },
        hasMore: !!hasNextPage,
        isFetching: isFetchingNextPage,
        threshold: 300,
      },
      rowSelection: {
        enabled: true,
      },
      customClassNames: {
        wrapper: `gap-0`,
        table: `${
          view === 'group'
            ? accordionItems.find((item) => item.id === openAccordionItem)
                ?.borderClass
            : ''
        }`,
        tableHeader: `${
          view === 'group'
            ? accordionItems.find((item) => item.id === openAccordionItem)
                ?.backgroundClass
            : ''
        }`,
        emptyTableRow: 'h-full',
        tableBodyRow: '',
      },
      expandableRows: {
        enabled: true,
        subRowsProperty: 'entries',
        canExpand: (row) =>
          (mode === 'autosave' && row.original.hasMultipleEntries) || false,
        getSubRows: (row) => row.entries,
      },
      rowClick: {
        mode: 'custom',
        onClick: rowClickHandler,
      },
    } satisfies DataTableInputOptions<GroupedTransaction>;
  }, [
    mode,
    view,
    openAccordionItem,
    rowHeight,
    estimatedRowHeight,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    USE_TEST_DATA,
  ]);

  // DataTable Hook
  const { table } = useDataTable({
    columns,
    data: transactions,
    customOptions,
    initialState: {
      columnPinning: {
        left: ['bank', 'date', 'description'],
        right: ['spent', 'received', 'account', '__actions'],
      },
    },
    state: {
      columnVisibility: {
        __actions: mode === 'autosave',
        status: false,
        confidence: false,
      },
    },
  });

  const handleAccordionItemChange = useCallback((value: string) => {
    setOpenAccordionItem(value);
  }, []);

  const reorderedAccordionItems = useMemo(() => {
    return [...accordionItems].sort((a, b) => {
      if (a.id === openAccordionItem) return -1;
      if (b.id === openAccordionItem) return 1;
      return 0;
    });
  }, [openAccordionItem]);

  const tableView = useMemo(() => <DataTable table={table} />, [table]);
  const accordionView = useMemo(() => {
    return (
      <Accordion
        type="single"
        collapsible
        defaultValue={accordionItems[0].id}
        className="flex min-h-0 flex-1 flex-col"
        value={openAccordionItem}
        onValueChange={handleAccordionItemChange}
      >
        {reorderedAccordionItems.map((item) => (
          <AccordionItem
            key={item.id}
            value={item.id}
            className="[[data-state=open]]:min-h-0 [[data-state=open]]:h-full flex flex-col"
          >
            <AccordionTrigger
              className={cn('p-0 px-2 py-1 hover:no-underline')}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'hover:underline',
                    item.id === openAccordionItem
                      ? item.textClass
                      : 'text-muted-foreground font-light',
                  )}
                >
                  {item.title}
                </span>
                <Badge
                  variant={
                    item.id === openAccordionItem ? 'default' : 'outline'
                  }
                  className={cn(
                    'text-xs',
                    item.id === openAccordionItem
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  100
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent
              className="flex h-full min-h-0 flex-col"
              wrapperClassName="h-full min-h-0 flex flex-col"
            >
              <DataTable key={`${mode}-${item.id}`} table={table} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    );
  }, [
    table,
    openAccordionItem,
    reorderedAccordionItems,
    handleAccordionItemChange,
    mode,
  ]);

  const selectedTransaction = useMemo(() => {
    if (!selectedTransactionId) return null;
    return transactions.find((txn) => txn.id === selectedTransactionId) || null;
  }, [selectedTransactionId, transactions]);

  // Auto-switch mode based on screen size (1024px <= width < 1440px)
  useEffect(() => {
    if (shouldAutoSave && mode !== 'autosave' && !hasUserPreference) {
      // Only auto-switch if user hasn't manually set a preference
      setMode('autosave');
      // Save to localStorage but don't mark as user preference
      if (typeof window !== 'undefined') {
        localStorage.setItem(MODE_STORAGE_KEY, 'autosave');
      }
      toast.info('Switched to Autosave mode', {
        description:
          'Optimized for medium screens. You can change this anytime.',
        duration: 3000,
      });
    } else if (!shouldAutoSave && mode === 'autosave' && !hasUserPreference) {
      // When screen size changes back to large, revert to review mode if it was auto-switched
      setMode('review');
      if (typeof window !== 'undefined') {
        localStorage.setItem(MODE_STORAGE_KEY, 'review');
      }
    }
  }, [shouldAutoSave, mode, hasUserPreference, MODE_STORAGE_KEY]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasDirtyFields = dirtyFields.size > 0;
      const hasPending = hasAnyPendingChanges();

      if (hasDirtyFields || hasPending) {
        e.preventDefault();

        // Provide more informative message
        if (hasPending) {
          const summary = getPendingTransactionsSummary();
          const message =
            summary.count === 1
              ? 'You have 1 transaction with unsaved changes. Are you sure you want to leave?'
              : `You have ${summary.count} transactions with unsaved changes. Are you sure you want to leave?`;
          return message;
        }

        return ''; // Browser shows default message for dirtyFields
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtyFields, hasAnyPendingChanges, getPendingTransactionsSummary]);

  // Handle manual mode changes with preference persistence
  const handleModeChange = useCallback(
    (newMode: CatEngineMode) => {
      setMode(newMode);
      setHasUserPreference(true);
      // Persist user preference and mark as manually set
      if (typeof window !== 'undefined') {
        localStorage.setItem(MODE_STORAGE_KEY, newMode);
        localStorage.setItem(USER_PREFERENCE_KEY, 'true');
      }
    },
    [MODE_STORAGE_KEY, USER_PREFERENCE_KEY],
  );

  if (!is1024) return <SmallScreenMessage />;

  if (isLoading || isLoadingSession) {
    return <CenteredLoader />;
  }

  return (
    <LedgerIntentManagerV2Provider value={manager}>
      <div className="flex h-full min-h-0 flex-col p-4 pb-2">
        <div className="mb-4 flex h-8 max-h-8 items-center justify-between overflow-clip">
          <div className="h-7.5 flex items-center gap-2">
            <CatEngineAdvFilter />

            {/* Review mode: No DB Calls until user triggers action, Autosave mode: DB Calls are made automatically usually when user's focus leaves the box or after a certain time period whichever is later (or should it be sooner). */}
            <LeftCatEngineToolbar mode={mode} setMode={handleModeChange} />

            <div className="h-full">
              <Input
                placeholder="Search..."
                aria-label="Search transactions"
                className="h-full w-60"
              />
            </div>
          </div>

          <div className="h-7.5 flex items-center justify-center">
            <CenterCatEngineToolbar
              selectedBankAccountIds={selectedBankAccountIds}
              onBankAccountsChange={setSelectedBankAccountIds}
              currentStatus={statusFilterForTable}
              onStatusToggle={setStatusFilterForTable}
              bankAccounts={bankAccounts}
              view={view}
            />
          </div>

          <div className="h-7.5 flex items-center gap-2">
            <DateRangePicker
              date={dateRange}
              onDateSelect={handleDateRangeChange}
              variant="outline"
              alignPopover="end"
              className="h-full rounded"
            />

            <RightCatEngineToolbar
              rowHeight={rowHeight}
              setRowHeight={setRowHeight}
              isFullScreen={isFullScreen}
              setIsFullScreen={setIsFullScreen}
              view={view}
              setView={setView}
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-col overflow-hidden">
          {mode === 'review' && (
            <ResizablePanelGroup
              direction="horizontal"
              className="min-h-0 gap-2"
            >
              <ResizablePanel
                id="main-panel"
                order={0}
                minSize={30}
                className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden"
              >
                {view === 'group' ? accordionView : tableView}
              </ResizablePanel>

              {selectedTransaction && (
                <>
                  <ResizableHandle withHandle className="bg-background" />
                  <ResizablePanel
                    id="transaction-panel"
                    order={1}
                    // minSize={20}
                    // maxSize={40}
                    // defaultSize={30}
                    className="w-sm h-full min-h-0 !max-w-md overflow-hidden"
                  >
                    {/* <CatEngineTxnView
                    transaction={selectedTransaction}
                    accordionItemId={openAccordionItem}
                    isLoading={isLoading}
                    error={error ? error.message : null}
                  /> */}
                    <TransactionView
                      transaction={selectedTransaction}
                      groupedCoaData={groupedCoaData}
                    />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          )}
          {mode === 'autosave' && (
            <>{view === 'group' ? accordionView : tableView}</>
          )}
        </div>
        <div className="text-muted-foreground flex-shrink-0 pt-1 text-xs">
          <span>Showing {rawTransactions.length} transactions</span>
          <span> | </span>
          <span>Total uncategorized: 100</span>
          <span> | </span>
          <span>Total needs review: 100</span>
        </div>
      </div>
    </LedgerIntentManagerV2Provider>
  );
}
