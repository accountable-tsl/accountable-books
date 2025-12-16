import { type Cell, flexRender, type Row } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import React from 'react';

import { TableBody, TableCell, TableRow } from '@/components/CustomTable';
import { RowViewer } from '@/components/data-table/row-view/row-viewer';
import type { CustomTable } from '@/components/data-table/types/data-table';
import type { RowViewerProps } from '@/components/data-table/types/row-click';
import { isClickInsideExcludedElement } from '@/components/data-table/utils/table';
import { cn } from '@/lib/utils';

import { getColumnStyle } from './utils/column-sizing';

interface DataTableBodyProps<TData> {
  table: CustomTable<TData>;
}
export function DataTableBody<TData>({ table }: DataTableBodyProps<TData>) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { virtualization, customClassNames } = table.customOptions || {};
  const { tableBody, tableBodyCell, tableBodyRow, emptyTableRow } =
    customClassNames || {};

  const rows = React.useMemo(
    () => table.getRowModel().rows,
    [table.getRowModel().rows],
  );

  const enableVirtual = virtualization?.enabled ?? false;
  const estimatedRowHeight = virtualization?.estimatedRowHeight ?? 60;
  const overscan = virtualization?.overscan ?? 5;

  const virtualizer = useVirtualizer<HTMLDivElement, Element>({
    count: rows.length,
    estimateSize: () => estimatedRowHeight,
    getScrollElement: () => scrollRef.current,
    enabled: enableVirtual,
    overscan,
  });

  // // Reset virtualizer and scroll to top when sorting changes
  // useEffect(() => {
  //   if (enableVirtual) {
  //     virtualizer.scrollToIndex(0);
  //     virtualizer.measure();
  //     // Debug: log measured sizes
  //     if (process.env.NODE_ENV !== "production") {
  //       // @ts-ignore
  //       const measurements = virtualizer?.measurementsCache;
  //       // eslint-disable-next-line no-console
  //       console.log("[Virtualizer] Measurements after sort:", measurements);
  //     }
  //   }
  // }, [table.getState().sorting, virtualizer, enableVirtual]);

  const virtualItems =
    enableVirtual && scrollRef.current ? virtualizer.getVirtualItems() : [];

  const rowClick = table.customOptions?.rowClick;
  const rowClickEnabled = !!rowClick || false;
  const viewedRow = rowClick?.viewedRow;
  const shouldShowViewer = rowClick?.mode === 'view' && !!viewedRow;
  // Check if any columns are pinned

  const hasPinnedColumns =
    (table.getState().columnPinning?.left?.length ?? 0) > 0 ||
    (table.getState().columnPinning?.right?.length ?? 0) > 0;

  const rowViewerInfo: RowViewerProps<TData> | undefined =
    rowClick?.mode === 'view' && viewedRow
      ? {
          mode: 'view',
          wrapper: rowClick?.wrapper || 'sheet',
          render: rowClick.render,
          viewedRow,
          closeRowView: rowClick.closeRowView,
        }
      : undefined;

  function onRowClick(e: React.MouseEvent, row: Row<TData>) {
    if (!rowClick) return;

    if (!e.defaultPrevented && !isClickInsideExcludedElement(e)) {
      rowClick.handleRowClick?.(row);
    }
  }

  console.log(table.getCanSomeRowsExpand());

  const renderRow = (row: Row<TData>) => {
    // Use stable row key based on original data rather than sorted position
    const stableRowKey = row.id;

    // Extract key separately to pass directly to JSX (React requirement)
    const rowProps = {
      'data-index': stableRowKey,
      ref: (node: HTMLDivElement | null) => {
        if (node && enableVirtual) {
          virtualizer.measureElement(node);
        }
      },
      'data-state': row.getIsSelected() ? 'selected' : '',
      className: tableBodyRow,
      onClick: (e: React.MouseEvent) => onRowClick(e, row),
      style: {
        cursor: rowClickEnabled ? 'pointer' : 'default',
        minHeight: estimatedRowHeight + 'px',
      } as React.CSSProperties,
    };

    // Extract cell rendering - used by both pinned and non-pinned paths
    const renderCell = (
      cell: Cell<TData, unknown>,
      isPinned: 'left' | 'right' | false = false,
      needsBorder: 'right' | 'left' | false = false,
    ) => {
      const columnDef = table
        ._getColumnDefs()
        .find((c) => c.id === cell.column.id);
      const explicitSize = !!columnDef?.size;
      const colStyle = getColumnStyle({ column: cell, explicitSize });

      // Calculate pinned position
      // let pinnedStyle: React.CSSProperties = {};
      // if (isPinned) {
      //   const totalOffset =
      //     isPinned === 'left'
      //       ? cell.column.getStart('left')
      //       : cell.column.getAfter('right');

      //   pinnedStyle = {
      //     position: 'sticky',
      //     zIndex: 2,
      //     backgroundColor: 'var(--background)',
      //     [isPinned]: totalOffset,
      //   };
      // }

      const cellClassName = cn(
        tableBodyCell,
        cell.column.columnDef.meta?.cellClassName,
        needsBorder === 'right' ? 'border-r' : '',
        needsBorder === 'left' ? 'border-l' : '',
      );

      return (
        <TableCell
          key={cell.id}
          style={{ ...colStyle }}
          data-pinned={isPinned || undefined}
          className={cellClassName}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      );
    };

    if (hasPinnedColumns) {
      // Use TanStack's built-in methods to get cells
      const leftCells = row.getLeftVisibleCells();
      const centerCells = row.getCenterVisibleCells();
      const rightCells = row.getRightVisibleCells();

      return (
        <TableRow
          key={stableRowKey}
          {...rowProps}
          className={cn(hasPinnedColumns ? '!min-w-full' : '')}
        >
          {/* Left pinned cells */}
          <div
            className="flex flex-row items-center justify-center sticky left-0 z-10 bg-background border-r h-full"
            style={{ backgroundColor: 'inherit' }}
          >
            {leftCells.map((cell) => renderCell(cell, 'left'))}
          </div>

          <div className="flex-1 overflow-y-visible h-full">
            <div className="flex flex-row flex-nowrap whitespace-nowrap items-center h-full">
              {centerCells.map((cell) => renderCell(cell, false))}
            </div>
          </div>

          <div
            className="flex flex-row items-center justify-center sticky right-0 z-10 bg-background border-l h-full"
            style={{ backgroundColor: 'inherit' }}
          >
            {rightCells.map((cell) => renderCell(cell, 'right'))}
          </div>
        </TableRow>
      );
    }

    // Default rendering when pinning is disabled
    return (
      <TableRow key={stableRowKey} {...rowProps}>
        {row.getVisibleCells().map((cell) => renderCell(cell))}
      </TableRow>
    );
  };

  if (enableVirtual && virtualizer) {
    return (
      <TableBody
        ref={scrollRef}
        className={cn(tableBody, hasPinnedColumns ? 'overflow-y-visible' : '')}
      >
        <div
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {virtualItems.map((virtualRow) => (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                ...(hasPinnedColumns
                  ? { minWidth: 'max-content' }
                  : { width: '100%' }),
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderRow(rows[virtualRow.index])}
            </div>
          ))}
        </div>
      </TableBody>
    );
  }

  return (
    <>
      <TableBody
        className={cn(
          tableBody,
          hasPinnedColumns ? 'min-w-max overflow-y-visible' : '',
        )}
      >
        {rows?.length ? (
          rows.map((row) => renderRow(row))
        ) : (
          <TableRow className={emptyTableRow}>
            <TableCell className="min-h-24 w-full flex items-center justify-center">
              No results.
            </TableCell>
          </TableRow>
        )}
      </TableBody>

      {shouldShowViewer && rowViewerInfo && (
        <RowViewer rowViewerInfo={rowViewerInfo} />
      )}
    </>
  );
}

export const MemoizedDataTableBody = React.memo(
  DataTableBody,
  (prev, next) => prev.table.options.data === next.table.options.data,
) as typeof DataTableBody;
