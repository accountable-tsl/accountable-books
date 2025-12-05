import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import coaData from '@/components/data-table/fake/coa.json';
import { getAccountColumns } from '@/components/data-table/fake/columns';
import type { Account } from '@/components/data-table/fake/seed';
import type { DataTableExtras } from '@/components/data-table/types/data-table';
import { useDataTable } from '@/components/data-table/use-data-table';

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
    enableSorting: true,
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  );
}
