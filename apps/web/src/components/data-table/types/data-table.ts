import { ColumnSort, Row, RowData, RowSelectionState } from '@tanstack/react-table';
import { type Table as TanstackTable } from '@tanstack/react-table';
import { TableOptions } from '@tanstack/react-table';
import { DataTableConfig, FilterItemSchema } from '@/components/data-table/utils/config';
import { Dispatch, SetStateAction } from 'react';
import { ResolvedRowClick, RowClickBehavior } from '@/components/data-table/types/row-click';

// --- Module Augmentation (No Change Here) ---
/**
 * Extends the ColumnMeta interface in @tanstack/react-table
 * to add custom metadata properties for each column.
 */
declare module '@tanstack/react-table' {
  // @ts-ignore
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    placeholder?: string;
    variant?: FilterVariant;
    options?: Option[];
    range?: [number, number];
    unit?: string;
    icon?: React.FC<React.SVGProps<SVGSVGElement>>;
    separateFilter?: boolean;
    hidden?: boolean;
  }
}

// --- Common Base Interfaces for Features ---
// These remain as you defined them, as they describe the *structure*
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
  enabled?: boolean;
  addCheckboxes?: boolean;
  enableMultiRowSelection?: boolean;

  rowSelectionState?: RowSelectionState;
  setRowSelectionState?: React.Dispatch<React.SetStateAction<RowSelectionState>>;
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
  icon?: React.FC<React.SVGProps<SVGSVGElement>>;
}

// --- Input Configuration for DataTable (Subset of DataTableExtras) ---
/**
 * Defines the custom configuration options that can be provided as input
 * to the `useDataTable` hook. This excludes internally managed state/utilities.
 */

export interface BaseDataTableOptions<TData> {
  virtualization?: {
    enabled: boolean;
    estimatedRowHeight?: number;
    overscan?: number;
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
export type DataTableInputOptions<TData = any> = BaseDataTableOptions<TData> & {
  rowClick?: RowClickBehavior<TData>;
  uniqueRowIdentifierKey?: string;
};

export type DataTableExtras<TData = any> = BaseDataTableOptions<TData> & {
  stableData?: any[];
  setGlobalSearchColumns?: Dispatch<SetStateAction<string[]>>;
  rowClick?: ResolvedRowClick<TData>;
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
export interface DataTableProps<TData> extends React.ComponentProps<'div'> {
  table: CustomTable<TData>; // TanStack table instance — provides all table state + render info
  actionBar?: React.ReactNode; // Optional UI element shown if there are selected rows
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
