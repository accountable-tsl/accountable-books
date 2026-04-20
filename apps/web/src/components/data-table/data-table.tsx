import type { DataTableProps } from '@/components/data-table/types/data-table';
import * as React from 'react';
import { Table } from '@/components/CustomTable';
import { DataTableHeader } from '@/components/data-table/data-table-header';
import { DataTablePagination } from '@/components/data-table/data-table-pagination';
import { cn } from '@/lib/utils';

import { DataTableBody, MemoizedDataTableBody } from './data-table-body';

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
  ...props
}: DataTableProps<TData>) {
  const { customClassNames, pagination } = table.customOptions || {};
  const { wrapper, table: tableClass } = customClassNames || {};
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
  }, [table]);

  // const hasPinnedColumns =
  //   (table.getState().columnPinning?.left?.length ?? 0) > 0 ||
  //   (table.getState().columnPinning?.right?.length ?? 0) > 0;

  const BodyComponent = table.getState().columnSizingInfo.isResizingColumn
    ? MemoizedDataTableBody
    : DataTableBody;

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full flex-col gap-2.5',
        wrapper || '',
      )}
      {...props}
    >
      {/* Top-level children (e.g., filters, pagination controls, etc.) */}
      {children}

      {/* Main table */}
      <div className="relative flex w-full flex-1 flex-col overflow-hidden rounded-md border">
        <Table
          ref={scrollRef}
          className={cn(tableClass)}
          style={{
            ...columnSizeVars,
          }}
        >
          <DataTableHeader table={table} />

          <BodyComponent table={table} scrollRef={scrollRef} />
        </Table>
        {table.customOptions?.infiniteScroll?.isFetching && (
          <div className="bg-background/90 text-muted-foreground pointer-events-none absolute right-2 bottom-2 rounded-full border px-2 py-1 text-xs shadow-sm">
            Loading more…
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {/* Conditional pagination rendering */}
        {pagination?.enabled && pagination.style === 'standard' && (
          <DataTablePagination table={table} />
        )}
        {/* TODO: Add support for 'infinite' pagination style */}
        {actionBar &&
          table.getFilteredSelectedRowModel().rows.length > 0 &&
          actionBar}
      </div>
    </div>
  );
}
