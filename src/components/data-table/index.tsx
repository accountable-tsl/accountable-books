import { DataTable } from "./data-table";
import { accountColumns } from "./fake/columns";
import { Account, generateCompanyAccounts } from "./fake/seed";
import { useDataTable } from "./hooks";
import coaData from "./fake/coa.json";

export function Table() {
  const accounts = coaData as Account[];

  const tableOptions = {
    virtualization: {
      enabled: true,
    },
  };
  const { table } = useDataTable<Account>({
    data: accounts,
    columns: accountColumns,
    customOptions: tableOptions,
  });

  return <DataTable table={table} />;
}
