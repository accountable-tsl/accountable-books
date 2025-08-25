import { useCallback, useMemo, useState } from 'react';
import { getProjectColumns } from '@/features/projects/projects-columns';
import { useFetchProjects } from '@/features/projects/projects-hooks';
import { useSession } from '@/features/auth/Session';
import type { Project } from '@/features/projects/projects-types';
import type { DataTableInputOptions } from '@/components/data-table/types/data-table';
import { useDataTable } from '@/components/data-table/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar, type DataTableToolbarConfig } from '@/components/data-table/toolbar';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import { AddProjectDialog } from '@/features/projects/projects-add';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

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

  const projects: Project[] = useMemo(() => data?.data?.projects || [], [data?.data]);
  const columns = useMemo(() => getProjectColumns(), []);

  const openDialog = useCallback(() => setIsDialogOpen(true), []);

  const AddButton = () => (
    <Button size="sm" className="max-h-full" onClick={openDialog}>
      <Plus className="w-3 h-3" /> Add New Project
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
    <div className="flex flex-col max-w-full overflow-clip p-4 gap-4">
      <DataTable table={table}>
        <DataTableToolbar table={table} showViewOptions={false} config={toolbarConfig} />
      </DataTable>
      <AddProjectDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </div>
  );
};
