import { flexRender } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { TableCell, TableHeader, TableRow } from '@/components/CustomTable';
import { DataTableResizer } from '@/components/data-table/data-table-resizer';
import type { DataTableProps } from '@/components/data-table/types/data-table';
import { cn } from '@/lib/utils';

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

    // // Calculate pinned position
    let pinnedStyle: React.CSSProperties = {};
    if (isPinned) {
      const totalOffset =
        isPinned === 'left'
          ? header.column.getStart('left')
          : header.column.getAfter('right');

      pinnedStyle = {
        position: 'sticky',
        zIndex: 2,
        backgroundColor: 'var(--background-primary)',
        [isPinned]: totalOffset,
      };
    }

    return (
      <TableCell
        key={header.id}
        variant="header"
        style={{ ...colStyle }}
        data-column-resizing={
          header.column.getIsResizing() ? 'true' : undefined
        }
        data-pinned={isPinned || undefined}
        className={cn(
          tableHeaderCell,
          hasPinnedColumns
            ? 'bg-muted/40 data-[state=selected]:bg-muted h-full flex items-center'
            : '',
        )}
      >
        {header.isPlaceholder ? null : (
          <>
            {canSort ? (
              <div
                className="flex items-center cursor-pointer select-none"
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
          'bg-background sticky top-0 z-20',
          tableHeader,
          hasPinnedColumns ? 'overflow-y-visible' : '',
        )}
      >
        <TableRow
          variant="header"
          className={cn(
            tableHeaderRow,
            'border-collapse',
            hasPinnedColumns ? 'min-w-max' : '',
          )}
        >
          <div className="flex flex-row items-center justify-center sticky !left-0 z-30 bg-background min-h-10 h-10 border-r border-b border-collapse">
            {leftGroups.map((header) => renderHeaderCell(header, 'left'))}
          </div>

          <div className="flex-1 overflow-y-visible h-full">
            <div className="flex flex-row flex-nowrap whitespace-nowrap items-center h-full bg-background min-h-10 h-10 border-b border-collapse">
              {centerGroups.map((header) => renderHeaderCell(header, false))}
            </div>
          </div>

          <div className="flex flex-row items-center justify-center sticky right-0 z-30 bg-background min-h-10 h-10 border-l h-full border-b border-collapse">
            {rightGroups.map((header) => renderHeaderCell(header, 'right'))}
          </div>
        </TableRow>
      </TableHeader>
    );
  }
  // Default rendering when no pinning
  return (
    <TableHeader className={cn('bg-background sticky top-0 z-10', tableHeader)}>
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
