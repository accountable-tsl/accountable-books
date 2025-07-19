import {
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import {
  PaginationOptions,
  SortingOptions,
  UseDataTableProps,
} from "@/components/data-table/types";

/**
 * Initializes a TanStack Table instance with memoized data.
 *
 * NOTE: When virtualization is enabled, pagination and sorting are disabled.
 * - Pagination: Virtualized tables should not use paginated data, as the virtualizer expects the full dataset.
 * - Sorting: Sorting is disabled for virtualized tables because sorting only the visible rows breaks user expectations.
 *   To support sorting, you must sort the entire dataset before passing it to the table/virtualizer.
 */
export function useDataTable<T>({
  data,
  columns,
  columnResize,
  customOptions,
}: UseDataTableProps<T>) {
  // Virtualization options
  const virtualization = {
    enabled: false,
    estimatedRowHeight: 35,
    overscan: 5,
    ...customOptions?.virtualization,
  };

  // If virtualization is enabled, force pagination and sorting off
  const pagination: PaginationOptions = {
    enabled: virtualization.enabled
      ? false
      : customOptions?.pagination?.enabled ?? false,
    style: customOptions?.pagination?.style ?? "standard",
    initialPageSize: customOptions?.pagination?.initialPageSize ?? 10,
    pageSizeOptions: customOptions?.pagination?.pageSizeOptions,
  };

  const sorting: SortingOptions = {
    enabled: virtualization.enabled
      ? false
      : customOptions?.sorting?.enabled ?? true,
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

    // Sorting is opt-in and configurable
    // Disabled for virtualized tables. To support, sort the full dataset before passing to the table.
    ...(sorting?.enabled && {
      enableSorting: true,
      getSortedRowModel: getSortedRowModel(),
    }),

    // Pagination is opt-in and configurable
    // Disabled for virtualized tables. Virtualizer expects the full dataset.
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
      enableSorting: false,
    },
  });

  const table = {
    ...reactTable,
    customOptions: { ...customOptions, pagination, sorting, virtualization },
  };

  return { table };
}
