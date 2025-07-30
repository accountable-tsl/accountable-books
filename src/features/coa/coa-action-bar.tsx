import {
  DataTableActionBar,
  DataTableActionBarAction,
  DataTableActionBarSelection,
} from "@/components/data-table/action-bar/data-table-action-bar";
import { CustomTable } from "@/components/data-table/types/data-table";
import { Separator } from "@/components/ui/separator";
import { CoaResponse } from "@/features/coa/types";
import { analyzeSelectedAccounts } from "@/features/coa/utils";
import { cn } from "@/lib/utils";
import { Row } from "@tanstack/react-table";
import { Archive, Download, Trash2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useArchiveCoa, useDeleteCoa } from "./hooks";

// TODO: BULK EXPORT

interface CoaActionBarProps {
  companyId: string;
  table: CustomTable<CoaResponse>;
  className?: string;
}
export function CoaActionBar({
  table,
  className,
  companyId,
}: CoaActionBarProps) {
  const archiveCoaMutation = useArchiveCoa();
  const deleteCoaMutation = useDeleteCoa();

  const rows = table.getFilteredSelectedRowModel().rows;
  const originalRows = useMemo(
    () => rows.map((r: Row<CoaResponse>) => r.original),
    [rows]
  );

  const selectedRowsIds = useMemo(
    () => originalRows.map((row) => row.id),
    [originalRows]
  );

  const { canArchive, canDelete, canExport, summary } =
    analyzeSelectedAccounts(originalRows);
  const { total, locked, archived } = summary;

  const parts = [
    `${total} selected`,
    locked > 0 && `${locked} locked`,
    archived > 0 && `${archived} archived`,
  ].filter(Boolean);
  const meta = parts.join(" | ");

  const onTaskDelete = useCallback(() => {
    if (!canDelete) return;
    if (rows.length === 0) return;
    deleteCoaMutation.mutate({
      companyId,
      accountIds: selectedRowsIds,
    });

    // Reset selection after deletion
    table.resetRowSelection();
  }, [rows, canDelete]);

  const onTaskArchive = useCallback(() => {
    if (!canArchive) return;
    if (rows.length === 0) return;
    archiveCoaMutation.mutate({
      companyId,
      accountIds: selectedRowsIds,
    });

    table.resetRowSelection();
  }, [rows, canArchive]);

  return (
    <DataTableActionBar
      table={table}
      visible={rows.length > 0}
      className={cn("", className)}
    >
      <DataTableActionBarSelection table={table} />
      <Separator
        orientation="vertical"
        className="hidden data-[orientation=vertical]:h-5 sm:block"
      />

      {canArchive && onTaskArchive && (
        <DataTableActionBarAction
          size="icon"
          tooltip="Archive accounts"
          onClick={onTaskArchive}
        >
          <Archive />
        </DataTableActionBarAction>
      )}

      {/* Delete */}
      {canDelete && onTaskDelete && (
        <DataTableActionBarAction
          size="icon"
          tooltip="Delete accounts"
          onClick={onTaskDelete}
        >
          <Trash2 />
        </DataTableActionBarAction>
      )}

      {/* Export */}
      {/* {canExport && onTaskExport && (
        <DataTableActionBarAction
          size="icon"
          tooltip="Export accounts"
          // isPending={getIsActionPending("export")}
          onClick={onTaskExport}
        >
          <Download />
        </DataTableActionBarAction>
      )} */}

      <DataTableActionBarAction size="sm" className="font-light text-sm border">
        {meta}
      </DataTableActionBarAction>
    </DataTableActionBar>
  );
}
