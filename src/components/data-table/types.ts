import { ColumnDef } from "@tanstack/react-table";

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

  /**
   * If true, enables virtualization for large datasets.
   * Assumes rows are uniform in height for best performance.
   */
  enableVirtualization?: boolean;
}
