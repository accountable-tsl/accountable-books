import React from "react";
import { DataTableProps } from "@/components/data-table/data-table";
import { TableBody, TableRow, TableCell } from "@/components/CustomTable";
import { flexRender, Row } from "@tanstack/react-table";
import { getColumnStyle } from "./utils/column-sizing";

interface DataTableBodyProps<TData> {
  table: DataTableProps<TData>["table"];
  rows: Row<TData>[];
  virtualization?: DataTableProps<TData>["virtualization"];
  rowVirtualizer?: any; // ReturnType<typeof useVirtualizer>;
}
export function DataTableBody<TData>({
  table,
  rows,
  rowVirtualizer,
}: DataTableBodyProps<TData>) {
  const virtualItems = rowVirtualizer?.getVirtualItems();

  const renderRow = (row: any, index?: number) => (
    <TableRow
      key={row.id}
      data-index={index}
      data-state={row.getIsSelected() ? "selected" : ""}
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
            className=""
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
            {/* Can also use cell.renderValue<any>(). Renders the value for a cell the same as getValue, but will return the renderFallbackValue if no value is found. */}
          </TableCell>
        );
      })}
    </TableRow>
  );

  if (rowVirtualizer.options?.enabled === true && rowVirtualizer) {
    return (
      <TableBody className="overflow-y-auto">
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
        {virtualItems.map((virtualRow: any) =>
          renderRow(rows[virtualRow.index], virtualRow.index)
        )}

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
        rows.map((row) =>
          // <TableRow
          //   key={row.id}
          //   data-state={row.getIsSelected() ? "selected" : ""}
          // >
          //   {row.getVisibleCells().map((cell) => {
          //     const hasCheckbox =
          //       cell.getValue() === "checkbox" || cell.column.id === "select";

          //     const columnDef = table
          //       ._getColumnDefs()
          //       .find((c) => c.id === cell.column.id);
          //     const explicitSize = !!columnDef?.size;

          //     const colStyle = getColumnStyle({ column: cell, explicitSize });

          //     return (
          //       <TableCell
          //         key={cell.id}
          //         // style={hasCheckbox ? {} : colStyle}
          //         style={colStyle}
          //         className=""
          //       >
          //         {flexRender(cell.column.columnDef.cell, cell.getContext())}
          //         {/* Can also use cell.renderValue<any>(). Renders the value for a cell the same as getValue, but will return the renderFallbackValue if no value is found. */}
          //       </TableCell>
          //     );
          //   })}
          // </TableRow>
          renderRow(row)
        )
      ) : (
        <TableRow>
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
