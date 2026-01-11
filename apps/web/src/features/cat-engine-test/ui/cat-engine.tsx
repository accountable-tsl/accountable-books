import type { DataTableInputOptions } from '@/components/data-table/types/data-table';
import type { GroupedTransactionOld as GroupedTransaction } from '@/modules/accounting/categorization';
import { useCallback, useMemo, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { cn } from '@/lib/utils';
import { useCategorizationTransactionsOld as useCategorizationTransactions } from '@/modules/accounting/categorization';
import { useCompanyBankAccounts } from '@/modules/banking/accounts/model/hooks';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { useParams } from 'react-router';

import { CatEngineAdvFilter } from './components/cat-engine-adv-filter';
import { CatEngineModeToggle } from './components/cat-engine-mode-toggle';
import {
  LeftCatEngineToolbar,
  RightCatEngineToolbar,
} from './components/cat-engine-toolbar';
import { CatEngineTxnView } from './components/cat-engine-txn-view';
import { LoadingState } from './components/loading-state';
import { getCatEngineColumns } from './config/table-columns';

import type { AdvancedFilters } from './components/cat-engine-adv-filter';
import type { CatEngineMode } from './components/cat-engine-mode-toggle';

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
  // Default to last 6 months to catch more transactions
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return { from: sixMonthsAgo, to: now } as { from: Date; to?: Date };
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
  const { companyId } = useParams<{ companyId: string }>();
  const [view, setView] = useState<'table' | 'group'>('table');
  const [rowHeight, setRowHeight] = useState<'min' | 'mid' | 'max'>('mid');
  const [isFullScreen, setIsFullScreen] = useState(false);
  // Default to 'uncategorized' to show the most important transactions first
  const [openAccordionItem, setOpenAccordionItem] =
    useState<string>('uncategorized');
  const [dateRange, setDateRange] = useState<{ from: Date; to?: Date }>(
    getInitialDateRange(),
  );
  const [selectedTransactionId, setSelectedTransactionId] = useState<
    string | null
  >(null);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({});
  const [mode, setMode] = useState<CatEngineMode>('review');

  const is1024 = useMediaQuery('(min-width: 1024px)');

  // Map accordion item to status filter
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
  const { data, isLoading, error, refetch } = useCategorizationTransactions({
    companyId: companyId || '',
    dateFrom: dateRange.from,
    dateTo: dateRange.to || new Date(),
    status: Array.isArray(statusFilter)
      ? statusFilter
      : statusFilter
        ? [statusFilter]
        : [],
    limit: 100,
    offset: 0,
  });

  const rawTransactions = data?.transactions || [];

  // Apply advanced filters (client-side filtering)
  const transactions = useMemo(() => {
    let filtered = [...rawTransactions];

    // Text search (description or reference)
    if (advancedFilters.searchText) {
      const searchLower = advancedFilters.searchText.toLowerCase();
      filtered = filtered.filter((txn) => {
        const firstLine = txn.lines[0];
        const description = firstLine.description?.toLowerCase() || '';
        const reference = firstLine.reference?.toLowerCase() || '';
        return (
          description.includes(searchLower) || reference.includes(searchLower)
        );
      });
    }

    // Amount range
    if (advancedFilters.amountMin !== undefined) {
      filtered = filtered.filter(
        (txn) => Math.abs(txn.bank_amount) >= advancedFilters.amountMin!,
      );
    }
    if (advancedFilters.amountMax !== undefined) {
      filtered = filtered.filter(
        (txn) => Math.abs(txn.bank_amount) <= advancedFilters.amountMax!,
      );
    }

    // Confidence range
    if (advancedFilters.confidenceMin !== undefined) {
      filtered = filtered.filter((txn) => {
        const firstLine = txn.lines[0];
        if (firstLine.confidence === null) return false;
        return firstLine.confidence * 100 >= advancedFilters.confidenceMin!;
      });
    }
    if (advancedFilters.confidenceMax !== undefined) {
      filtered = filtered.filter((txn) => {
        const firstLine = txn.lines[0];
        if (firstLine.confidence === null) return false;
        return firstLine.confidence * 100 <= advancedFilters.confidenceMax!;
      });
    }

    // Contact filter
    if (advancedFilters.contactId) {
      filtered = filtered.filter((txn) =>
        txn.lines.some((line) => line.contact_id === advancedFilters.contactId),
      );
    }

    // Bank account filter
    if (advancedFilters.bankAccountId) {
      filtered = filtered.filter(
        (txn) => txn.bank_account_id === advancedFilters.bankAccountId,
      );
    }

    return filtered;
  }, [rawTransactions, advancedFilters]);

  const selectedTransaction = useMemo(() => {
    if (!selectedTransactionId) return null;
    return transactions.find((txn) => txn.id === selectedTransactionId) || null;
  }, [selectedTransactionId, transactions]);

  // Handle split transaction
  const handleSplitTransaction = useCallback(
    (transaction: GroupedTransaction) => {
      // TODO: Implement split transaction functionality
      console.log('Split transaction:', transaction.id);
      // This will open a split dialog/modal in the future
    },
    [],
  );

  const columns = useMemo(
    () => getCatEngineColumns(bankAccountMap, handleSplitTransaction),
    [bankAccountMap, handleSplitTransaction],
  );

  // Row click handler - reusable for both table and accordion views
  const rowClickHandler = useCallback((row: any) => {
    if (row) {
      setSelectedTransactionId(row.original.id);
    }
  }, []);

  const customOptions: DataTableInputOptions<any> = useMemo(() => {
    return {
      virtualizer: {
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
      },
    };
  }, [view, openAccordionItem, rowHeight]);

  const { table } = useDataTable({
    columns,
    data: transactions,
    customOptions: {
      ...customOptions,
      rowClick: {
        mode: 'custom',
        onClick: rowClickHandler,
      },
    },
  });

  const handleAccordionItemChange = useCallback((value: string) => {
    setOpenAccordionItem(value);
    // Clear selection when switching accordion items
    setSelectedTransactionId(null);
  }, []);

  const reorderedAccordionItems = useMemo(() => {
    return [...accordionItems].sort((a, b) => {
      if (a.id === openAccordionItem) return -1;
      if (b.id === openAccordionItem) return 1;
      return 0;
    });
  }, [openAccordionItem]);

  if (!is1024) return <SmallScreenMessage />;

  if (!companyId) {
    return (
      <div className="p-4">
        <div className="text-red-500">Company ID not found in route</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex h-8 max-h-8 items-center justify-between gap-2 overflow-clip">
        <div className="flex h-7.5 items-center gap-2">
          <CatEngineAdvFilter
            filters={advancedFilters}
            onFiltersChange={setAdvancedFilters}
            transactions={rawTransactions}
            bankAccounts={bankAccounts}
          />
          <LeftCatEngineToolbar view={view} setView={setView} />
          <div className="h-full">
            <Input
              placeholder="Search..."
              aria-label="Search transactions"
              className="h-full w-60"
            />
          </div>
        </div>

        <div className="flex h-7.5 flex-1 items-center justify-center">
          <CatEngineModeToggle mode={mode} onModeChange={setMode} />
        </div>

        <div className="flex h-7.5 items-center gap-2">
          <DateRangePicker
            date={dateRange}
            onDateSelect={(newRange) => {
              // Ensure dates are in correct order
              if (newRange.from && newRange.to && newRange.from > newRange.to) {
                // Swap if reversed
                setDateRange({ from: newRange.to, to: newRange.from });
              } else {
                setDateRange(newRange);
              }
            }}
            variant="outline"
            alignPopover="end"
            className="h-full rounded"
          />
          <RightCatEngineToolbar
            rowHeight={rowHeight}
            setRowHeight={setRowHeight}
            isFullScreen={isFullScreen}
            setIsFullScreen={setIsFullScreen}
          />
        </div>
      </div>
      <ResizablePanelGroup direction="horizontal" className="gap-2">
        <ResizablePanel className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <LoadingState message="Loading transactions..." />
            </div>
          ) : error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
              <div className="text-sm text-red-500">
                Failed to load transactions: {error.message}
              </div>
              <Button onClick={() => refetch()} variant="outline" size="sm">
                Retry
              </Button>
            </div>
          ) : view === 'table' ? (
            transactions.length === 0 ? (
              <div className="flex flex-1 flex-col">
                <DataTable table={table} />
                <div className="flex flex-1 items-center justify-center border-t p-4">
                  <div className="space-y-2 text-center">
                    <div className="text-muted-foreground text-sm">
                      No transactions found in this date range
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {data?.total === 0 ? (
                        <span>
                          Try adjusting your date range or check a different
                          status category
                        </span>
                      ) : (
                        <span>
                          There are {data?.total || 0} total transactions
                          matching this filter. Try expanding your date range
                          using the date picker above to see them.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <DataTable table={table} />
            )
          ) : (
            <Accordion
              type="single"
              collapsible
              className="flex min-h-0 flex-1 flex-col"
              value={openAccordionItem}
              onValueChange={handleAccordionItemChange}
            >
              {reorderedAccordionItems.map((item) => {
                // Filter transactions by status for this accordion item
                const itemStatus = getStatusFromAccordionItem(item.id);
                const filteredTransactions = itemStatus
                  ? transactions.filter((txn) => txn.status === itemStatus)
                  : transactions;

                return (
                  <AccordionItem
                    key={item.id}
                    value={item.id}
                    className="flex flex-col [[data-state=open]]:h-full [[data-state=open]]:min-h-0"
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
                            item.id === openAccordionItem
                              ? 'default'
                              : 'outline'
                          }
                          className={cn(
                            'text-xs',
                            item.id === openAccordionItem
                              ? 'text-primary-foreground'
                              : 'text-muted-foreground',
                          )}
                        >
                          {filteredTransactions.length}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent
                      className="flex h-full min-h-0 flex-col"
                      wrapperClassName="h-full min-h-0 flex flex-col"
                    >
                      <AccordionTableContent
                        transactions={filteredTransactions}
                        columns={columns}
                        customOptions={customOptions}
                        rowClickHandler={rowClickHandler}
                        itemTitle={item.title}
                      />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-background" />
        <ResizablePanel className="w-sm max-w-md">
          <CatEngineTxnView
            transactionGroup={selectedTransaction}
            accordionItemId={openAccordionItem}
            isLoading={isLoading}
            error={error ? error.message : null}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// Separate component for accordion table content to avoid hooks in map
function AccordionTableContent({
  transactions,
  columns,
  customOptions,
  rowClickHandler,
  itemTitle,
}: {
  transactions: GroupedTransaction[];
  columns: any;
  customOptions: DataTableInputOptions<any>;
  rowClickHandler: (row: any) => void;
  itemTitle: string;
}) {
  const itemTable = useDataTable({
    columns,
    data: transactions,
    customOptions: {
      ...customOptions,
      rowClick: {
        mode: 'custom',
        onClick: rowClickHandler,
      },
    },
  }).table;

  if (transactions.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <DataTable table={itemTable} />
        <div className="flex flex-1 items-center justify-center border-t p-4">
          <div className="space-y-2 text-center">
            <div className="text-muted-foreground text-sm">
              No {itemTitle.toLowerCase()} transactions in this date range
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <DataTable table={itemTable} />;
}
