import { DataTable } from "./data-table";
import { accountColumns } from "./fake/columns";
import { Account } from "./fake/seed";
import { useDataTable } from "./hooks";
import coaData from "./fake/coa.json";
import { DataTableExtras } from "./types";

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
    columns: accountColumns,
    customOptions: tableOptions,
  });

  return <DataTable table={table} />;
}
