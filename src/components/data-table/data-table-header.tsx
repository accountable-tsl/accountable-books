import React from "react";
import { DataTableProps } from "@/components/data-table/data-table";
import { TableHeader, TableRow, TableCell } from "@/components/CustomTable";
import { flexRender } from "@tanstack/react-table";
import { DataTableResizer } from "@/components/data-table/data-table-resizer";

export function DataTableHeader<TData>({ table }: DataTableProps<TData>) {
  return (
    <TableHeader className="bg-background sticky top-0 z-10">
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id} variant="header">
          {headerGroup.headers.map((header) => (
            <TableCell
              key={header.id}
              variant="header"
              // colSpan={header.colSpan}
              // scope="col"
              className="relative truncate select-none"
              style={{ width: `calc(var(--header-${header?.id}-size))` }}
              data-column-resizing={
                header.column.getIsResizing() ? "true" : undefined
              }
            >
              {header.isPlaceholder
                ? null
                : flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
              {header.column.getCanResize() && (
                <DataTableResizer header={header} />
              )}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableHeader>
  );
}
