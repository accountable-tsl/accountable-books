import { type Table as TanstackTable } from "@tanstack/react-table";
import * as React from "react";

import { Table } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DataTableBody, MemoizedDataTableBody } from "./data-table-body";
import { DataTableHeader } from "@/components/data-table/data-table-header";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface DataTableProps<TData> extends React.ComponentProps<"div"> {
  table: TanstackTable<TData>; // TanStack table instance — provides all table state + render info
  actionBar?: React.ReactNode; // Optional UI element shown if there are selected rows
  debugTable?: boolean; // Optional debug flag
  tableWrapperClassName?: string; // Optional table container class

  virtualization?: {
    enabled: boolean;
    estimatedRowHeight?: number;
    overscan?: number;
  };
}

/**
 * Generic, flexible data table wrapper built with TanStack Table v8.
 *
 * Responsibilities:
 * - Render a table layout using your UI component primitives
 * - Delegate table logic (sorting, filtering, selection, etc.) to TanStack Table instance
 * - Show a conditional "action bar" only when rows are selected
 * - Allow additional children above the table (e.g. filters, pagination, info)
 */
export function DataTable<TData>({
  table,
  actionBar,
  children,
  className,
  debugTable,
  tableWrapperClassName,
  virtualization,

  ...props
}: DataTableProps<TData>) {
  const tableContainerRef = React.useRef<HTMLTableElement>(null);

  /**
   * Instead of calling `column.getSize()` on every render for every header
   * and especially every data cell (very expensive),
   * we will calculate all column sizes at once at the root table level in a useMemo
   * and pass the column sizes down as CSS variables to the <table> element.
   */
  const columnSizeVars = React.useMemo(() => {
    const headers = table?.getFlatHeaders();
    const colSizes: { [key: string]: number } = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]!;
      colSizes[`--header-${header.id}-size`] = header.getSize();
      colSizes[`--col-${header.column.id}-size`] = header.column.getSize();
    }
    return colSizes;
  }, [table.getState().columnSizingInfo, table.getState().columnSizing]);

  const rows = React.useMemo(
    () => table.getRowModel().rows,
    [table.getRowModel().rows]
  );

  const enableVirtual = virtualization?.enabled ?? false;
  const estimatedRowHeight = virtualization?.estimatedRowHeight ?? 48;

  const rowVirtualizer = useVirtualizer<HTMLTableElement, Element>({
    count: rows.length,
    estimateSize: () => estimatedRowHeight,
    getScrollElement: () => tableContainerRef.current,
  });

  const BodyComponent = table.getState().columnSizingInfo.isResizingColumn
    ? MemoizedDataTableBody
    : DataTableBody;

  return (
    <div className={cn("flex w-full flex-col gap-2.5", className)} {...props}>
      {/* Top-level children (e.g., filters, pagination controls, etc.) */}
      {children}

      {/* Main table container */}
      <div
        ref={tableContainerRef}
        aria-label="Data table"
        className={cn(
          "rounded-md border table-container",
          "relative overflow-y-auto max-h-[500px] scrollbar-thin-2px",
          tableWrapperClassName
        )}
      >
        <Table
          className={cn("min-w-full relative")}
          style={{
            ...columnSizeVars,
            width: table.getTotalSize(),
            // ...(enableVirtual ? { height: rowVirtualizer.getTotalSize() } : {}),
          }}
        >
          <DataTableHeader table={table} />

          <BodyComponent
            table={table}
            rows={rows}
            virtualizationEnabled={enableVirtual}
            rowVirtualizer={rowVirtualizer}
          />
        </Table>
      </div>
      <div className="flex flex-col gap-2.5">
        {/* <DataTablePagination table={table} type={paginationStyle}/> */}
        {actionBar &&
          table.getFilteredSelectedRowModel().rows.length > 0 &&
          actionBar}
      </div>
    </div>
  );
}
