import type { CustomTable } from '@/components/data-table/types/data-table';
import type { RowViewerProps } from '@/components/data-table/types/row-click';
import type { Cell, Row } from '@tanstack/react-table';
import type { VirtualItem } from '@tanstack/react-virtual';
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
  scrollRef: React.RefObject<HTMLDivElement>;
}
export function DataTableBody<TData>({
  table,
  scrollRef,
}: DataTableBodyProps<TData>) {
  const fetchLockRef = React.useRef(false);
  const { virtualization, customClassNames, expandableRows, infiniteScroll } =
    table.customOptions || {};
  const { tableBody, tableBodyCell, tableBodyRow, emptyTableRow } =
    customClassNames || {};
  const infiniteEnabled = infiniteScroll?.enabled ?? false;
  const hasNextPage = infiniteScroll?.hasNextPage ?? false;
  const isFetching = infiniteScroll?.isFetching ?? false;
  const thresholdRows = infiniteScroll?.threshold ?? 6;

  // Determine which row model to use based on expandable rows setting
  // Use getExpandedRowModel().flatRows when expandable rows are enabled
  // This automatically includes all visible rows (parent + expanded sub-rows)
  const rowModel = table.getRowModel();
  const rowsToRender = React.useMemo(() => {
    return rowModel.rows;
  }, [rowModel.rows]);

  const enableVirtual = virtualization?.enabled ?? false;
  const estimatedRowHeight = virtualization?.estimatedRowHeight ?? 60;
  const overscan = virtualization?.overscan ?? 5;
  const shouldMeasure = virtualization?.measure ?? true;
  const fixedRowHeight = virtualization?.fixedRowHeight ?? false;
  const thresholdPx = thresholdRows * estimatedRowHeight;

  // Virtualizer count must match the number of rows we'll actually render
  // This updates automatically when rows expand/collapse
  const virtualizer = useVirtualizer<HTMLDivElement, Element>({
    count: rowsToRender.length, // Updates automatically when expansion state changes
    estimateSize: () => estimatedRowHeight,
    getScrollElement: () => scrollRef.current,
    enabled: enableVirtual,
    overscan,
  });

  const emptyVirtualItems = React.useMemo(() => [] as VirtualItem[], []);
  const virtualItems =
    enableVirtual && scrollRef.current
      ? virtualizer.getVirtualItems()
      : emptyVirtualItems;

  const rowClick = table.customOptions?.rowClick;
  const rowClickEnabled = !!rowClick || false;
  const viewedRow = rowClick?.viewedRow;
  const shouldShowViewer = rowClick?.mode === 'view' && !!viewedRow;
  // Check if any columns are pinned

  const hasPinnedColumns =
    (table.getState().columnPinning?.left?.length ?? 0) > 0 ||
    (table.getState().columnPinning?.right?.length ?? 0) > 0;

  const triggerFetchNextPage = React.useCallback(() => {
    if (!infiniteEnabled || !hasNextPage || isFetching) return;
    if (fetchLockRef.current || !infiniteScroll?.fetchNextPage) return;
    fetchLockRef.current = true;
    void Promise.resolve(infiniteScroll.fetchNextPage()).finally(() => {
      fetchLockRef.current = false;
    });
  }, [hasNextPage, infiniteEnabled, infiniteScroll, isFetching]);

  React.useEffect(() => {
    if (!enableVirtual || !infiniteEnabled) return;
    if (!hasNextPage || isFetching) return;
    if (virtualItems.length === 0) return;
    const lastVirtualRow = virtualItems[virtualItems.length - 1];
    if (!lastVirtualRow) return;
    if (lastVirtualRow.index >= rowsToRender.length - 1 - thresholdRows) {
      triggerFetchNextPage();
    }
  }, [
    enableVirtual,
    hasNextPage,
    infiniteEnabled,
    isFetching,
    rowsToRender.length,
    thresholdRows,
    triggerFetchNextPage,
    virtualItems,
  ]);

  React.useEffect(() => {
    if (enableVirtual || !infiniteEnabled) return;
    const scrollParent = scrollRef.current;
    if (!scrollParent) return;

    const onScroll = () => {
      if (!infiniteEnabled || !hasNextPage || isFetching) return;
      if (fetchLockRef.current) return;
      const distanceToBottom =
        scrollParent.scrollHeight -
        scrollParent.scrollTop -
        scrollParent.clientHeight;

      if (distanceToBottom <= thresholdPx) {
        triggerFetchNextPage();
      }
    };

    onScroll();
    scrollParent.addEventListener('scroll', onScroll);

    return () => {
      scrollParent.removeEventListener('scroll', onScroll);
    };
  }, [
    enableVirtual,
    hasNextPage,
    infiniteEnabled,
    isFetching,
    thresholdPx,
    triggerFetchNextPage,
    scrollRef,
  ]);

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
  // const calculateIndent = (depth: number, indentSize: string): string => {
  //   const num = parseFloat(indentSize);
  //   const unit = indentSize.includes('rem')
  //     ? 'rem'
  //     : indentSize.includes('px')
  //       ? 'px'
  //       : 'rem';
  //   return `${depth * num}${unit}`;
  // };

  const renderRow = (row: Row<TData>) => {
    // Use stable row key based on original data rather than sorted position
    const stableRowKey = row.id;
    const isSubRow = row.depth > 0; // TanStack provides depth automatically
    // const indentSize = expandableRows?.indentSize ?? '1.5rem';

    // Extract key separately to pass directly to JSX (React requirement)
    const rowProps = {
      'data-index': stableRowKey,
      'data-depth': row.depth,
      ref: (node: HTMLDivElement | null) => {
        if (node && enableVirtual && shouldMeasure) {
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
        height:
          enableVirtual && fixedRowHeight
            ? estimatedRowHeight + 'px'
            : undefined,
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
      const explicitSize = !!cell.column.columnDef.size;
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
      <>
        <TableBody className={cn(tableBody)}>
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

        {shouldShowViewer && rowViewerInfo && (
          <RowViewer rowViewerInfo={rowViewerInfo} />
        )}
      </>
    );
  }

  return (
    // <div
    //   ref={scrollRef}
    //   className="scrollbar-thin-2px relative flex min-h-0 flex-[1_1_auto] !flex-row overflow-y-auto"
    // >
    <>
      <TableBody className={cn(tableBody)}>
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
