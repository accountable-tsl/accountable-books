import {
  DataTableActionBar,
  DataTableActionBarAction,
  DataTableActionBarSelection,
} from "@/components/data-table/action-bar/data-table-action-bar";
import { CustomTable } from "@/components/data-table/types";
import { Separator } from "@/components/ui/separator";
import { CoaResponse } from "@/features/coa/types";
import { analyzeSelectedAccounts } from "@/features/coa/utils";
import { ar } from "@faker-js/faker";
import { Download, Trash2 } from "lucide-react";

/**
 * 3 actions to implement
 * 1. delete: if all accounts selected are have no transactions, are not locked, not archived and not already deleted
 * 2. archive: if all accounts selected are not already archived, and not locked
 * 3. export/download: download selected coa accounts to csv
 */
export function CoaActionBar({ table }: { table: CustomTable<CoaResponse> }) {
  const rows = table.getFilteredSelectedRowModel().rows;
  const { canArchive, canDelete, canExport, summary } = analyzeSelectedAccounts(
    rows.map((r) => r.original)
  );
  const { total, locked, archived } = summary;

  const parts = [
    `${total} selected`,
    locked > 0 && `${locked} locked`,
    archived > 0 && `${archived} archived`,
  ].filter(Boolean);
  const meta = parts.join(" | ");

  return (
    <DataTableActionBar
      table={table}
      visible={rows.length > 0}
      className="bottom-12"
    >
      <DataTableActionBarSelection table={table} />
      <Separator
        orientation="vertical"
        className="hidden data-[orientation=vertical]:h-5 sm:block"
      />

      {/* Export */}
      <DataTableActionBarAction
        size="icon"
        tooltip="Export accounts"
        // isPending={getIsActionPending("export")}
        // onClick={onTaskExport}
      >
        <Download />
      </DataTableActionBarAction>

      {/* Delete */}
      <DataTableActionBarAction
        size="icon"
        tooltip="Delete accounts"
        //   isPending={getIsActionPending("delete")}
        //   onClick={onTaskDelete}
      >
        <Trash2 />
      </DataTableActionBarAction>

      <DataTableActionBarAction size="sm" className="font-light text-sm border">
        {meta}
      </DataTableActionBarAction>
    </DataTableActionBar>
  );
}
