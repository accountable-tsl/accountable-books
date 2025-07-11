import {
  ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";

/**
 * Initializes a TanStack Table instance with memoized data.
 */
export function useDataTable<T>(data: T[], columns: ColumnDef<T, any>[]) {
  const stableData = useMemo(() => data, [data]);

  return useReactTable({
    data: stableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    debugTable: false,
  });
}
