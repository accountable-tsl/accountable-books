import type {
  ColumnDef,
  ColumnFiltersState,
  ExpandedState,
  FilterFnOption,
  Row,
  RowSelectionState,
} from '@tanstack/react-table';
import {
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
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

type SelectionColumnPosition = RowSelectionOptions['checkboxColumnPosition'];
type SelectionColumnObject = Exclude<
  NonNullable<SelectionColumnPosition>,
  'start' | 'end'
>;

const getColumnId = <TData>(column: ColumnDef<TData>): string | undefined => {
  if ('id' in column && typeof column.id === 'string') {
    return column.id;
  }
  if ('accessorKey' in column && typeof column.accessorKey === 'string') {
    return column.accessorKey;
  }
  return undefined;
};

const isPositionObject = (
  position: SelectionColumnPosition,
): position is SelectionColumnObject =>
  typeof position === 'object' && position !== null;

const resolveInsertIndex = <TData>(
  columns: ColumnDef<TData>[],
  position?: SelectionColumnPosition,
) => {
  if (!position || position === 'start') return 0;
  if (position === 'end') return columns.length;
  if (!isPositionObject(position)) return 0;
  if ('index' in position) {
    return Math.min(Math.max(position.index, 0), columns.length);
  }
  if ('beforeColumnId' in position) {
    const index = columns.findIndex(
      (column) => getColumnId(column) === position.beforeColumnId,
    );
    return index === -1 ? 0 : index;
  }
  const index = columns.findIndex(
    (column) => getColumnId(column) === position.afterColumnId,
  );
  return index === -1 ? columns.length : index + 1;
};

const insertSelectionColumn = <TData>(
  columns: ColumnDef<TData>[],
  selectionColumn: ColumnDef<TData>,
  position?: SelectionColumnPosition,
) => {
  const selectionId = getColumnId(selectionColumn);
  if (!selectionId) {
    return [selectionColumn, ...columns];
  }
  const filteredColumns = columns.filter(
    (column) => getColumnId(column) !== selectionId,
  );
  const insertIndex = resolveInsertIndex(filteredColumns, position);
  return [
    ...filteredColumns.slice(0, insertIndex),
    selectionColumn,
    ...filteredColumns.slice(insertIndex),
  ];
};

const insertSelectionColumnId = (
  columnIds: string[],
  selectionId: string,
  position?: SelectionColumnPosition,
) => {
  const filtered = columnIds.filter((id) => id !== selectionId);
  if (!position || position === 'start') {
    return [selectionId, ...filtered];
  }
  if (position === 'end') {
    return [...filtered, selectionId];
  }
  if (!isPositionObject(position)) {
    return [selectionId, ...filtered];
  }
  if ('index' in position) {
    const insertIndex = Math.min(Math.max(position.index, 0), filtered.length);
    return [
      ...filtered.slice(0, insertIndex),
      selectionId,
      ...filtered.slice(insertIndex),
    ];
  }
  if ('beforeColumnId' in position) {
    const targetIndex = filtered.indexOf(position.beforeColumnId);
    const insertIndex = targetIndex === -1 ? 0 : targetIndex;
    return [
      ...filtered.slice(0, insertIndex),
      selectionId,
      ...filtered.slice(insertIndex),
    ];
  }
  const targetIndex = filtered.indexOf(position.afterColumnId);
  const insertIndex = targetIndex === -1 ? filtered.length : targetIndex + 1;
  return [
    ...filtered.slice(0, insertIndex),
    selectionId,
    ...filtered.slice(insertIndex),
  ];
};

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
      addCheckboxes:
        rs?.addCheckboxes ??
        (typeof isEnabled === 'boolean' ? isEnabled : true),
      checkboxColumnId: rs?.checkboxColumnId,
      checkboxColumnPosition: rs?.checkboxColumnPosition,
      checkboxClassNames: rs?.checkboxClassNames,
    };
  };
  const rowSelection = getRowSelectionOptions();

  const checkBoxColumn = useMemo(
    () =>
      createSelectionColumn<TData>({
        id: rowSelection.checkboxColumnId,
        headerCheckboxClassName: rowSelection.checkboxClassNames?.header,
        cellCheckboxClassName: rowSelection.checkboxClassNames?.cell,
      }),
    [
      rowSelection.checkboxColumnId,
      rowSelection.checkboxClassNames?.header,
      rowSelection.checkboxClassNames?.cell,
    ],
  );
  const checkboxColumnId = checkBoxColumn.id as string;

  const columns = useMemo(() => {
    if (!rowSelection.addCheckboxes) {
      return tableOptions.columns;
    }
    return insertSelectionColumn(
      tableOptions.columns,
      checkBoxColumn,
      rowSelection.checkboxColumnPosition,
    );
  }, [
    rowSelection.addCheckboxes,
    rowSelection.checkboxColumnPosition,
    tableOptions.columns,
    checkBoxColumn,
  ]);

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
  const initialColumnVisibility = useMemo<Record<string, boolean>>(() => {
    const visibility: Record<string, boolean> = {};
    for (const column of columns) {
      const columnId = getColumnId(column);
      if (column.meta?.hidden && columnId) {
        visibility[columnId] = false;
      }
    }
    return visibility;
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

  // Memoize column pinning to keep selection column positioned when row selection is enabled
  const columnPinning = useMemo(() => {
    const existingPinning = tableOptions?.state?.columnPinning ??
      tableOptions.initialState?.columnPinning ?? { left: [], right: [] };

    const leftPinned = existingPinning.left ?? [];

    // If row selection is enabled and there are pinned columns, place selection column
    if (rowSelection.addCheckboxes && leftPinned.length > 0) {
      return {
        ...existingPinning,
        left: insertSelectionColumnId(
          leftPinned,
          checkboxColumnId,
          rowSelection.checkboxColumnPosition,
        ),
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

  const options: DataTableExtras<TData> = useMemo(
    () => ({
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
    }),
    [
      customOptions,
      pagination,
      sorting,
      virtualization,
      globalSearch,
      stableData,
      rowClickBehavior,
      viewedRow,
      closeRowView,
      handleRowClick,
      expRows,
    ],
  );

  const table = useMemo(
    () => ({
      ...reactTable,
      customOptions: options,
    }),
    [reactTable, options],
  );

  return { table };
}
