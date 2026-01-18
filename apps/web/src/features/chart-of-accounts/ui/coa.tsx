import { useSession } from '@session';
import { useEffect, useMemo, useState } from 'react';

import { CenteredLoader } from '@/components/CenteredLoader';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import type { DataTableToolbarConfig } from '@/components/data-table/toolbar';
import type { DataTableInputOptions } from '@/components/data-table/types/data-table';
import { useDataTable } from '@/components/data-table/use-data-table';
import ErrorPage from '@/components/ErrorPage';
import { SmallScreenMessage } from '@/components/SmallScreenMessage';
import { Button } from '@/components/ui/button';
import { CoaActionBar } from '@/features/chart-of-accounts/ui/components/coa-action-bar';
import { AddAccountSelection } from '@/features/chart-of-accounts/ui/components/coa-add-selection';
import { QuickFilter } from '@/features/chart-of-accounts/ui/components/coa-quickfilter';
import { CoaViewer } from '@/features/chart-of-accounts/ui/components/coa-viewer';
import type { CoaResponse } from '@/modules/accounting/chart-of-accounts';
import {
  getAccountElementOptions,
  useChartOfAccountsQuery,
} from '@/modules/accounting/chart-of-accounts';
import { useIsMobile } from '@/shared/hooks/use-media-query';

import { getCoaTableColumns } from './config/coa-columns';

export const ChartOfAccounts: React.FC = () => {
  const isMobile = useIsMobile();
  const { companyId, loading: sessionLoading } = useSession();
  const {
    data: coaAccounts,
    isLoading: isLoadingAccounts,
    isError,
  } = useChartOfAccountsQuery({
    companyId: companyId!,
    includeDeleted: false,
  });

  const [accountElementFilter, setAccountElementFilter] = useState('all');

  const columns = useMemo(() => getCoaTableColumns(), []);
  const accounts = useMemo(
    () => coaAccounts?.filter((coa) => !coa.isDeleted) || [],
    [coaAccounts],
  );

  const customOptions: DataTableInputOptions<CoaResponse> = {
    pagination: {
      enabled: true,
      initialPageSize: 15,
    },
    rowSelection: {
      enabled: true,
    },
    globalSearch: {
      enabled: true,
      type: 'table-wide',
    },
    customClassNames: {
      table: 'flex-1',
    },
    rowClick: {
      mode: 'view',
      wrapper: 'sheet',
      render: (props) =>
        companyId ? <CoaViewer companyId={companyId} {...props} /> : <></>,
    },
  };

  const { table } = useDataTable({
    data: accounts || [],
    columns,
    customOptions,
  });

  const parentElementColumn = useMemo(() => {
    return table.getColumn('parent_account_element');
  }, [table]);

  const elementOptions = useMemo(
    () => getAccountElementOptions(parentElementColumn),
    [parentElementColumn],
  );

  const toolbarConfig = useMemo(
    (): DataTableToolbarConfig => ({
      layout: {
        right: [
          {
            type: 'custom',
            position: 1,
            component: AddAccountSelection,
            key: 'add-account',
          },
        ],

        center: [
          {
            type: 'custom',
            position: 1,
            component: () => (
              <div className="relative flex-1">
                <QuickFilter
                  isMobile={isMobile}
                  accountElementFilter={accountElementFilter}
                  setAccountElementFilter={setAccountElementFilter}
                  options={elementOptions}
                />
              </div>
            ),
          },
        ],
      },
      classNames: {
        centerSection: 'flex-1 gap-0',
      },
    }),
    [elementOptions, accountElementFilter, isMobile, setAccountElementFilter],
  );

  useEffect(() => {
    if (!parentElementColumn) return;

    const nextFilter =
      accountElementFilter === 'all' ? undefined : accountElementFilter;
    parentElementColumn.setFilterValue(nextFilter);
  }, [accountElementFilter, parentElementColumn]);

  // Loading states
  if (isLoadingAccounts || sessionLoading) {
    return <CenteredLoader />;
  }

  // Error state
  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-3">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load accounts</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!companyId) {
    return <ErrorPage type="default" />;
  }

  // Mobile
  if (isMobile) {
    return <SmallScreenMessage />;
  }

  // No data state
  if (!accounts || accounts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-3">
        <p className="text-muted-foreground mb-4">No accounts found</p>
        <AddAccountSelection />
      </div>
    );
  }

  // TODO: Perhaps add a column for balances in the future
  return (
    <div className="flex h-full min-h-0 flex-col overflow-clip p-3">
      <div className="pb-2 text-sm">
        {/* Manage your account structure and classifications */}
      </div>

      {/* Accounts Table */}
      <DataTable
        table={table}
        actionBar={
          <CoaActionBar
            table={table}
            className="bottom-12"
            companyId={companyId}
          />
        }
      >
        <DataTableToolbar table={table} config={toolbarConfig} />
      </DataTable>
    </div>
  );
};
