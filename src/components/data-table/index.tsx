import { DataTable } from "./data-table";
import { accountColumns } from "./fake/columns";
import { Account, generateCompanyAccounts } from "./fake/seed";
import { useDataTable } from "./hooks";
import coaData from "./fake/coa.json";

export function Table() {
  const accounts = coaData as Account[];
  const { table } = useDataTable<Account>(accounts, accountColumns);

  return (
    <div>
      <DataTable table={table} />
    </div>
  );
}
