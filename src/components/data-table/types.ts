import {
  ColumnSort,
  Row,
  RowData,
  RowSelectionState,
} from "@tanstack/react-table";
import { type Table as TanstackTable } from "@tanstack/react-table";
import { TableOptions } from "@tanstack/react-table";
import {
  DataTableConfig,
  FilterItemSchema,
} from "@/components/data-table/utils/config";

declare module "@tanstack/react-table" {
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
  }
}

export type CustomTable<T> = TanstackTable<T> & {
  customOptions?: DataTableExtras;
};
// Props for Data table Component
export interface DataTableProps<TData> extends React.ComponentProps<"div"> {
  table: CustomTable<TData>; // TanStack table instance — provides all table state + render info
  actionBar?: React.ReactNode; // Optional UI element shown if there are selected rows
}

// Props for useDataTable (Hook)
export interface UseDataTableProps<TData>
  extends Omit<
    TableOptions<TData>,
    "getCoreRowModel" | "enableRowSelection" | "enableMultiRowSelection"
  > {
  /**
   * Optional configuration for column resizing.
   * If not provided, resizing is disabled by default.
   */
  columnResize?: {
    enabled: boolean;
    mode?: "onChange" | "onEnd";
  };
  customOptions?: DataTableExtras;
}

// Custom I/O for data table
export interface DataTableExtras {
  /**
   * Virtualization configuration options.
   */
  virtualization?: {
    enabled: boolean;
    estimatedRowHeight?: number;
    overscan?: number;
  };

  /**
   * Pagination configuration options.
   */
  pagination?: PaginationOptions;

  /**
   * Sorting configuration options.
   */
  sorting?: SortingOptions;

  rowSelection?: RowSelectionOptions;

  /**
   * Global search configuration options.
   */
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
  };

  stableData?: any[];
}

export interface PaginationOptions {
  enabled: boolean;
  initialPageSize?: number;
  style?: "standard" | "infinite";
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
  setRowSelectionState?: React.Dispatch<
    React.SetStateAction<RowSelectionState>
  >;
}

export interface GlobalSearch {
  enabled: boolean;
  type?: "table-wide" | "multi-column";
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

export type FilterOperator = DataTableConfig["operators"][number];
export type FilterVariant = DataTableConfig["filterVariants"][number];
export type JoinOperator = DataTableConfig["joinOperators"][number];

export interface ExtendedColumnSort<TData> extends Omit<ColumnSort, "id"> {
  id: Extract<keyof TData, string>;
}

export interface ExtendedColumnFilter<TData> extends FilterItemSchema {
  id: Extract<keyof TData, string>;
}

export interface DataTableRowAction<TData> {
  row: Row<TData>;
  variant: "update" | "delete";
}
