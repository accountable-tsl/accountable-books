import { cn } from "@/lib/utils";
import { useCallback, useMemo, useState } from "react";
import { useDataTable } from "@/components/data-table/use-data-table";
import { DataTable } from "@/components/data-table/data-table";
import { getCatEngineColumns } from "@/features/cat-engine/config/table-columns";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  LeftCatEngineToolbar,
  RightCatEngineToolbar,
} from "@/features/cat-engine/components/cat-engine-toolbar";
import { useIsMobile } from "@/shared/hooks/use-media-query";
import { SmallScreenMessage } from "@/components/SmallScreenMessage";
import { DataTableInputOptions } from "@/components/data-table/types/data-table";
import { Badge } from "@/components/ui/badge";
import { CatEngineAdvFilter } from "@/features/cat-engine/components/cat-engine-adv-filter";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/date-picker/date-range-picker";

const accordionItems = [
  {
    id: "high-confidence",
    title: "High Confidence",
    className: "text-green-600",
    tableClassName: "border-green-300 dark:border-green-950",
    tableHeaderClassName: "bg-green-50 dark:bg-green-950",
  },
  {
    id: "medium-confidence",
    title: "Medium Confidence",
    className: "text-yellow-500",
    tableClassName: "border-yellow-300 dark:border-yellow-950/50",
    tableHeaderClassName: "bg-yellow-100 dark:bg-yellow-950",
  },
  {
    id: "low-confidence",
    title: "Low Confidence",
    className: "text-red-600",
    tableClassName: "border-red-300 dark:border-red-950",
    tableHeaderClassName:
      "bg-red-50 text-red-600 dark:bg-red-950 dark:text-white/70",
  },
  {
    id: "reviewed",
    title: "Reviewed & Posted",
    className: "text-blue-600",
    tableClassName: "border-blue-300 dark:border-blue-950",
    tableHeaderClassName: "bg-blue-100 dark:bg-blue-950",
  },
];

export function CatEngine() {
  const [view, setView] = useState<"table" | "group">("table");
  const [rowHeight, setRowHeight] = useState<"min" | "mid" | "max">("mid");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [openAccordionItem, setOpenAccordionItem] = useState<string>(
    accordionItems[0].id
  );
  const [dateRange, setDateRange] = useState<{
    from: Date;
    to?: Date;
  }>({
    from: new Date(), // start of the curr month if less than 10 days, else start of the prev month
    to: new Date(),
  });

  const isMobile = useIsMobile();
  const columns = useMemo(() => getCatEngineColumns(), []);
  const emptyData = useMemo(() => [], []);

  const customOptions: DataTableInputOptions<any> = useMemo(() => {
    return {
      virtualizer: {
        enabled: true,
      },
      customClassNames: {
        wrapper: `gap-0`,
        table: `flex-1 h-full ${
          view === "group"
            ? accordionItems.find((item) => item.id === openAccordionItem)
                ?.tableClassName
            : ""
        }`,
        tableHeader: `sticky top-0 z-10 ${
          view === "group"
            ? accordionItems.find((item) => item.id === openAccordionItem)
                ?.tableHeaderClassName
            : ""
        }`,
        emptyTableRow: "h-full",
      },
    };
  }, [view, openAccordionItem]);
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

  if (isMobile) return <SmallScreenMessage />;

  console.log(dateRange);
  return (
    <div className="min-h-0 h-full flex flex-col p-4 gap-4">
      <div className="flex justify-between items-center overflow-clip h-8 max-h-8">
        <div className="flex gap-2 items-center h-7.5">
          <CatEngineAdvFilter />
          <LeftCatEngineToolbar view={view} setView={setView} />
          <div className="h-full">
            <Input placeholder="Search..." className="w-60 h-full" />
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

      {view === "table" && <DataTable table={table} />}

      {view === "group" && (
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
              <AccordionTrigger
                className={cn("p-0 py-1 px-2 hover:no-underline")}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "hover:underline",
                      item.id === openAccordionItem
                        ? item.className
                        : "text-muted-foreground font-light"
                    )}
                  >
                    {item.title}
                  </span>
                  <Badge
                    variant={
                      item.id === openAccordionItem ? "default" : "outline"
                    }
                    className={cn(
                      "text-xs",
                      item.id === openAccordionItem
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
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
    </div>
  );
}
