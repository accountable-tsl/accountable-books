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
  scrollRef: React.RefObject<HTMLDivElement | null>;
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

  // TanStack Virtual caches row positions and doesn't invalidate them when
  // estimateSize changes (the estimate isn't part of its measurement memo
  // key), so force a re-measure when the estimated height changes.
  React.useEffect(() => {
    if (!enableVirtual) return;
    virtualizer.measure();
  }, [enableVirtual, estimatedRowHeight, virtualizer]);

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

  // --- Keyboard row navigation (opt-in via customOptions.keyboardNavigation) ---
  const keyboardNav = table.customOptions?.keyboardNavigation;
  const keyboardNavEnabled = keyboardNav?.enabled ?? false;
  const activateOnNavigate = keyboardNav?.activateOnNavigate ?? false;

  const [activeRowId, setActiveRowId] = React.useState<string | null>(null);
  // Refs let the stable keydown handler read current values without
  // re-subscribing on every data, highlight, or key-config change.
  const activeRowIdRef = React.useRef<string | null>(null);
  const rowsToRenderRef = React.useRef(rowsToRender);
  rowsToRenderRef.current = rowsToRender;
  const rowClickRef = React.useRef(rowClick);
  rowClickRef.current = rowClick;
  const navKeysRef = React.useRef({
    next: keyboardNav?.keys?.next ?? ['ArrowDown'],
    prev: keyboardNav?.keys?.prev ?? ['ArrowUp'],
  });
  navKeysRef.current = {
    next: keyboardNav?.keys?.next ?? ['ArrowDown'],
    prev: keyboardNav?.keys?.prev ?? ['ArrowUp'],
  };

  const setActiveRow = React.useCallback((rowId: string | null) => {
    activeRowIdRef.current = rowId;
    setActiveRowId(rowId);
  }, []);

  React.useEffect(() => {
    if (!keyboardNavEnabled) return;
    const scrollParent = scrollRef.current;
    if (!scrollParent) return;

    const scrollRowIntoView = (index: number) => {
      // Scroll by measured DOM geometry rather than virtualizer.scrollToIndex
      // or scrollIntoView: the sticky header lives inside the scroll
      // container, so the virtualizer over-counts the viewport (rows land
      // hidden below the fold) and scrollIntoView would tuck rows behind the
      // stuck header and can also reset horizontal scroll. Adjacent rows are
      // always rendered (overscan), so the element is available.
      const rowEl = scrollParent.querySelector<HTMLElement>(
        `[data-slot="table-row"][data-index="${index}"]`,
      );
      if (!rowEl) {
        // Far jump beyond the rendered window — let the virtualizer get close.
        if (enableVirtual) virtualizer.scrollToIndex(index, { align: 'auto' });
        return;
      }
      const containerRect = scrollParent.getBoundingClientRect();
      const rowRect = rowEl.getBoundingClientRect();
      const headerEl = scrollParent.querySelector<HTMLElement>(
        '[data-slot="table-header"]',
      );
      const visibleTop = headerEl
        ? headerEl.getBoundingClientRect().bottom
        : containerRect.top;
      if (rowRect.bottom > containerRect.bottom) {
        scrollParent.scrollTop += rowRect.bottom - containerRect.bottom;
      } else if (rowRect.top < visibleTop) {
        scrollParent.scrollTop -= visibleTop - rowRect.top;
      }
    };

    const firstVisibleIndex = () => {
      // Virtual: the first row actually in view (range excludes overscan).
      // Non-virtual tables start from the top.
      if (enableVirtual) return virtualizer.range?.startIndex ?? 0;
      return 0;
    };

    const activateRow = (row: Row<TData>) => {
      rowClickRef.current?.handleRowClick?.(row);
    };

    const moveToIndex = (
      rows: Row<TData>[],
      index: number,
      activate: boolean,
    ) => {
      const row = rows[index];
      if (!row || row.id === activeRowIdRef.current) return;
      setActiveRow(row.id);
      scrollRowIntoView(index);
      if (activate) activateRow(row);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const { key } = event;
      const isNext = navKeysRef.current.next.includes(key);
      const isPrev = navKeysRef.current.prev.includes(key);
      if (!isNext && !isPrev && key !== 'Enter' && key !== 'Escape') return;

      // Let editable cells, buttons, links, and menus keep their own keys.
      if (
        event.target !== scrollParent &&
        isClickInsideExcludedElement(event)
      ) {
        return;
      }

      if (key === 'Escape') {
        setActiveRow(null);
        return;
      }

      const rows = rowsToRenderRef.current;
      if (rows.length === 0) return;
      event.preventDefault();

      const currentIndex = activeRowIdRef.current
        ? rows.findIndex((r) => r.id === activeRowIdRef.current)
        : -1;

      // No highlight yet (fresh page load): any nav key or Enter starts at
      // the first visible row; Enter also activates it.
      if (currentIndex === -1) {
        moveToIndex(
          rows,
          firstVisibleIndex(),
          key === 'Enter' || activateOnNavigate,
        );
        return;
      }

      if (key === 'Enter') {
        activateRow(rows[currentIndex]!);
        return;
      }

      const delta = isNext ? 1 : -1;
      const nextIndex = Math.min(
        Math.max(currentIndex + delta, 0),
        rows.length - 1,
      );
      moveToIndex(rows, nextIndex, activateOnNavigate);
    };

    // Land-and-navigate: focus the table on mount when nothing else holds
    // focus, so arrows/Enter work without clicking a row first.
    if (
      document.activeElement === document.body ||
      document.activeElement === null
    ) {
      scrollParent.focus({ preventScroll: true });
    }

    scrollParent.addEventListener('keydown', onKeyDown);
    return () => scrollParent.removeEventListener('keydown', onKeyDown);
  }, [
    keyboardNavEnabled,
    activateOnNavigate,
    enableVirtual,
    virtualizer,
    scrollRef,
    setActiveRow,
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
    if (e.defaultPrevented || isClickInsideExcludedElement(e)) return;

    if (keyboardNavEnabled) {
      // Sync the highlight to the clicked row and focus the container so
      // arrows work right after a click (Safari doesn't focus a tabindex
      // ancestor on click). Skipped for clicks on interactive elements
      // (guard above) so editable cells keep their focus.
      scrollRef.current?.focus({ preventScroll: true });
      setActiveRow(row.id);
    }

    rowClick?.handleRowClick?.(row);
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

  const renderRow = (row: Row<TData>, index: number) => {
    // Use stable row key based on original data rather than sorted position
    const stableRowKey = row.id;
    const isSubRow = row.depth > 0; // TanStack provides depth automatically
    const isActiveRow = keyboardNavEnabled && row.id === activeRowId;
    // const indentSize = expandableRows?.indentSize ?? '1.5rem';

    // Extract key separately to pass directly to JSX (React requirement)
    const rowProps = {
      // Must be the item index, not row.id: the virtualizer's measureElement
      // reads data-index to map an element back to its virtual item.
      'data-index': index,
      'data-depth': row.depth,
      ref: (node: HTMLDivElement | null) => {
        if (node && enableVirtual && shouldMeasure) {
          virtualizer.measureElement(node);
        }
      },
      'data-state': row.getIsSelected() ? 'selected' : '',
      'data-active': isActiveRow || undefined,
      className: cn(
        tableBodyRow,
        isSubRow
          ? cn(
              'relative conditional opacity-70 hover:opacity-100',
              expandableRows?.expandedRowClassName,
            )
          : '',
        // Keyboard-nav highlight. Must be a background (like hover/selected):
        // the pinned sticky sections inherit the row background, so a ring or
        // border would be covered by them and only show in the center gap.
        // transition-none overrides the row's transition-all: a background
        // fading out while the viewport jumps reads as flicker/ghosting.
        keyboardNavEnabled ? 'transition-none' : '',
        isActiveRow ? 'bg-muted' : '',
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
                {renderRow(rowsToRender[virtualRow.index], virtualRow.index)}
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
    // </div>
    <>
      <TableBody className={cn(tableBody)}>
        {rowsToRender?.length ? (
          rowsToRender.map((row, index) => renderRow(row, index))
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
  );
}

export const MemoizedDataTableBody = React.memo(
  DataTableBody,
  (prev, next) => prev.table.options.data === next.table.options.data,
) as typeof DataTableBody;
