import React from "react";
import { DataTableProps } from "@/components/data-table/types";
import { TableBody, TableRow, TableCell } from "@/components/CustomTable";
import { flexRender } from "@tanstack/react-table";
import { getColumnStyle } from "./utils/column-sizing";
import { useVirtualizer } from "@tanstack/react-virtual";

interface DataTableBodyProps<TData> {
  table: DataTableProps<TData>["table"];
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
  const estimatedRowHeight = virtualization?.estimatedRowHeight ?? 35;
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

  const virtualItems = scrollRef.current ? virtualizer.getVirtualItems() : [];

  const renderRow = (row: any) => {
    // Use stable row key based on original data rather than sorted position
    const stableRowKey = row.original?.id || row.id;
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
      >
        {row.getVisibleCells().map((cell: any) => {
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
    <TableBody className={tableBody}>
      {rows?.length ? (
        rows.map((row) => renderRow(row))
      ) : (
        <TableRow className={tableBodyRow}>
          <TableCell className="h-24 text-center">No results.</TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}

export const MemoizedDataTableBody = React.memo(
  DataTableBody,
  (prev, next) => prev.table.options.data === next.table.options.data
) as typeof DataTableBody;
