import { DataTableProps } from "@/components/data-table/types";
import { TableHeader, TableRow, TableCell } from "@/components/CustomTable";
import { flexRender } from "@tanstack/react-table";
import { DataTableResizer } from "@/components/data-table/data-table-resizer";
import { getColumnStyle } from "./utils/column-sizing";
import { cn } from "@/lib/utils";

export function DataTableHeader<TData>({ table }: DataTableProps<TData>) {
  const { tableHeader, tableHeaderRow, tableHeaderCell } =
    table.customOptions?.customClassNames || {};

  return (
    <TableHeader className={cn("bg-background sticky top-0 z-10", tableHeader)}>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow
          key={headerGroup.id}
          variant="header"
          className={tableHeaderRow}
        >
          {headerGroup.headers.map((header) => {
            const columnDef = table
              ._getColumnDefs()
              .find((c) => c.id === header.id);
            const explicitSize = !!columnDef?.size;
            const colStyle = getColumnStyle({ column: header, explicitSize });

            return (
              <TableCell
                key={header.id}
                variant="header"
                style={colStyle}
                data-column-resizing={
                  header.column.getIsResizing() ? "true" : undefined
                }
                className={tableHeaderCell}
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
            );
          })}
        </TableRow>
      ))}
    </TableHeader>
  );
}
