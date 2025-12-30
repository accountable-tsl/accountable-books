import type { DataTableProps } from '@/components/data-table/types/data-table';
import { TableCell, TableHeader, TableRow } from '@/components/CustomTable';
import { DataTableResizer } from '@/components/data-table/data-table-resizer';
import { cn } from '@/lib/utils';
import { flexRender } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { getColumnStyle } from './utils/column-sizing';

export function DataTableHeader<TData>({ table }: DataTableProps<TData>) {
  const { tableHeader, tableHeaderRow, tableHeaderCell } =
    table.customOptions?.customClassNames || {};
  const sortingEnabled = table.customOptions?.sorting?.enabled !== false;

  // Check if any columns are pinned
  const hasPinnedColumns =
    (table.getState().columnPinning?.left?.length ?? 0) > 0 ||
    (table.getState().columnPinning?.right?.length ?? 0) > 0;

  const renderHeaderCell = (
    header: any,
    isPinned: 'left' | 'right' | false = false,
  ) => {
    const columnDef = table._getColumnDefs().find((c) => c.id === header.id);
    const explicitSize = !!columnDef?.size;
    const colStyle = getColumnStyle({ column: header, explicitSize });

    // Only allow sorting if globally enabled and column allows it
    const canSort = sortingEnabled && header.column.getCanSort();

    return (
      <TableCell
        key={header.id}
        variant="header"
        style={{ ...colStyle }}
        data-column-resizing={
          header.column.getIsResizing() ? 'true' : undefined
        }
        data-pinned={isPinned || undefined}
        className={cn(tableHeaderCell)}
      >
        {header.isPlaceholder ? null : (
          <>
            {canSort ? (
              <div
                className="flex cursor-pointer select-none items-center"
                role="button"
                tabIndex={0}
                aria-label={`Sort by ${flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}`}
                onClick={() =>
                  header.column.toggleSorting(
                    header.column.getIsSorted() === 'asc',
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    header.column.toggleSorting(
                      header.column.getIsSorted() === 'asc',
                    );
                  }
                }}
              >
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
                <span className="ml-2">
                  {header.column.getIsSorted() === 'asc' ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : header.column.getIsSorted() === 'desc' ? (
                    <ArrowDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3" />
                  )}
                </span>
              </div>
            ) : (
              flexRender(header.column.columnDef.header, header.getContext())
            )}
          </>
        )}
        {header.column.getCanResize() && <DataTableResizer header={header} />}
      </TableCell>
    );
  };

  if (hasPinnedColumns) {
    const leftGroups = table.getLeftFlatHeaders();
    const centerGroups = table.getCenterFlatHeaders();
    const rightGroups = table.getRightFlatHeaders();

    return (
      <TableHeader
        className={cn(
          tableHeader,
          'z-30',
          // hasPinnedColumns ? 'overflow-y-visible' : '',
        )}
      >
        <TableRow
          variant="header"
          className={cn(
            tableHeaderRow,
            'relative border-collapse',
            hasPinnedColumns ? 'min-w-max' : '',
          )}
        >
          <div className="bg-sidebar-accent sticky !left-0 z-30 flex h-10 min-h-10 border-collapse flex-row items-center justify-center border-b border-r">
            {leftGroups.map((header) => renderHeaderCell(header, 'left'))}
          </div>

          <div className="h-full flex-1 overflow-y-visible">
            <div className="bg-sidebar-accent flex h-10 min-h-10 border-collapse flex-row flex-nowrap items-center whitespace-nowrap border-b">
              {centerGroups.map((header) => renderHeaderCell(header, false))}
            </div>
          </div>

          <div className="bg-sidebar-accent sticky !right-0 z-30 flex h-10 min-h-10 border-collapse flex-row items-center justify-center border-b border-l">
            {rightGroups.map((header) => renderHeaderCell(header, 'right'))}
          </div>
        </TableRow>
      </TableHeader>
    );
  }
  // Default rendering when no pinning
  return (
    <TableHeader className={cn(tableHeader)}>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow
          key={headerGroup.id}
          variant="header"
          className={tableHeaderRow}
        >
          {headerGroup.headers.map((header) => renderHeaderCell(header))}
        </TableRow>
      ))}
    </TableHeader>
  );
}
