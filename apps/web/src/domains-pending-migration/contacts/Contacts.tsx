import { useDataTable } from '@/components/data-table/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { getContactColumns } from '@/domains-pending-migration/contacts/contacts-columns';
import { useCallback, useMemo, useState } from 'react';
import { useContacts } from '@/domains-pending-migration/contacts/contacts-hooks';
import { useSession } from '@session';
import ErrorPage from '@/components/ErrorPage';
import { CenteredLoader } from '@/components/CenteredLoader';
import type { Contacts as ContactResponse } from '@/domains-pending-migration/contacts/contacts-types';
import type { DataTableInputOptions } from '@/components/data-table/types/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Separator } from '@/components/ui/separator';
import type { DataTableToolbarConfig } from '@/components/data-table/toolbar';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { AddContactDialog } from '@/domains-pending-migration/contacts/contacts-add';

export const Contacts = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [page, _setPage] = useState(1);
  const [limit, _setLimit] = useState(30);

  const { companyId, loading } = useSession();
  const { data, isLoading, isError } = useContacts({
    companyId: companyId || '',
    page,
    limit,
  });

  const contacts = useMemo(() => data?.data?.contacts, [data]);
  const columns = useMemo(() => getContactColumns(), []);
  const tableOptions: DataTableInputOptions<ContactResponse[]> = useMemo(() => {
    return {
      globalSearch: {
        enabled: true,
      },
      pagination: {
        enabled: true,
        initialPageSize: 15,
      },
    };
  }, []);

  const openDialog = useCallback(() => setIsDialogOpen(true), []);

  const AddButton = () => (
    <Button size="sm" className="max-h-full" onClick={openDialog}>
      <Plus className="w-3 h-3" /> Add Contact
    </Button>
  );

  const toolbarConfig: DataTableToolbarConfig = {
    layout: {
      right: [
        {
          type: 'custom',
          position: 1,
          component: AddButton,
          key: 'add-button',
        },
      ],
    },
  };

  const { table } = useDataTable({
    data: contacts || [],
    columns,
    customOptions: tableOptions,
  });

  if (loading || isLoading) {
    return <CenteredLoader />;
  }

  if (!companyId || isError) {
    return <ErrorPage type="default" />;
  }

  return (
    <div className="flex flex-col max-w-full overflow-clip p-4 gap-4">
      <div>
        <p>Contacts</p>
        <p className="text-sm text-muted-foreground">
          Manage customers, vendors, employees and other contacts
        </p>
        <Separator className="mt-2" />
      </div>

      <DataTable table={table}>
        <DataTableToolbar table={table} config={toolbarConfig} />
      </DataTable>

      <AddContactDialog
        companyId={companyId!}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </div>
  );
};
