import { DataTableProps } from "@/components/data-table/data-table";
import { TableHeader, TableRow, TableCell } from "@/components/CustomTable";
import { flexRender } from "@tanstack/react-table";
import { DataTableResizer } from "@/components/data-table/data-table-resizer";
import { cn } from "@/lib/utils";
import { getColumnStyle } from "./utils/column-sizing";

export function DataTableHeader<TData>({ table }: DataTableProps<TData>) {
  return (
    <TableHeader className="bg-background sticky top-0 z-10">
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id} variant="header">
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
