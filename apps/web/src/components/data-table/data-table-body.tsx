import type { CustomTable } from '@/components/data-table/types/data-table';
import type { RowViewerProps } from '@/components/data-table/types/row-click';
import type { Cell, Row } from '@tanstack/react-table';
import React from 'react';
import { TableBody, TableCell, TableRow } from '@/components/CustomTable';
import { RowViewer } from '@/components/data-table/row-view/row-viewer';
import { isClickInsideExcludedElement } from '@/components/data-table/utils/table';
import { cn } from '@/lib/utils';
import { flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

import { getColumnStyle } from './utils/column-sizing';

interface DataTableBodyProps<TData> {
  table: CustomTable<TData>;
}
export function DataTableBody<TData>({ table }: DataTableBodyProps<TData>) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fetchLockRef = React.useRef(false);
  const { virtualization, customClassNames, expandableRows } =
    table.customOptions || {};
  const infiniteScroll = table.customOptions?.infiniteScroll;
  const { tableBody, tableBodyCell, tableBodyRow, emptyTableRow } =
    customClassNames || {};

  // Determine which row model to use based on expandable rows setting
  // Use getExpandedRowModel().flatRows when expandable rows are enabled
  // This automatically includes all visible rows (parent + expanded sub-rows)
  const rowsToRender = React.useMemo(() => {
    return table.getRowModel().rows;
  }, [
    expandableRows?.enabled,
    table.getRowModel().rows,
    table.getState().expanded, // Critical: react to expansion state changes
  ]);

  const enableVirtual = virtualization?.enabled ?? false;
  const estimatedRowHeight = virtualization?.estimatedRowHeight ?? 60;
  const overscan = virtualization?.overscan ?? 5;

  React.useEffect(() => {
    if (!infiniteScroll?.isFetching) {
      fetchLockRef.current = false;
    }
  }, [infiniteScroll?.isFetching]);

  const handleScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!infiniteScroll?.enabled) return;
      if (!infiniteScroll?.onEndReached) return;
      if (infiniteScroll?.isFetching) return;
      if (infiniteScroll?.hasMore === false) return;
      if (fetchLockRef.current) return;

      const target = e.currentTarget;
      if (target.scrollHeight <= target.clientHeight) return;
      if (target.scrollTop <= 0) return;
      const threshold = infiniteScroll?.threshold ?? 200;
      const remaining =
        target.scrollHeight - target.scrollTop - target.clientHeight;

      if (remaining <= threshold) {
        fetchLockRef.current = true;
        infiniteScroll.onEndReached();
      }
    },
    [
      infiniteScroll?.enabled,
      infiniteScroll?.onEndReached,
      infiniteScroll?.isFetching,
      infiniteScroll?.hasMore,
      infiniteScroll?.threshold,
    ],
  );

  // Virtualizer count must match the number of rows we'll actually render
  // This updates automatically when rows expand/collapse
  const virtualizer = useVirtualizer<HTMLDivElement, Element>({
    count: rowsToRender.length, // Updates automatically when expansion state changes
    estimateSize: () => estimatedRowHeight,
    getScrollElement: () => scrollRef.current,
    enabled: enableVirtual,
    overscan,
  });

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

  // Helper function to calculate indentation
  const calculateIndent = (depth: number, indentSize: string): string => {
    const num = parseFloat(indentSize);
    const unit = indentSize.includes('rem')
      ? 'rem'
      : indentSize.includes('px')
        ? 'px'
        : 'rem';
    return `${depth * num}${unit}`;
  };

  const renderRow = (row: Row<TData>) => {
    // Use stable row key based on original data rather than sorted position
    const stableRowKey = row.id;
    const isSubRow = row.depth > 0; // TanStack provides depth automatically
    const indentSize = expandableRows?.indentSize ?? '1.5rem';

    // Extract key separately to pass directly to JSX (React requirement)
    const rowProps = {
      'data-index': stableRowKey,
      'data-depth': row.depth,
      ref: (node: HTMLDivElement | null) => {
        if (node && enableVirtual) {
          virtualizer.measureElement(node);
        }
      },
      'data-state': row.getIsSelected() ? 'selected' : '',
      className: cn(
        tableBodyRow,
        isSubRow
          ? cn(
              'relative conditional opacity-70 hover:opacity-100',
              expandableRows?.expandedRowClassName,
            )
          : '',
      ),
      onClick: (e: React.MouseEvent) => onRowClick(e, row),
      style: {
        cursor: rowClickEnabled ? 'pointer' : 'default',
        minHeight: estimatedRowHeight + 'px',
        // paddingLeft: isSubRow
        //   ? calculateIndent(row.depth, indentSize)
        //   : undefined, // Indent sub-rows using configured size
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
      const renderTableRow = (rowData: Row<TData>) => {
        const leftCells = rowData.getLeftVisibleCells();
        const centerCells = rowData.getCenterVisibleCells();
        const rightCells = rowData.getRightVisibleCells();

        return (
          <TableRow
            key={rowData.id}
            {...rowProps}
            className={cn(
              rowProps.className,
              tableBodyRow,
              isSubRow
                ? cn(
                    'conditional relative opacity-70 hover:opacity-100',
                    expandableRows?.expandedRowClassName,
                  )
                : '',
            )}
          >
            {/* Left pinned cells */}
            <div
              className={cn(
                'bg-background sticky left-0 z-10 flex h-full flex-row items-center justify-center border-r',
                isSubRow ? 'border-r-0' : '',
              )}
              style={{ backgroundColor: 'inherit' }}
            >
              {leftCells.map((cell) => renderCell(cell, 'left'))}
            </div>

            <div className="h-full flex-1">
              <div className="flex h-full flex-row flex-nowrap items-center whitespace-nowrap">
                {centerCells.map((cell) => renderCell(cell, false))}
              </div>
            </div>

            <div
              className={cn(
                'bg-background sticky right-0 z-10 flex h-full flex-row items-center justify-center border-l',
                isSubRow ? 'border-l-0' : '',
              )}
              style={{ backgroundColor: 'inherit' }}
            >
              {rightCells.map((cell) => renderCell(cell, 'right'))}
            </div>

            {isSubRow && (
              <div className="bg-muted/40 pointer-events-none absolute inset-0 z-10" />
            )}
          </TableRow>
        );
      };

      // CRITICAL: Don't render sub-rows manually
      // flatRows already includes them, and they're already in the array
      return <>{renderTableRow(row)}</>;
    }

    // Default rendering when pinning is disabled
    // CRITICAL: Don't render sub-rows manually
    // flatRows already includes them, and they're already in the array
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
        onScroll={handleScroll}
        className={cn(tableBody)}
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
                // minWidth: 'max-content',
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderRow(rowsToRender[virtualRow.index])}
            </div>
          ))}
        </div>
      </TableBody>
    );
  }

  return (
    // <div
    //   ref={scrollRef}
    //   onScroll={handleScroll}
    //   className="scrollbar-thin-2px relative flex min-h-0 flex-[1_1_auto] !flex-row overflow-y-auto"
    // >
    <>
      <TableBody className={cn(tableBody)} onScroll={handleScroll}>
        {rowsToRender?.length ? (
          rowsToRender.map((row) => renderRow(row))
        ) : (
          <TableRow className={emptyTableRow}>
            <TableCell className="flex min-h-24 w-full items-center justify-center">
              No results.
            </TableCell>
          </TableRow>
        )}
      </TableBody>

      {shouldShowViewer && rowViewerInfo && (
        <RowViewer rowViewerInfo={rowViewerInfo} />
      )}
    </>
    // </div>
  );
}

export const MemoizedDataTableBody = React.memo(
  DataTableBody,
  (prev, next) => prev.table.options.data === next.table.options.data,
) as typeof DataTableBody;
