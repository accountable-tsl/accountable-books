import { ColumnDef } from "@tanstack/react-table";
import { type Table as TanstackTable } from "@tanstack/react-table";

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

export interface UseDataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];

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
   * If true, enables virtualization for large datasets.
   * Assumes rows are uniform in height for best performance.
   */
  enableVirtualization?: boolean;

  /**
   * Pagination configuration options.
   */
  pagination?: PaginationOptions;

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
