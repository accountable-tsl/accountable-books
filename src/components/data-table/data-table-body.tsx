import React from "react";
import { DataTableProps } from "@/components/data-table/data-table";
import { TableBody, TableRow, TableCell } from "@/components/CustomTable";
import { flexRender, Row } from "@tanstack/react-table";

interface DataTableBodyProps<TData> {
  table: DataTableProps<TData>["table"];
  rows: Row<TData>[];
  virtualization?: DataTableProps<TData>["virtualization"];
  virtualizationEnabled?: boolean;
  rowVirtualizer?: any; // ReturnType<typeof useVirtualizer>;
}
export function DataTableBody<TData>({
  table,
  rows,
  virtualizationEnabled,
  rowVirtualizer,
}: DataTableBodyProps<TData>) {
  const virtualItems = rowVirtualizer.getVirtualItems();

  if (virtualizationEnabled && virtualItems) {
    return (
      <TableBody className="overflow-y-auto max-h-[500px]">
        {/* Top spacer */}
        {virtualItems.length > 0 && (
          <TableRow style={{ height: `${virtualItems[0].start}px` }}>
            <TableCell
              // colSpan={table.getAllColumns().length}
              style={{ padding: 0, border: "none", background: "transparent" }}
            />
          </TableRow>
        )}

        {/* Virtualized rows */}
        {virtualItems.map((virtualRow: any) => {
          const row = rows[virtualRow.index];

          return (
            <TableRow
              data-index={virtualRow.index}
              ref={(node) => rowVirtualizer.measureElement(node)}
              key={row.id}
              className="table-row justify-between"
            >
              {row.getVisibleCells().map((cell) => {
                return (
                  <TableCell
                    key={cell.id}
                    style={{
                      width: `calc(var(--col-${cell.column.id}-size) * 1px)`,
                    }}
                    className="min-w-fit"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    {/* Can also use cell.renderValue<any>(). Renders the value for a cell the same as getValue, but will return the renderFallbackValue if no value is found. */}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}

        {/* Bottom spacer */}
        {virtualItems.length > 0 && (
          <TableRow
            style={{
              height: `${
                rowVirtualizer.getTotalSize() -
                virtualItems[virtualItems.length - 1].end
              }px`,
            }}
          >
            <TableCell
              // colSpan={table.getAllColumns().length}
              style={{ padding: 0, border: "none", background: "transparent" }}
            />
          </TableRow>
        )}
      </TableBody>
    );
  }
  return (
    <TableBody>
      {rows?.length ? (
        rows.map((row) => (
          <TableRow
            key={row.id}
            data-state={row.getIsSelected() ? "selected" : ""}
          >
            {row.getVisibleCells().map((cell) => {
              const hasCheckbox =
                cell.getValue() === "checkbox" || cell.column.id === "select";
              return (
                <TableCell
                  key={cell.id}
                  style={
                    hasCheckbox
                      ? {}
                      : {
                          width: `calc(var(--col-${cell.column.id}-size) * 1px)`,
                        }
                  }
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  {/* Can also use cell.renderValue<any>(). Renders the value for a cell the same as getValue, but will return the renderFallbackValue if no value is found. */}
                </TableCell>
              );
            })}
          </TableRow>
        ))
      ) : (
        <TableRow>
          <TableCell
            // colSpan={table.getAllColumns().length}
            className="h-24 text-center"
          >
            No results.
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}

export const MemoizedDataTableBody = React.memo(
  DataTableBody,
  (prev, next) => prev.table.options.data === next.table.options.data
) as typeof DataTableBody;
