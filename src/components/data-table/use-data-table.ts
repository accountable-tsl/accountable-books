import {
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  RowSelectionState,
  ColumnFiltersState,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFacetedMinMaxValues,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import {
  GlobalSearch,
  PaginationOptions,
  RowSelectionOptions,
  SortingOptions,
  UseDataTableProps,
  UseDataTableReturn,
} from "@/components/data-table/types";
import { createSelectionColumn } from "./utils/select-column";
import { createMultiColumnFilter } from "@/components/data-table/toolbar";

/**
 * Initializes a TanStack Table instance with memoized data.
 *
 * NOTE: When virtualization is enabled, pagination and sorting are disabled.
 * - Pagination: Virtualized tables should not use paginated data, as the virtualizer expects the full dataset.
 * - Sorting: Sorting is disabled for virtualized tables because sorting only the visible rows breaks user expectations.
 *   To support sorting, you must sort the entire dataset before passing it to the table/virtualizer.
 */
export function useDataTable<TData>({
  customOptions,
  columnResize,
  ...tableOptions
}: UseDataTableProps<TData>): UseDataTableReturn<TData> {
  const {
    virtualization: virt,
    pagination: pg,
    globalSearch: gs,
  } = customOptions || {};
  // Virtualization options
  const virtualization = {
    enabled: virt?.enabled ?? false,
    estimatedRowHeight: virt?.estimatedRowHeight ?? 35,
    overscan: virt?.overscan ?? 5,
  };

  // If virtualization is enabled, force pagination and sorting off
  const pagination: PaginationOptions = {
    enabled: virtualization.enabled ? false : pg?.enabled ?? false,
    style: pg?.style ?? "standard",
    initialPageSize: pg?.initialPageSize ?? 10,
    pageSizeOptions: pg?.pageSizeOptions,
  };

  const sorting: SortingOptions = {
    enabled: virtualization.enabled
      ? false
      : customOptions?.sorting?.enabled ?? true,
  };

  const globalSearch: GlobalSearch = {
    enabled: gs?.enabled ?? false,
    type: gs?.type ?? "table-wide",
    placeholder: gs?.placeholder ?? "Search...",
    allowIndividualFilters:
      gs?.allowIndividualFilters ?? (gs?.enabled ? false : true),
  };

  /**
   * Important: TanStack requires a stable data reference.
   * Otherwise, internal row model caching breaks and can cause re-renders or bugs.
   */
  const stableData = useMemo(() => tableOptions.data, [tableOptions.data]);

  const [internalRowSelection, setInternalRowSelection] =
    useState<RowSelectionState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // State for global search column configuration
  const [globalSearchColumnIds, setGlobalSearchColumnIds] = useState<string[]>(
    []
  );

  const getRowSelectionOptions = (): RowSelectionOptions => {
    const rs = customOptions?.rowSelection;
    const isEnabled = rs?.enabled ?? false;
    return {
      enabled: isEnabled,
      enableMultiRowSelection: rs?.enableMultiRowSelection ?? true,
      rowSelectionState: rs?.rowSelectionState ?? internalRowSelection,
      setRowSelectionState: rs?.setRowSelectionState ?? setInternalRowSelection,
      addCheckboxes: rs?.addCheckboxes ?? isEnabled,
    };
  };
  const rowSelection = getRowSelectionOptions();

  const checkBoxColumn = createSelectionColumn<TData>();

  const columns = useMemo(() => {
    return rowSelection.addCheckboxes
      ? [checkBoxColumn, ...tableOptions.columns]
      : tableOptions.columns;
  }, [rowSelection.addCheckboxes, tableOptions.columns]);

  const globalFilterFn = useMemo(() => {
    if (!globalSearch.enabled || globalSearchColumnIds.length === 0) {
      return undefined;
    }
    return createMultiColumnFilter(globalSearchColumnIds);
  }, [globalSearchColumnIds, globalSearch.enabled]);

  useEffect(() => {
    return () => {
      setGlobalSearchColumnIds([]);
    };
  }, []);

  // Column Visibility
  const controlledColumnVisibility = tableOptions.state?.columnVisibility;
  const controlledSetColumnVisibility = tableOptions.onColumnVisibilityChange;

  // Determine columns to hide
  const initialColumnVisibility = useMemo(() => {
    return columns.reduce((acc, col) => {
      if (col.meta?.hidden) acc[col.id as string] = false;
      return acc;
    }, {} as Record<string, boolean>);
  }, [columns]);

  const [internalColumnVisibility, setInternalColumnVisibility] = useState(
    initialColumnVisibility
  );

  const columnVisibility =
    controlledColumnVisibility ?? internalColumnVisibility;
  const setColumnVisibility =
    controlledSetColumnVisibility ?? setInternalColumnVisibility;

  const reactTable = useReactTable({
    ...tableOptions,
    data: stableData,
    columns: columns,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: rowSelection.enabled,
    enableMultiRowSelection: rowSelection.enableMultiRowSelection,

    state: {
      ...tableOptions?.state,
      rowSelection: rowSelection.rowSelectionState,
      columnFilters,
      columnVisibility,
    },
    onRowSelectionChange: rowSelection.setRowSelectionState,
    onColumnVisibilityChange: setColumnVisibility,

    // Column resizing is opt-in and configurable
    enableColumnResizing: columnResize?.enabled ?? true,
    columnResizeMode: columnResize?.mode ?? "onChange",

    // Filtering is always enabled when columns have filter metadata
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: setColumnFilters,
    enableColumnFilters: true,

    // Global filtering configuration
    ...(globalSearch.enabled && {
      enableGlobalFilter: true,
      globalFilterFn: globalFilterFn,
    }),

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
        initialState: {
          ...tableOptions.initialState,
          pagination: {
            ...tableOptions.initialState?.pagination,
            pageSize: pagination.initialPageSize,
          },
        },
      }),

    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),

    debugTable: false,

    defaultColumn: {
      ...tableOptions.defaultColumn,
      minSize: 75,
      enableSorting: false,
      enableColumnFilter: false,
    },
  });

  const table = {
    ...reactTable,
    customOptions: {
      ...customOptions,
      pagination,
      sorting,
      virtualization,
      globalSearch,
      stableData,
      setGlobalSearchColumns: setGlobalSearchColumnIds,
    },
  };

  return { table };
}
