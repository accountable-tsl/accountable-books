import {
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import {
  PaginationOptions,
  UseDataTableProps,
} from "@/components/data-table/types";

/**
 * Initializes a TanStack Table instance with memoized data.
 */
export function useDataTable<T>({
  data,
  columns,
  columnResize,
  customOptions,
}: UseDataTableProps<T>) {
  const pagination: PaginationOptions = {
    enabled: false,
    style: "standard",
    initialPageSize: 10,
    ...customOptions?.pagination,
  };

  /**
   * Important: TanStack requires a stable data reference.
   * Otherwise, internal row model caching breaks and can cause re-renders or bugs.
   */
  const stableData = useMemo(() => data, [data]);

  const reactTable = useReactTable({
    data: stableData,
    columns,
    getCoreRowModel: getCoreRowModel(),

    // Column resizing is opt-in and configurable
    enableColumnResizing: columnResize?.enabled ?? true,
    columnResizeMode: columnResize?.mode ?? "onChange",

    // Pagination is opt-in and configurable
    ...(pagination?.enabled &&
      pagination?.style !== "infinite" && {
        getPaginationRowModel: getPaginationRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        initialState: {
          pagination: {
            pageSize: pagination?.initialPageSize ?? 10,
          },
        },
      }),

    // Default: no sorting, filtering, pagination yet
    debugTable: false,

    defaultColumn: {
      minSize: 75,
    },
  });

  const table = {
    ...reactTable,
    customOptions: { ...customOptions, pagination },
  };

  return { table };
}
