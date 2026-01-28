import {
  type ComponentProps,
  type Dispatch,
  type FC,
  type ReactNode,
  type SetStateAction,
  type SVGProps,
} from 'react';
import {
  type ColumnDef,
  type ColumnSort,
  type Row,
  type RowData,
  type RowSelectionState,
  type TableOptions,
  type Table as TanstackTable,
} from '@tanstack/react-table';

import { type DataTableConfig, type FilterItemSchema } from '../utils/config';
import { type ResolvedRowClick, type RowClickBehavior } from './row-click';

// --- Module Augmentation (No Change Here) ---
/**
 * Extends the ColumnMeta interface in @tanstack/react-table
 * to add custom metadata properties for each column.
 */
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    placeholder?: string;
    variant?: FilterVariant;
    options?: Option[];
    range?: [number, number];
    unit?: string;
    icon?: FC<SVGProps<SVGSVGElement>>;
    separateFilter?: boolean;
    hidden?: boolean;
    cellClassName?: string; // For custom cell styling
    headerClassName?: string; // For custom header cell styling
    // Use type parameters to satisfy linter
    _dataType?: TData;
    _valueType?: TValue;
  }
}

// --- Common Base Interfaces for Features ---
// These remain as defined, as they describe the *structure*
// of how these features are configured, regardless of input or output context.
export interface PaginationOptions {
  enabled: boolean;
  initialPageSize?: number;
  style?: 'standard' | 'infinite';
  pageSizeOptions?: number[];
}

export interface SortingOptions {
  enabled: boolean;
}

export interface RowSelectionOptions {
  enabled?: boolean | ((row: any) => boolean);
  addCheckboxes?: boolean;
  enableMultiRowSelection?: boolean;

  rowSelectionState?: RowSelectionState;
  setRowSelectionState?: Dispatch<SetStateAction<RowSelectionState>>;
  checkboxColumnId?: string;
  checkboxColumnPosition?:
    | 'start'
    | 'end'
    | { beforeColumnId: string }
    | { afterColumnId: string }
    | { index: number };
  checkboxClassNames?: {
    header?: string;
    cell?: string;
  };
}

export interface GlobalSearch {
  enabled: boolean;
  type?: 'table-wide' | 'multi-column';
  placeholder?: string;
  className?: string;
  allowIndividualFilters?: boolean;
}

export interface Option {
  label: string;
  value: string;
  count?: number;
  icon?: FC<SVGProps<SVGSVGElement>>;
}

// --- Input Configuration for DataTable (Subset of DataTableExtras) ---
/**
 * Defines the custom configuration options that can be provided as input
 * to the `useDataTable` hook. This excludes internally managed state/utilities.
 */

export interface BaseDataTableOptions {
  virtualization?: {
    enabled: boolean;
    estimatedRowHeight?: number;
    overscan?: number;
    // When false, skip measuring actual row heights and use estimatedRowHeight as fixed height.
    measure?: boolean;
    // Force rows to a fixed height equal to estimatedRowHeight.
    fixedRowHeight?: boolean;
  };

  infiniteScroll?: {
    enabled: boolean;
    fetchNextPage: () => void;
    hasNextPage?: boolean;
    isFetching?: boolean;
    threshold?: number;
  };

  pagination?: PaginationOptions;
  sorting?: SortingOptions;
  rowSelection?: RowSelectionOptions; // Note: rowSelectionState/setRowSelectionState here are for initial controlled state
  globalSearch?: GlobalSearch;
  customClassNames?: {
    wrapper?: string;
    table?: string;
    tableHeader?: string;
    tableHeaderRow?: string;
    tableHeaderCell?: string;
    tableBody?: string;
    tableBodyRow?: string;
    tableBodyCell?: string;
    emptyTableRow?: string;
  };
}
export type DataTableInputOptions<TData = any> = BaseDataTableOptions & {
  rowClick?: RowClickBehavior<TData>;
  uniqueRowIdentifierKey?: string;
  expandableRows?: ExpandableRowsOptions<TData>;
};

export type DataTableExtras<TData = any> = BaseDataTableOptions & {
  stableData?: any[];
  setGlobalSearchColumns?: Dispatch<SetStateAction<string[]>>;
  rowClick?: ResolvedRowClick<TData>;
  expandableRows?: ExpandableRowsOptions<TData>;
};

// --- UseDataTable Props (Hook Input) ---
/**
 * Props for the `useDataTable` hook. This defines all the configurable
 * options that can be passed to the hook.
 */
export interface UseDataTableProps<TData>
  extends Omit<
    TableOptions<TData>,
    'getCoreRowModel' | 'enableRowSelection' | 'enableMultiRowSelection'
  > {
  /**
   * Optional configuration for column resizing.
   * If not provided, resizing is disabled by default.
   */
  columnResize?: {
    enabled: boolean;
    mode?: 'onChange' | 'onEnd';
  };

  /**
   * Custom configuration options for the data table's features.
   * These are the *input* options for the hook.
   */
  customOptions?: DataTableInputOptions;
}

export type CustomTable<TData> = TanstackTable<TData> & {
  customOptions?: DataTableExtras<TData>;
};

export type UseDataTableReturn<TData> = {
  table: CustomTable<TData>;
};

// Props for Data table Component
export interface DataTableProps<TData> extends ComponentProps<'div'> {
  table: CustomTable<TData>; // TanStack table instance — provides all table state + render info
  actionBar?: ReactNode; // Optional UI element shown if there are selected rows
}

export type FilterOperator = DataTableConfig['operators'][number];
export type FilterVariant = DataTableConfig['filterVariants'][number];
export type JoinOperator = DataTableConfig['joinOperators'][number];

export interface ExtendedColumnSort<TData> extends Omit<ColumnSort, 'id'> {
  id: Extract<keyof TData, string>;
}

export interface ExtendedColumnFilter<TData> extends FilterItemSchema {
  id: Extract<keyof TData, string>;
}

export interface DataTableRowAction<TData> {
  row: Row<TData>;
  variant: 'update' | 'delete';
}

export interface ExpandableRowsOptions<TData> {
  /**
   * Enable expandable rows feature
   * @default false
   */
  enabled?: boolean;

  /**
   * Property name on your data that contains sub-rows
   *
   * @example
   * // If your data has: { id: 1, name: 'Parent', children: [...] }
   * subRowsProperty: 'children'
   *
   * @default 'subRows'
   */
  subRowsProperty?: string;

  /**
   * Custom function to extract sub-rows (overrides subRowsProperty)
   * Use this for complex data structures or computed sub-rows
   *
   * @example
   * getSubRows: (row) => row.items?.filter(item => item.active)
   */
  getSubRows?: (row: TData) => TData[] | undefined;

  /**
   * Function to determine if a row can be expanded
   * If not provided, rows with sub-rows are automatically expandable
   *
   * @example
   * canExpand: (row) => row.original.hasChildren && row.original.isActive
   */
  canExpand?: (row: Row<TData>) => boolean;

  /**
   * Custom render function for expanded content
   * If not provided, sub-rows are rendered as regular table rows
   */
  renderExpandedContent?: (props: {
    row: Row<TData>;
    subRows: TData[];
    columns: ColumnDef<TData>[];
  }) => ReactNode;

  /**
   * CSS class name for expanded content row
   */
  expandedRowClassName?: string;

  /**
   * Indentation size for nested rows in rem or px
   * @default '1.5rem'
   */
  indentSize?: string;
}
