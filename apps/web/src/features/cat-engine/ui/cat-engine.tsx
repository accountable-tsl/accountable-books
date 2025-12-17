import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSession } from '@/app/session';
import { CenteredLoader } from '@/components/CenteredLoader';
import { DataTable } from '@/components/data-table/data-table';
import type { DataTableInputOptions } from '@/components/data-table/types/data-table';
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
import type { GroupedTransaction } from '@/modules/accounting/categorization';
import { useCategorizationTransactions } from '@/modules/accounting/categorization/model/hooks';
import { useCompanyBankAccounts } from '@/modules/banking/accounts';
import { useMediaQuery } from '@/shared/hooks/use-media-query';

import { CatEngineAdvFilter } from './components/cat-engine-adv-filter';
import {
  LeftCatEngineToolbar,
  RightCatEngineToolbar,
} from './components/cat-engine-toolbar';
import { CatEngineTxnView } from './components/cat-engine-txn-view';
import { getCatEngineColumns } from './config/table-columns';
import { testCategorizationTransactions } from './test-data';

export const accordionItems = [
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
  const [view, setView] = useState<'table' | 'group'>('table');
  const [mode, setMode] = useState<'review' | 'autosave'>('review');
  const [rowHeight, setRowHeight] = useState<'min' | 'mid' | 'max'>('mid');
  const [isFullScreen, setIsFullScreen] = useState(false);
  // Default to 'uncategorized' to show the most important transactions first
  const [openAccordionItem, setOpenAccordionItem] =
    useState<string>('uncategorized');
  const [dateRange, setDateRange] = useState<{ from: Date; to?: Date }>(
    getInitialDateRange(),
  );

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

  const { companyId, loading: isLoadingSession } = useSession();
  const is1024 = useMediaQuery('(min-width: 1024px)');
  const statusFilter = getStatusFromAccordionItem(openAccordionItem);

  // Fetch bank accounts for bank name/logo lookup
  const { data: bankAccountsData } = useCompanyBankAccounts(companyId || '');
  const bankAccounts = bankAccountsData?.data || [];
  const bankAccountMap = useMemo(() => {
    const map = new Map<string, (typeof bankAccounts)[0]>();
    bankAccounts.forEach((acc) => map.set(acc.id, acc));
    return map;
  }, [bankAccounts]);

  // Fetch categorization transactions
  const {
    data: txnData,
    isLoading,
    error,
    refetch,
  } = useCategorizationTransactions({
    companyId: companyId ?? '',
    dateFrom: dateRange.from,
    dateTo: dateRange.to || new Date(),
    status: statusFilter,
    limit: 100,
    offset: 0,
  });

  // Use test data for development - set to false to use real API data
  const USE_TEST_DATA = true;

  const rawTransactions = USE_TEST_DATA
    ? testCategorizationTransactions
    : txnData?.transactions || [];
  const transactions = useMemo(() => {
    return rawTransactions;
  }, [rawTransactions]);

  const columns = useMemo(() => getCatEngineColumns({ mode }), [mode]);

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
      rowSelection: {
        enabled: true,
      },
      customClassNames: {
        wrapper: `gap-0`,
        table: `flex-1 h-full ${
          view === 'group'
            ? accordionItems.find((item) => item.id === openAccordionItem)
                ?.borderClass
            : ''
        }`,
        tableHeader: `sticky top-0 z-10 ${
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
    } satisfies DataTableInputOptions<GroupedTransaction>;
  }, [mode, view, openAccordionItem, rowHeight, estimatedRowHeight]);

  // DataTable Hook
  const { table } = useDataTable({
    columns,
    data: transactions,
    customOptions,
    initialState: {
      columnPinning: {
        left: ['bank', 'date', 'description'],
        right: ['spent', 'received', 'account'],
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
        className="flex flex-col min-h-0 flex-1"
        value={openAccordionItem}
        onValueChange={handleAccordionItemChange}
      >
        {reorderedAccordionItems.map((item) => (
          <AccordionItem
            key={item.id}
            value={item.id}
            className="flex flex-col [[data-state=open]]:min-h-0 [[data-state=open]]:h-full"
          >
            <AccordionTrigger
              className={cn('p-0 py-1 px-2 hover:no-underline')}
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
              className="h-full min-h-0 flex flex-col"
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

  if (!is1024) return <SmallScreenMessage />;

  if (isLoading || isLoadingSession) {
    return <CenteredLoader />;
  }

  return (
    <div className="min-h-0 h-full flex flex-col p-4 pb-2 gap-4">
      <div className="flex justify-between items-center overflow-clip h-8 max-h-8">
        <div className="flex gap-2 items-center h-7.5">
          <CatEngineAdvFilter />

          {/* Review mode: No DB Calls until user triggers action, Autosave mode: DB Calls are made automatically usually when user's focus leaves the box or after a certain time period whichever is later (or should it be sooner). */}
          <LeftCatEngineToolbar mode={mode} setMode={setMode} />

          <div className="h-full">
            <Input
              placeholder="Search..."
              aria-label="Search transactions"
              className="w-60 h-full"
            />
          </div>
        </div>

        <div className="flex gap-2 h-7.5 items-center">
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
      <div className="flex flex-col flex-1">
        {mode === 'review' && (
          <ResizablePanelGroup direction="horizontal" className="gap-2">
            <ResizablePanel className="min-h-0 h-full flex flex-col gap-4 min-w-0 flex-1 overflow-x-auto">
              {view === 'group' ? accordionView : tableView}
            </ResizablePanel>
            <ResizableHandle withHandle className="bg-background" />
            <ResizablePanel className="w-sm !max-w-md">
              <CatEngineTxnView />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
        {mode === 'autosave' && (
          <>{view === 'group' ? accordionView : tableView}</>
        )}

        <p className="text-xs text-muted-foreground pt-1">
          <span>Showing {rawTransactions.length} transactions</span>
          <span> | </span>
          <span>Total uncategorized: 100</span>
          <span> | </span>
          <span>Total needs review: 100</span>
        </p>
      </div>
    </div>
  );
}
