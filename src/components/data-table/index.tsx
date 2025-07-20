import { DataTable } from "./data-table";
import { getAccountColumns } from "./fake/columns";
import { Account } from "./fake/seed";
import { useDataTable } from "./use-data-table";
import coaData from "./fake/coa.json";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableExtras } from "@/components/data-table/types";

export function Table() {
  const accounts = coaData as Account[];

  const tableOptions: DataTableExtras = {
    virtualization: {
      enabled: true,
    },
    rowSelection: {
      addCheckboxes: true,
    },
  };
  const { table } = useDataTable<Account>({
    data: accounts,
    columns: getAccountColumns(),
    customOptions: tableOptions,
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table}>
        {/* <DataTableSortList table={table} align="end" /> */}
      </DataTableToolbar>
    </DataTable>
  );
}
