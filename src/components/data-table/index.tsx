import { DataTable } from "./data-table";
import { accountColumns } from "./fake/columns";
import { Account, generateCompanyAccounts } from "./fake/seed";
import { useDataTable } from "./hooks";
import coaData from "./fake/coa.json";

export function Table() {
  const accounts = coaData as Account[];
  const { table } = useDataTable<Account>({
    data: accounts,
    columns: accountColumns,
    columnResize: {
      enabled: true,
      mode: "onChange",
    },
  });

  return (
    <div>
      <DataTable table={table} virtualization={{ enabled: true }} />
    </div>
  );
}
