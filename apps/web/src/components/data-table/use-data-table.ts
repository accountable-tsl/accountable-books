import {
  type ColumnFiltersState,
  type ExpandedState,
  type FilterFnOption,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type Row,
  type RowSelectionState,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { createSelectionColumn } from '@/components/data-table/utils/select-column';

import { createMultiColumnFilter } from './toolbar';
import type {
  DataTableExtras,
  GlobalSearch,
  PaginationOptions,
  RowSelectionOptions,
  SortingOptions,
  UseDataTableProps,
  UseDataTableReturn,
} from './types/data-table';
import type { RowClickBehavior } from './types/row-click';
import { isInternalUrl } from './utils/table';

/**
 * TODO: Initializing column filters at table start
 * TODO: and toggling reset button on start
 * e.g Show only active coa accounts by default and don't show reset button at start because of that filter
 */
export function useDataTable<TData>({
  customOptions,
  columnResize,
  ...tableOptions
}: UseDataTableProps<TData>): UseDataTableReturn<TData> {
  const navigate = useNavigate();
  const {
    virtualization: virt,
    pagination: pg,
    globalSearch: gs,
    rowClick: rc,
    expandableRows: expRows,
  } = customOptions || {};

  // Virtualization options
  const virtualization = {
    enabled: virt?.enabled ?? false,
    estimatedRowHeight: virt?.estimatedRowHeight ?? 35,
    overscan: virt?.overscan ?? 5,
  };

  // If virtualization is enabled, force pagination and sorting off
  const pagination: PaginationOptions = {
    enabled: virtualization.enabled ? false : (pg?.enabled ?? false),
    style: pg?.style ?? 'standard',
    initialPageSize: pg?.initialPageSize ?? 10,
    pageSizeOptions: pg?.pageSizeOptions,
  };

  const sorting: SortingOptions = {
    enabled: customOptions?.sorting?.enabled ?? true,
  };

  const globalSearch: GlobalSearch = {
    enabled: gs?.enabled ?? false,
    type: gs?.type ?? 'table-wide',
    placeholder: gs?.placeholder ?? 'Search...',
    allowIndividualFilters: gs?.allowIndividualFilters ?? true,
  };

  const rowClickBehavior: RowClickBehavior<TData> | undefined = rc
    ? {
        ...rc,
        ...(rc?.mode === 'view' && !rc?.wrapper ? { wrapper: 'sheet' } : {}),
      }
    : undefined;

  const uniqueRowIdentifierKey = customOptions?.uniqueRowIdentifierKey ?? 'id';
  const uniqueRowId = (row: Row<TData>) =>
    (row.original as Record<string, unknown>)[uniqueRowIdentifierKey] as string;

  /**
   * Important: TanStack requires a stable data reference.
   * Otherwise, internal row model caching breaks and can cause re-renders or bugs.
   */
  const stableData = useMemo(() => tableOptions.data, [tableOptions.data]);

  const [internalRowSelection, setInternalRowSelection] =
    useState<RowSelectionState>({});
  // const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [internalColumnFilters, setInternalColumnFilters] =
    useState<ColumnFiltersState>([]);

  const controlledColumnFilters = tableOptions.state?.columnFilters;
  const controlledSetColumnFilters = tableOptions.onColumnFiltersChange;

  const columnFilters = controlledColumnFilters ?? internalColumnFilters;
  const setColumnFilters =
    controlledSetColumnFilters ?? setInternalColumnFilters;

  // State for global search column configuration
  const [globalSearchColumnIds, setGlobalSearchColumnIds] = useState<string[]>(
    [],
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
  const checkboxColumnId = checkBoxColumn.id as string;

  const columns = useMemo(() => {
    return rowSelection.addCheckboxes
      ? [checkBoxColumn, ...tableOptions.columns]
      : tableOptions.columns;
  }, [rowSelection.addCheckboxes, tableOptions.columns, checkBoxColumn]);

  const globalFilterFn: FilterFnOption<TData> | undefined = useMemo(() => {
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
    return columns.reduce(
      (acc, col) => {
        if (col.meta?.hidden) acc[col.id as string] = false;
        return acc;
      },
      {} as Record<string, boolean>,
    );
  }, [columns]);

  const [internalColumnVisibility, setInternalColumnVisibility] = useState(
    initialColumnVisibility,
  );

  const [viewedRowId, setViewedRowId] = useState<string | null>(null);

  const [internalExpandedRows, setInternalExpandedRows] =
    useState<ExpandedState>({});

  const handleRowClick = useCallback(
    (row: Row<TData>) => {
      const rcb = rowClickBehavior;
      if (!rcb) return;

      switch (rcb.mode) {
        case 'view':
          setViewedRowId(uniqueRowId(row));
          break;
        case 'redirect': {
          const url = rcb.onClick(row);

          if (url) {
            const isInternal = isInternalUrl(url);
            if (isInternal) {
              navigate(url);
            }
            window.location.href = url;
          }
          break;
        }
        case 'custom':
          rcb.onClick(row);
          break;
      }
    },
    [rowClickBehavior],
  );

  const closeRowView = useCallback(() => setViewedRowId(null), []);

  const columnVisibility =
    controlledColumnVisibility ?? internalColumnVisibility;
  const setColumnVisibility =
    controlledSetColumnVisibility ?? setInternalColumnVisibility;

  // Memoize column pinning to ensure checkbox column is first when row selection is enabled
  const columnPinning = useMemo(() => {
    const existingPinning = tableOptions?.state?.columnPinning ??
      tableOptions.initialState?.columnPinning ?? { left: [], right: [] };

    const leftPinned = existingPinning.left ?? [];

    // If row selection is enabled and there are pinned columns, ensure checkbox is first
    if (rowSelection.addCheckboxes && leftPinned.length > 0) {
      // Remove checkbox column if it exists elsewhere in the array
      const filteredLeft = leftPinned.filter((id) => id !== checkboxColumnId);
      // Add checkbox column as the first item
      return {
        ...existingPinning,
        left: [checkboxColumnId, ...filteredLeft],
        right: existingPinning.right ?? [],
      };
    }

    return {
      left: leftPinned,
      right: existingPinning.right ?? [],
    };
  }, [
    rowSelection.addCheckboxes,
    checkboxColumnId,
    tableOptions?.state?.columnPinning,
    tableOptions.initialState?.columnPinning,
  ]);

  const getSubRowsFunction = useMemo(() => {
    if (!expRows?.enabled) return undefined;

    // If custom function provided, use it
    if (expRows.getSubRows) {
      return expRows.getSubRows;
    }

    // Otherwise, use the property name (default: 'subRows')
    const propertyName = expRows.subRowsProperty ?? 'subRows';

    return (row: TData) => {
      const data = row as Record<string, unknown>;
      const subRows = data[propertyName];

      // Return undefined if not an array or empty
      if (!Array.isArray(subRows) || subRows.length === 0) {
        return undefined;
      }

      return subRows as TData[];
    };
  }, [expRows?.enabled, expRows?.getSubRows, expRows?.subRowsProperty]);

  const reactTable = useReactTable({
    ...tableOptions,
    data: stableData,
    columns: columns,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: rowSelection.enabled,
    enableMultiRowSelection: rowSelection.enableMultiRowSelection,

    // Enable pinning if columnPinning is provided in state or initialState
    enablePinning: !!(
      tableOptions?.state?.columnPinning ||
      tableOptions.initialState?.columnPinning
    ),

    state: {
      ...tableOptions?.state,
      rowSelection: rowSelection.rowSelectionState,
      columnFilters,
      columnVisibility,
      // // Ensure columnPinning always has a default value
      // columnPinning: tableOptions?.state?.columnPinning ??
      //   tableOptions.initialState?.columnPinning ?? { left: [], right: [] },
      columnPinning,
      ...(expRows?.enabled || expRows?.canExpand
        ? { expanded: tableOptions.state?.expanded ?? internalExpandedRows }
        : {}),
    },
    onRowSelectionChange: rowSelection.setRowSelectionState,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: tableOptions.onColumnPinningChange,
    onExpandedChange: tableOptions.onExpandedChange ?? setInternalExpandedRows,

    // Column resizing is opt-in and configurable
    enableColumnResizing: columnResize?.enabled ?? true,
    columnResizeMode: columnResize?.mode ?? 'onChange',

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
      pagination?.style !== 'infinite' && {
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

    // Expanded rows
    getExpandedRowModel:
      expRows?.enabled || expRows?.canExpand
        ? getExpandedRowModel()
        : undefined,
    ...(expRows?.canExpand ? { getRowCanExpand: expRows.canExpand } : {}),
    ...(expRows?.enabled && {
      enableExpanding: true,
      getSubRows: getSubRowsFunction,
    }),

    debugTable: false,

    defaultColumn: {
      ...tableOptions.defaultColumn,
      minSize: 75,
      enableSorting: false,
      enableColumnFilter: gs?.enabled ?? false,
      filterFn: 'weakEquals',
      meta: {
        ...(tableOptions.defaultColumn?.meta ?? {}),
        variant:
          tableOptions.defaultColumn?.meta?.variant ??
          (gs?.enabled ? 'text' : undefined),
      },
    },
  });

  const viewedRow = useMemo(() => {
    if (!viewedRowId) return null;
    return (
      reactTable
        .getRowModel()
        .rows.find((row) => uniqueRowId(row) === viewedRowId) || null
    );
  }, [viewedRowId, stableData]);

  const options: DataTableExtras<TData> = {
    ...customOptions,
    pagination,
    sorting,
    virtualization,
    globalSearch,
    stableData,
    setGlobalSearchColumns: setGlobalSearchColumnIds,
    rowClick: rowClickBehavior
      ? {
          ...rowClickBehavior,
          viewedRow,
          closeRowView,
          handleRowClick,
        }
      : undefined,
    expandableRows: expRows,
  };

  const table = {
    ...reactTable,
    customOptions: options,
  };

  return { table };
}
