import type { DataTableInputOptions } from '@/components/data-table/types/data-table';
import type {
  CategorizationTransactionStatus,
  GroupedTransaction,
} from '@/modules/accounting/categorization';
import type { CoaResponse } from '@/modules/accounting/chart-of-accounts/model/types';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useCategorizationStats,
  useInfiniteCategorizationTransactions,
  useLedgerIntentManagerV2,
} from '@/modules/accounting/categorization';
import { useChartOfAccountsQuery } from '@/modules/accounting/chart-of-accounts';
import { useRegisterAiDomain } from '@/modules/ai';
import { useCompanyBankAccounts } from '@/modules/banking/accounts/model/hooks';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useLocalStorage } from '@/shared/hooks/useLocalStorage';
import { toYMD } from '@/shared/utils/date-utils';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { catEngineAiRegistration } from '../ai/registration';
import { CatEngineAdvFilter } from './components/cat-engine-adv-filter';
import {
  CenterCatEngineToolbar,
  LeftCatEngineToolbar,
  RightCatEngineToolbar,
} from './components/cat-engine-toolbar';
import { TransactionView } from './components/transaction-view';
import { getCatEngineColumns } from './config/table-columns';
import { accountElementOrder } from './constants';
import { testCategorizationTransactions } from './test-data';
import { updateTransactionExchangeRate } from './utils/transaction-updates';

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

const CONFIDENCE_THRESHOLDS = {
  high: 0.9,
  medium: 0.75,
} as const;

type CatEngineTableSectionProps = {
  columns: ReturnType<typeof getCatEngineColumns>;
  transactions: GroupedTransaction[];
  customOptions: DataTableInputOptions<GroupedTransaction>;
  mode: CatEngineMode;
  view: 'table' | 'group';
  openAccordionItem: string;
  reorderedAccordionItems: typeof accordionItems;
  accordionCounts: Map<string, number>;
  onAccordionItemChange: (value: string) => void;
};

const CatEngineTableSection = memo(function CatEngineTableSection({
  columns,
  transactions,
  customOptions,
  mode,
  view,
  openAccordionItem,
  reorderedAccordionItems,
  accordionCounts,
  onAccordionItemChange,
}: CatEngineTableSectionProps) {
  const { table } = useDataTable({
    columns,
    data: transactions,
    customOptions,
    initialState: {
      columnPinning: {
        left: ['status-indicator', 'bank', 'date', 'description'],
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

  if (view === 'table') {
    return <DataTable table={table} />;
  }

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={accordionItems[0].id}
      className="flex min-h-0 flex-1 flex-col"
      value={openAccordionItem}
      onValueChange={onAccordionItemChange}
    >
      {reorderedAccordionItems.map((item) => (
        <AccordionItem
          key={item.id}
          value={item.id}
          className="flex flex-col [data-state=open]:h-full [data-state=open]:min-h-0"
        >
          <AccordionTrigger className={cn('p-0 px-2 py-1 hover:no-underline')}>
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
                variant={item.id === openAccordionItem ? 'default' : 'outline'}
                className={cn(
                  'text-xs',
                  item.id === openAccordionItem
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {accordionCounts.get(item.id) ?? 0}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent
            className="flex h-full min-h-0 flex-col"
            wrapperClassName="h-full min-h-0 flex flex-col"
          >
            {item.id === openAccordionItem && (
              <DataTable key={`${mode}-${item.id}`} table={table} />
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
});

function getInitialDateRange() {
  const now = new Date();
  // Default to last 6 months to catch more transactions
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return { from: sixMonthsAgo, to: now } as { from: Date; to?: Date };
}

// /**
//  * Map accordion item ID to status filter
//  */
// function getStatusFromAccordionItem(
//   itemId: string,
// ): 'uncategorized' | 'proposed' | 'posted' | undefined {
//   switch (itemId) {
//     case 'uncategorized':
//       return 'uncategorized';
//     case 'high-confidence':
//     case 'medium-confidence':
//     case 'low-confidence':
//       return 'proposed';
//     case 'reviewed':
//       return 'posted';
//     default:
//       return undefined;
//   }
// }

function normalizeConfidence(confidence: number | null | undefined) {
  if (confidence === null || confidence === undefined) return null;
  return confidence > 1 ? confidence / 100 : confidence;
}

function getConfidenceBucketId(confidence: number | null | undefined) {
  const normalized = normalizeConfidence(confidence);
  if (normalized === null) return 'low-confidence';
  if (normalized >= CONFIDENCE_THRESHOLDS.high) return 'high-confidence';
  if (normalized >= CONFIDENCE_THRESHOLDS.medium) return 'medium-confidence';
  return 'low-confidence';
}

function transactionMatchesAccordionItem(
  txn: GroupedTransaction,
  itemId: string,
) {
  switch (itemId) {
    case 'uncategorized':
      return txn.status === 'uncategorized';
    case 'reviewed':
      return txn.status === 'posted';
    case 'high-confidence':
    case 'medium-confidence':
    case 'low-confidence':
      if (txn.status !== 'proposed') return false;
      return getConfidenceBucketId(txn.confidence) === itemId;
    default:
      return false;
  }
}

export function CatEngine() {
  useRegisterAiDomain(useMemo(() => catEngineAiRegistration(), []));

  const { companyId, company, loading: isLoadingSession } = useSession();
  const [searchParams] = useSearchParams();
  const workItemId = searchParams.get('workItemId') || undefined;
  const [view, setView] = useState<'table' | 'group'>('table');
  const ROW_HEIGHT_KEY = `cat-engine-row-height-${companyId || 'default'}`;
  const [rowHeight, setRowHeight] = useState<'min' | 'mid' | 'max'>(() => {
    if (typeof window === 'undefined') return 'mid';
    const saved = localStorage.getItem(ROW_HEIGHT_KEY);
    return saved === 'min' || saved === 'mid' || saved === 'max'
      ? saved
      : 'mid';
  });
  const [isFullScreen, setIsFullScreen] = useState(false);
  // Default to 'uncategorized' to show the most important transactions first
  const [openAccordionItem, setOpenAccordionItem] =
    useState<string>('uncategorized');
  // Persist date range in localStorage (scoped by companyId)
  const FILTERS_STORAGE_KEY = `cat-engine-filters-${companyId || 'default'}`;
  const [dateRangeStored, setDateRangeStored] = useLocalStorage<{
    from: string; // ISO string
    to?: string; // ISO string
  }>(
    FILTERS_STORAGE_KEY,
    (() => {
      const initial = getInitialDateRange();
      return {
        from: initial.from.toISOString(),
        to: initial.to?.toISOString(),
      };
    })(),
  );

  // Convert stored ISO strings back to Date objects for use
  const dateRange = useMemo<{ from: Date; to?: Date }>(
    () => ({
      from: new Date(dateRangeStored.from),
      to: dateRangeStored.to ? new Date(dateRangeStored.to) : undefined,
    }),
    [dateRangeStored.from, dateRangeStored.to],
  );

  // Wrapper to update dateRange and persist to localStorage
  const handleDateRangeChange = useCallback(
    (range: { from: Date; to?: Date }) => {
      setDateRangeStored({
        from: range.from.toISOString(),
        to: range.to?.toISOString(),
      });
    },
    [setDateRangeStored],
  );
  const debouncedDateRange = useDebouncedValue(dateRange, 300);
  const [selectedTransactionId, setSelectedTransactionId] = useState<
    string | null
  >(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  // Draft transaction overrides for optimistic UI updates (keyed by bankTransactionId)
  const [draftTransactionOverrides, setDraftTransactionOverrides] = useState<
    Map<string, GroupedTransaction>
  >(new Map());
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

  useEffect(() => {
    if (!companyId || typeof window === 'undefined') return;

    const savedMode = localStorage.getItem(MODE_STORAGE_KEY);
    if (savedMode === 'review' || savedMode === 'autosave') {
      setMode(savedMode);
    }

    setHasUserPreference(localStorage.getItem(USER_PREFERENCE_KEY) === 'true');
  }, [companyId, MODE_STORAGE_KEY, USER_PREFERENCE_KEY]);

  useEffect(() => {
    if (!companyId || typeof window === 'undefined') return;
    const saved = localStorage.getItem(ROW_HEIGHT_KEY);
    if (saved === 'min' || saved === 'mid' || saved === 'max') {
      setRowHeight(saved);
    }
  }, [companyId, ROW_HEIGHT_KEY]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ROW_HEIGHT_KEY, rowHeight);
  }, [rowHeight, ROW_HEIGHT_KEY]);

  // Track dirty fields without re-rendering on each keystroke.
  const dirtyFieldsRef = useRef<Set<string>>(new Set());
  const [selectedBankAccountIds, setSelectedBankAccountIds] = useState<
    string[]
  >([]);
  // Status filter for table view (separate from accordion status)
  const [statusFilterForTable, setStatusFilterForTable] = useState<
    Set<CategorizationTransactionStatus>
  >(new Set());

  const manager = useLedgerIntentManagerV2();
  // Keep a stable manager instance per company to avoid provider re-renders.
  const managerRef = useRef(manager);
  const managerCompanyRef = useRef(companyId);
  if (managerCompanyRef.current !== companyId) {
    managerRef.current = manager;
    managerCompanyRef.current = companyId;
  }
  const managerStable = managerRef.current;
  const getPendingTransactionsSummary =
    managerStable.getPendingTransactionsSummary;
  const hasAnyPendingChanges = managerStable.hasAnyPendingChanges;

  const is1024 = useMediaQuery('(min-width: 1024px)');
  const is1440 = useMediaQuery('(min-width: 1440px)');

  // Determine if we should auto-switch to autosave (1024px <= width < 1440px)
  const shouldAutoSave = is1024 && !is1440;

  // const statusFilter = getStatusFromAccordionItem(openAccordionItem);

  // Fetch bank accounts for bank name/logo lookup and filtering
  const { data: bankAccountsData } = useCompanyBankAccounts(companyId ?? '');
  const bankAccounts = useMemo(
    () => bankAccountsData?.data || [],
    [bankAccountsData],
  );

  const bankAccountIdsForServer = useMemo(() => {
    if (selectedBankAccountIds.length === 0) return undefined;
    return [...selectedBankAccountIds].sort();
  }, [selectedBankAccountIds]);

  const statusFilterForServer = useMemo(() => {
    // In group view, fetch all transactions so accordion counts are accurate
    // The filtering for display happens client-side in tableTransactions
    if (view === 'group') {
      return undefined;
    }
    if (statusFilterForTable.size === 0) return undefined;
    return Array.from(statusFilterForTable).sort();
  }, [statusFilterForTable, view]);

  const searchQueryForServer = useMemo(() => {
    const trimmed = debouncedSearchQuery.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, [debouncedSearchQuery]);

  // Fetch categorization transactions
  const {
    data: txnData,
    isLoading,
    error: _error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteCategorizationTransactions({
    companyId: companyId ?? '',
    dateFrom: debouncedDateRange.from,
    dateTo: debouncedDateRange.to || new Date(),
    status: workItemId ? undefined : statusFilterForServer,
    bankAccountIds: workItemId ? undefined : bankAccountIdsForServer,
    workItemId,
    searchQuery: workItemId ? undefined : searchQueryForServer,
    limit: 100,
  });

  // Fetch global categorization stats
  const { data: stats } = useCategorizationStats({
    companyId: companyId ?? '',
    bankAccountIds: bankAccountIdsForServer,
    dateFrom: toYMD(debouncedDateRange.from),
    dateTo: toYMD(debouncedDateRange.to || new Date()),
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

  const rawTransactionsByBankId = useMemo(() => {
    const map = new Map<string, GroupedTransaction>();
    rawTransactions.forEach((txn) => map.set(txn.bankTransactionId, txn));
    return map;
  }, [rawTransactions]);

  const footerTotals = useMemo(() => {
    return rawTransactions.reduce(
      (totals, txn) => {
        if (txn.status === 'uncategorized') totals.uncategorized += 1;
        if (txn.status === 'proposed') totals.aiSuggestions += 1;
        if (txn.status === 'posted') totals.categorized += 1;
        return totals;
      },
      { uncategorized: 0, aiSuggestions: 0, categorized: 0 },
    );
  }, [rawTransactions]);

  // Prune overrides when server data changes to avoid stale entries.
  useEffect(() => {
    if (draftTransactionOverrides.size === 0) return;
    const validIds = new Set(
      rawTransactions.map((txn) => txn.bankTransactionId),
    );
    setDraftTransactionOverrides((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const key of prev.keys()) {
        if (!validIds.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rawTransactions, draftTransactionOverrides.size]);

  // Use draft overrides for display (includes optimistic updates).
  const transactions = useMemo(() => {
    if (draftTransactionOverrides.size === 0) return rawTransactions;
    return rawTransactions.map(
      (txn) => draftTransactionOverrides.get(txn.bankTransactionId) ?? txn,
    );
  }, [rawTransactions, draftTransactionOverrides]);

  const transactionMap = useMemo(() => {
    const map = new Map<string, GroupedTransaction>();
    transactions.forEach((txn) => map.set(txn.id, txn));
    return map;
  }, [transactions]);

  const accordionCounts = useMemo(() => {
    const counts = new Map<string, number>(
      accordionItems.map((item) => [item.id, 0]),
    );

    rawTransactions.forEach((txn) => {
      if (txn.status === 'uncategorized') {
        counts.set('uncategorized', (counts.get('uncategorized') || 0) + 1);
        return;
      }

      if (txn.status === 'posted') {
        counts.set('reviewed', (counts.get('reviewed') || 0) + 1);
        return;
      }

      if (txn.status === 'proposed') {
        const bucket = getConfidenceBucketId(txn.confidence);
        counts.set(bucket, (counts.get(bucket) || 0) + 1);
      }
    });

    return counts;
  }, [rawTransactions]);

  const tableTransactions = useMemo(() => {
    if (view !== 'group') return transactions;
    return transactions.filter((txn) =>
      transactionMatchesAccordionItem(txn, openAccordionItem),
    );
  }, [transactions, view, openAccordionItem]);

  // Compute compact footer stats with helpful context
  const footerStats = useMemo(() => {
    const currentUncategorized = footerTotals.uncategorized;
    const currentAiSuggestions = footerTotals.aiSuggestions;
    const currentCategorized = footerTotals.categorized;
    const currentTotal = rawTransactions.length;

    if (!stats) {
      // Fallback when stats not loaded
      return {
        current: {
          uncategorized: currentUncategorized,
          aiSuggestions: currentAiSuggestions,
          categorized: currentCategorized,
          total: currentTotal,
        },
        global: null,
        inRange: null,
        showHelp: false,
        helpAction: undefined,
        helpLabel: undefined,
      };
    }

    const currentBatchIsEmpty =
      currentUncategorized === 0 && currentAiSuggestions === 0;
    const hasWorkOutsideRange =
      stats.hasUncategorizedOutsideRange === true ||
      (stats.uncategorizedOutsideRangeCount ?? 0) > 0;

    // Case 1: Caught up in current range, but work exists elsewhere
    if (currentBatchIsEmpty && hasWorkOutsideRange) {
      const outsideCount = stats.uncategorizedOutsideRangeCount ?? 0;
      return {
        current: {
          uncategorized: 0,
          aiSuggestions: 0,
          categorized: currentCategorized,
          total: currentTotal,
        },
        global: {
          uncategorized: stats.totalUncategorized,
          aiSuggestions: stats.totalProposed,
          categorized: null, // We don't track this in stats yet
        },
        inRange: null,
        showHelp: true,
        helpAction: stats.oldestUncategorizedDate
          ? () => {
              const oldestDateObj = new Date(stats.oldestUncategorizedDate!);
              const fromDate = new Date(oldestDateObj);
              fromDate.setDate(fromDate.getDate() - 15);
              const toDate = new Date(oldestDateObj);
              toDate.setDate(toDate.getDate() + 15);
              handleDateRangeChange({ from: fromDate, to: toDate });
            }
          : undefined,
        helpLabel: 'Jump to oldest',
        helpMessage: `${outsideCount} more outside this range`,
      };
    }

    // Case 2: Date range provided - show in-range vs global
    if (stats.uncategorizedInRangeCount !== undefined) {
      return {
        current: {
          uncategorized: currentUncategorized,
          aiSuggestions: currentAiSuggestions,
          categorized: currentCategorized,
          total: currentTotal,
        },
        global: {
          uncategorized: stats.totalUncategorized,
          aiSuggestions: stats.totalProposed,
          categorized: null,
        },
        inRange: {
          uncategorized: stats.uncategorizedInRangeCount,
          aiSuggestions: stats.proposedInRangeCount ?? 0,
        },
        showHelp: false,
        helpAction: undefined,
        helpLabel: undefined,
      };
    }

    // Case 3: Default - show current and global
    return {
      current: {
        uncategorized: currentUncategorized,
        aiSuggestions: currentAiSuggestions,
        categorized: currentCategorized,
        total: currentTotal,
      },
      global: {
        uncategorized: stats.totalUncategorized,
        aiSuggestions: stats.totalProposed,
        categorized: null,
      },
      inRange: null,
      showHelp: false,
      helpAction: undefined,
      helpLabel: undefined,
    };
  }, [
    stats,
    rawTransactions.length,
    footerTotals.uncategorized,
    footerTotals.aiSuggestions,
    footerTotals.categorized,
    handleDateRangeChange,
  ]);

  const accordionItemById = useMemo(() => {
    return new Map(accordionItems.map((item) => [item.id, item]));
  }, []);

  const rowClickHandler = useCallback((row: any) => {
    const id = row.original.id;

    setSelectedTransactionId((prevId) => (prevId === id ? null : id));
  }, []);

  // Handler to update exchange rate and recalculate spent/received
  const handleExchangeRateUpdate = useCallback(
    (bankTransactionId: string, newRate: number) => {
      setDraftTransactionOverrides((prev) => {
        const base =
          prev.get(bankTransactionId) ||
          rawTransactionsByBankId.get(bankTransactionId);
        if (!base) return prev;

        const next = new Map(prev);
        next.set(
          bankTransactionId,
          updateTransactionExchangeRate(base, newRate),
        );
        return next;
      });
    },
    [rawTransactionsByBankId],
  );

  // Update exchange rate via intent system (called from table cells without per-row hooks)
  const handleIntentExchangeRateUpdate = useCallback(
    (txn: GroupedTransaction, rate: number) => {
      managerStable.registerTransaction(txn);
      managerStable.updateExchangeRate(txn.bankTransactionId, rate);
    },
    [managerStable],
  );

  const markFieldClean = useCallback((fieldKey: string) => {
    dirtyFieldsRef.current.delete(fieldKey);
  }, []);

  const markFieldDirty = useCallback((fieldKey: string) => {
    dirtyFieldsRef.current.add(fieldKey);
  }, []);

  const columns = useMemo(
    () =>
      getCatEngineColumns({
        groupedCoaData,
        mode,
        reportingCurrency: company?.reportingCurrencyCode,
        onFxRateChange: handleExchangeRateUpdate,
        onIntentExchangeRateUpdate: handleIntentExchangeRateUpdate,
        markFieldClean,
        markFieldDirty,
      }),
    [
      groupedCoaData,
      mode,
      company,
      handleExchangeRateUpdate,
      handleIntentExchangeRateUpdate,
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
    const selectedAccordionItem = accordionItemById.get(openAccordionItem);
    return {
      virtualization: {
        enabled: true,
        estimatedRowHeight,
        overscan: 8,
        measure: false,
        fixedRowHeight: true,
      },
      rowSelection: {
        enabled: (row) => row.original.isEditable !== false,
        checkboxColumnPosition: { index: 1 },
      },
      customClassNames: {
        wrapper: `gap-0`,
        table: `${view === 'group' ? selectedAccordionItem?.borderClass : ''}`,
        tableHeader: `${
          view === 'group' ? selectedAccordionItem?.backgroundClass : ''
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
      infiniteScroll: {
        enabled: true,
        fetchNextPage,
        hasNextPage,
        isFetching: isFetchingNextPage || isLoading,
        threshold: 21,
      },
    } satisfies DataTableInputOptions<GroupedTransaction>;
  }, [
    mode,
    view,
    openAccordionItem,
    accordionItemById,
    rowClickHandler,
    estimatedRowHeight,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  ]);

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

  const selectedTransaction = useMemo(() => {
    if (!selectedTransactionId) return null;
    return transactionMap.get(selectedTransactionId) || null;
  }, [selectedTransactionId, transactionMap]);

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
      const hasDirtyFields = dirtyFieldsRef.current.size > 0;
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
  }, [hasAnyPendingChanges, getPendingTransactionsSummary]);

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

  if (
    (isLoading || isLoadingSession || isLoadingCoa) &&
    rawTransactions.length === 0
  ) {
    return <CenteredLoader />;
  }

  return (
    <LedgerIntentManagerV2Provider value={managerStable}>
      <div className="flex h-full min-h-0 flex-col p-4 pb-2">
        <div className="mb-4 flex h-8 max-h-8 items-center justify-between overflow-clip">
          <div className="flex h-7.5 items-center gap-2">
            <CatEngineAdvFilter />

            {/* Review mode: No DB Calls until user triggers action, Autosave mode: DB Calls are made automatically usually when user's focus leaves the box or after a certain time period whichever is later (or should it be sooner). */}
            <LeftCatEngineToolbar mode={mode} setMode={handleModeChange} />

            <div className="h-full">
              <Input
                placeholder="Search..."
                aria-label="Search transactions"
                className="h-full w-60"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex h-7.5 items-center justify-center">
            <CenterCatEngineToolbar
              selectedBankAccountIds={selectedBankAccountIds}
              onBankAccountsChange={setSelectedBankAccountIds}
              currentStatus={statusFilterForTable}
              onStatusToggle={setStatusFilterForTable}
              bankAccounts={bankAccounts}
              view={view}
            />
          </div>

          <div className="flex h-7.5 items-center gap-2">
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
        <div className="flex h-full min-h-0 flex-[1_1_auto] flex-col overflow-hidden">
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
                <CatEngineTableSection
                  columns={columns}
                  transactions={tableTransactions}
                  customOptions={customOptions}
                  mode={mode}
                  view={view}
                  openAccordionItem={openAccordionItem}
                  reorderedAccordionItems={reorderedAccordionItems}
                  accordionCounts={accordionCounts}
                  onAccordionItemChange={handleAccordionItemChange}
                />
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
                    className="h-full min-h-0 w-sm max-w-md! overflow-hidden"
                  >
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
            <CatEngineTableSection
              columns={columns}
              transactions={tableTransactions}
              customOptions={customOptions}
              mode={mode}
              view={view}
              openAccordionItem={openAccordionItem}
              reorderedAccordionItems={reorderedAccordionItems}
              accordionCounts={accordionCounts}
              onAccordionItemChange={handleAccordionItemChange}
            />
          )}
        </div>
        <div className="flex shrink-0 flex-nowrap items-center justify-between gap-4 pt-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="text-muted-foreground/75 flex items-center gap-1">
              <span>Showing {footerStats.current.total}</span>
              <span className="text-muted-foreground/50">•</span>
              {footerStats.current.uncategorized > 0 && (
                <span>{footerStats.current.uncategorized} uncategorized</span>
              )}
              {footerStats.current.uncategorized > 0 && (
                <span className="text-muted-foreground/50">|</span>
              )}
              {footerStats.current.aiSuggestions > 0 && (
                <span>{footerStats.current.aiSuggestions} AI suggestions</span>
              )}
              {footerStats.current.aiSuggestions > 0 && (
                <span className="text-muted-foreground/50">|</span>
              )}
              {footerStats.current.categorized > 0 && (
                <span>{footerStats.current.categorized} posted</span>
              )}
            </div>
            {footerStats.current.uncategorized === 0 &&
              footerStats.current.aiSuggestions === 0 &&
              footerStats.current.categorized > 0 && (
                <span className="text-emerald-600">✓ All done</span>
              )}
          </div>

          {/* Global totals - always visible when stats are loaded */}
          <div className="text-muted-foreground flex items-center gap-3">
            {footerStats.showHelp && footerStats.helpAction ? (
              <div className="text-muted-foreground/75 flex items-center gap-2 truncate text-xs">
                <span className="text-muted-foreground/75">
                  Total: {footerStats.global?.uncategorized ?? 0} uncategorized,{' '}
                  {footerStats.global?.aiSuggestions ?? 0} AI suggestions
                </span>
                <span className="text-muted-foreground/50">•</span>
                <button
                  type="button"
                  onClick={footerStats.helpAction}
                  className="text-foreground cursor-pointer transition-colors hover:underline"
                  title={footerStats.helpMessage}
                >
                  {footerStats.helpLabel} <span>→</span>
                </button>
              </div>
            ) : footerStats.global ? (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground/60">
                  Total:{' '}
                  <span className="font-medium">
                    {footerStats.global.uncategorized}
                  </span>{' '}
                  uncategorized,{' '}
                  <span className="font-medium">
                    {footerStats.global.aiSuggestions}
                  </span>{' '}
                  AI suggestions
                </span>
                {/* {footerStats.inRange && (
                    <>
                      <span className="text-muted-foreground/50">•</span>
                      <span className="text-muted-foreground/60">
                        <span className="font-medium">{footerStats.inRange.uncategorized + footerStats.inRange.aiSuggestions}</span> in this range
                      </span>
                    </>
                  )} */}
              </div>
            ) : (
              <span className="text-muted-foreground/60">
                Loading totals...
              </span>
            )}
          </div>
        </div>
      </div>
    </LedgerIntentManagerV2Provider>
  );
}
