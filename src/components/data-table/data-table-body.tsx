import React from "react";
import { CustomTable } from "@/components/data-table/types/data-table";
import { TableBody, TableRow, TableCell } from "@/components/CustomTable";
import { Cell, flexRender, Row } from "@tanstack/react-table";
import { getColumnStyle } from "./utils/column-sizing";
import { useVirtualizer } from "@tanstack/react-virtual";
import { isClickInsideExcludedElement } from "@/components/data-table/utils/table";
import { RowViewer } from "@/components/data-table/row-view/row-viewer";
import { RowViewerProps } from "@/components/data-table/types/row-click";

interface DataTableBodyProps<TData> {
  table: CustomTable<TData>;
}
export function DataTableBody<TData>({ table }: DataTableBodyProps<TData>) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { virtualization, customClassNames } = table.customOptions || {};
  const { tableBody, tableBodyCell, tableBodyRow } = customClassNames || {};

  const rows = React.useMemo(
    () => table.getRowModel().rows,
    [table.getRowModel().rows]
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
  const shouldShowViewer = rowClick?.mode === "view" && !!viewedRow;

  const rowViewerInfo: RowViewerProps<TData> | undefined =
    rowClick?.mode === "view" && viewedRow
      ? {
          mode: "view",
          wrapper: rowClick?.wrapper || "sheet",
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

  const renderRow = (row: Row<TData>) => {
    // Use stable row key based on original data rather than sorted position
    const stableRowKey = row.id;
    return (
      <TableRow
        key={stableRowKey}
        data-index={stableRowKey}
        ref={(node) => {
          if (node && enableVirtual) {
            virtualizer.measureElement(node);
          }
        }}
        data-state={row.getIsSelected() ? "selected" : ""}
        className={tableBodyRow}
        onClick={(e) => onRowClick(e, row)}
        style={{ cursor: rowClickEnabled ? "pointer" : "default" }}
      >
        {row.getVisibleCells().map((cell: Cell<TData, unknown>) => {
          const hasCheckbox =
            cell.getValue() === "checkbox" || cell.column.id === "select";

          const columnDef = table
            ._getColumnDefs()
            .find((c) => c.id === cell.column.id);
          const explicitSize = !!columnDef?.size;

          const colStyle = getColumnStyle({ column: cell, explicitSize });

          return (
            <TableCell
              key={cell.id}
              // style={hasCheckbox ? {} : colStyle}
              style={colStyle}
              className={tableBodyCell}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
              {/* Can also use cell.renderValue<any>(). Renders the value for a cell the same as getValue, but will return the renderFallbackValue if no value is found. */}
            </TableCell>
          );
        })}
      </TableRow>
    );
  };

  if (enableVirtual && virtualizer) {
    return (
      <TableBody ref={scrollRef} className={tableBody}>
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualItems.map((virtualRow) => (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
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
      <TableBody className={tableBody}>
        {rows?.length ? (
          rows.map((row) => renderRow(row))
        ) : (
          <TableRow className={tableBodyRow}>
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
  (prev, next) => prev.table.options.data === next.table.options.data
) as typeof DataTableBody;
