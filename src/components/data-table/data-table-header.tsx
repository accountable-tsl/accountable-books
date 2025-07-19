import { DataTableProps } from "@/components/data-table/types";
import { TableHeader, TableRow, TableCell } from "@/components/CustomTable";
import { flexRender } from "@tanstack/react-table";
import { DataTableResizer } from "@/components/data-table/data-table-resizer";
import { getColumnStyle } from "./utils/column-sizing";
import { cn } from "@/lib/utils";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export function DataTableHeader<TData>({ table }: DataTableProps<TData>) {
  const { tableHeader, tableHeaderRow, tableHeaderCell } =
    table.customOptions?.customClassNames || {};
  const sortingEnabled = table.customOptions?.sorting?.enabled !== false;

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

            // Only allow sorting if globally enabled and column allows it
            const canSort = sortingEnabled && header.column.getCanSort();

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
                {header.isPlaceholder ? null : (
                  <>
                    {canSort ? (
                      <div
                        className="flex items-center cursor-pointer select-none"
                        role="button"
                        tabIndex={0}
                        aria-label={`Sort by ${flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}`}
                        onClick={() =>
                          header.column.toggleSorting(
                            header.column.getIsSorted() === "asc"
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            header.column.toggleSorting(
                              header.column.getIsSorted() === "asc"
                            );
                          }
                        }}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        <span className="ml-2">
                          {header.column.getIsSorted() === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : header.column.getIsSorted() === "desc" ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3" />
                          )}
                        </span>
                      </div>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )
                    )}
                  </>
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
