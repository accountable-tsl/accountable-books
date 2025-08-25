import { cn } from '@/lib/utils';
import { useCallback, useMemo, useState } from 'react';
import { useDataTable } from '@/components/data-table/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { getCatEngineColumns } from '@/features/cat-engine/config/table-columns';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  LeftCatEngineToolbar,
  RightCatEngineToolbar,
} from '@/features/cat-engine/components/cat-engine-toolbar';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { SmallScreenMessage } from '@/components/SmallScreenMessage';
import type { DataTableInputOptions } from '@/components/data-table/types/data-table';
import { Badge } from '@/components/ui/badge';
import { CatEngineAdvFilter } from '@/features/cat-engine/components/cat-engine-adv-filter';
import { Input } from '@/components/ui/input';
import { DateRangePicker } from '@/components/date-picker/date-range-picker';
import { CatEngineTxnView } from './components/cat-engine-txn-view';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

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

export function CatEngine() {
  const [view, setView] = useState<'table' | 'group'>('table');
  const [rowHeight, setRowHeight] = useState<'min' | 'mid' | 'max'>('mid');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [openAccordionItem, setOpenAccordionItem] = useState<string>(accordionItems[0].id);
  const [dateRange, setDateRange] = useState<{ from: Date; to?: Date }>(getInitialDateRange());

  const is1024 = useMediaQuery('(min-width: 1024px)');
  const columns = useMemo(() => getCatEngineColumns(), []);
  const emptyData = useMemo(() => [], []);

  // const estimatedRowHeight = useMemo(() => {
  //   switch (rowHeight) {
  //     case "min":
  //       return 28;
  //     case "max":
  //       return 48;
  //     default:
  //       return 36;
  //   }
  // }, [rowHeight]);

  const customOptions: DataTableInputOptions<any> = useMemo(() => {
    return {
      virtualizer: {
        enabled: true,
      },
      customClassNames: {
        wrapper: `gap-0`,
        table: `flex-1 h-full ${
          view === 'group'
            ? accordionItems.find((item) => item.id === openAccordionItem)?.borderClass
            : ''
        }`,
        tableHeader: `sticky top-0 z-10 ${
          view === 'group'
            ? accordionItems.find((item) => item.id === openAccordionItem)?.backgroundClass
            : ''
        }`,
        emptyTableRow: 'h-full',
      },
    };
  }, [view, openAccordionItem, rowHeight]);
  const { table } = useDataTable({
    columns,
    data: emptyData,
    customOptions,
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

  if (!is1024) return <SmallScreenMessage />;

  console.log(dateRange);
  return (
    <div className="min-h-0 h-full flex flex-col p-4 gap-4">
      <div className="flex justify-between items-center overflow-clip h-8 max-h-8">
        <div className="flex gap-2 items-center h-7.5">
          <CatEngineAdvFilter />
          <LeftCatEngineToolbar view={view} setView={setView} />
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
            onDateSelect={setDateRange}
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
        <ResizablePanel className="min-h-0 h-full flex flex-col gap-4 min-w-0 flex-1">
          {view === 'table' && <DataTable table={table} />}
          {view === 'group' && (
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
                  value={item.id}
                  className="flex flex-col [[data-state=open]]:min-h-0 [[data-state=open]]:h-full"
                >
                  <AccordionTrigger className={cn('p-0 py-1 px-2 hover:no-underline')}>
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
                        100
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent
                    className="h-full min-h-0 flex flex-col"
                    wrapperClassName="h-full min-h-0 flex flex-col"
                  >
                    <DataTable table={table} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-background" />
        <ResizablePanel className="w-sm max-w-md">
          <CatEngineTxnView />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
