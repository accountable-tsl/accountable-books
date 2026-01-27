import type { DataTableToolbarConfig } from '@/components/data-table/toolbar';
import type { DataTableInputOptions } from '@/components/data-table/types/data-table';
import type { Project } from '@/modules/projects/model/types';
import { useCallback, useMemo, useState } from 'react';
import { CenteredLoader } from '@/components/CenteredLoader';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { useDataTable } from '@/components/data-table/use-data-table';
import ErrorPage from '@/components/ErrorPage';
import { Button } from '@/components/ui/button';
import { useFetchProjects } from '@/modules/projects/model/hooks';
import { useSession } from '@session';
import { Plus } from 'lucide-react';

import { AddProjectDialog } from './components/projects-add';
import { getProjectColumns } from './config/projects-columns';

export const Projects = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(30);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { companyId, loading } = useSession();
  const { data, isLoading, isError } = useFetchProjects({
    companyId: companyId || '',
    page,
    limit,
  });

  const projects: Project[] = useMemo(
    () => data?.data?.projects || [],
    [data?.data],
  );
  const columns = useMemo(() => getProjectColumns(), []);

  const openDialog = useCallback(() => setIsDialogOpen(true), []);

  const AddButton = () => (
    <Button size="sm" className="max-h-full" onClick={openDialog}>
      <Plus className="h-3 w-3" /> Add New Project
    </Button>
  );

  const tableOptions: DataTableInputOptions<Project[]> = useMemo(() => {
    return {
      globalSearch: {
        enabled: true,
      },
    };
  }, []);

  const { table } = useDataTable({
    data: projects,
    columns,
    customOptions: tableOptions,
  });

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

  if (loading || isLoading) {
    return <CenteredLoader />;
  }

  if (isError || !projects.length) {
    return <ErrorPage type="default" />;
  }

  return (
    <div className="flex max-w-full flex-col gap-4 overflow-clip p-4">
      <DataTable table={table}>
        <DataTableToolbar
          table={table}
          showViewOptions={false}
          config={toolbarConfig}
        />
      </DataTable>
      <AddProjectDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </div>
  );
};
