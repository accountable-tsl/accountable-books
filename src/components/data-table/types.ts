import {
  ColumnDef,
  RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";
import { type Table as TanstackTable } from "@tanstack/react-table";
import { TableOptions } from "@tanstack/react-table";

export interface DataTableProps<TData> extends React.ComponentProps<"div"> {
  table: TanstackTable<TData> & { customOptions?: DataTableExtras }; // TanStack table instance — provides all table state + render info
  actionBar?: React.ReactNode; // Optional UI element shown if there are selected rows
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
}
