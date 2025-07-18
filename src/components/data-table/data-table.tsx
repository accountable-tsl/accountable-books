import { type Table as TanstackTable } from "@tanstack/react-table";
import * as React from "react";

import { cn } from "@/lib/utils";
import { DataTableBody, MemoizedDataTableBody } from "./data-table-body";
import { DataTableHeader } from "@/components/data-table/data-table-header";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table } from "@/components/CustomTable";

export interface DataTableProps<TData> extends React.ComponentProps<"div"> {
  table: TanstackTable<TData>; // TanStack table instance — provides all table state + render info
  actionBar?: React.ReactNode; // Optional UI element shown if there are selected rows
  debugTable?: boolean; // Optional debug flag
  tableWrapperClassName?: string; // Optional table container class

  virtualization?: {
    enabled: boolean;
    estimatedRowHeight?: number;
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
  const scrollRef = React.useRef<HTMLDivElement>(null);

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

  const BodyComponent = table.getState().columnSizingInfo.isResizingColumn
    ? MemoizedDataTableBody
    : DataTableBody;

  return (
    <div
      className={cn("flex flex-col w-full h-full min-h-0 gap-2.5", className)}
      {...props}
    >
      {/* Top-level children (e.g., filters, pagination controls, etc.) */}
      {children}

      {/* Main table */}
      <Table
        className={cn("min-w-full rounded-md overflow-clip border")}
        style={{
          ...columnSizeVars,
          // width: table.getTotalSize(),
          width: "100%",
        }}
      >
        <DataTableHeader table={table} />

        <BodyComponent table={table} virtualization={virtualization} />
      </Table>
      <div className="flex flex-col gap-2.5">
        {/* <DataTablePagination table={table} type={paginationStyle}/> */}
        {actionBar &&
          table.getFilteredSelectedRowModel().rows.length > 0 &&
          actionBar}
      </div>
    </div>
  );
}
