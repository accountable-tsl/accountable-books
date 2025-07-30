import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/shared/hooks/use-media-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useChartOfAccountsQuery } from "@/features/coa/hooks";
import { useSession } from "@/features/auth/Session";
import { CenteredLoader } from "@/components/CenteredLoader";
import { DataTable } from "@/components/data-table/data-table";
import {
  DataTableExtras,
  DataTableInputOptions,
} from "@/components/data-table/types/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { getCoaTableColumns } from "./coa-columns";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableToolbarConfig } from "@/components/data-table/toolbar";
import { AddAccountSelection } from "@/features/coa/coa-add-selection";
import { QuickFilter } from "@/features/coa/coa-quickfilter";
import { getAccountElementOptions } from "@/features/coa/utils";
import { CoaActionBar } from "@/features/coa/coa-action-bar";
import { SmallScreenMessage } from "@/components/SmallScreenMessage";
import { CoaViewer } from "@/features/coa/coa-viewer";
import { CoaResponse } from "@/features/coa/types";
import ErrorPage from "@/components/ErrorPage";

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

  const [accountElementFilter, setAccountElementFilter] = useState("all");

  const columns = useMemo(() => getCoaTableColumns(), []);
  const accounts = useMemo(
    () => coaAccounts?.filter((coa) => !coa.isDeleted) || [],
    [coaAccounts]
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
      type: "table-wide",
    },
    customClassNames: {
      table: "flex-1",
    },
    rowClick: {
      mode: "view",
      wrapper: "sheet",
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
    return table.getColumn("parent_account_element");
  }, [table]);

  const elementOptions = useMemo(
    () => getAccountElementOptions(parentElementColumn),
    [parentElementColumn, accounts]
  );

  const toolbarConfig = useMemo(
    (): DataTableToolbarConfig => ({
      layout: {
        right: [
          {
            type: "custom",
            position: 1,
            component: AddAccountSelection,
            key: "add-account",
          },
        ],

        center: [
          {
            type: "custom",
            position: 1,
            component: () => (
              <div className="flex-1 relative">
                <QuickFilter
                  isMobile={isMobile}
                  accountElementFilter={accountElementFilter}
                  setAccountElementFilter={setAccountElementFilter}
                  options={elementOptions}
                />

                {/* <CoaActionBar table={table} className="-bottom-1/2 border-0 " /> */}
              </div>
            ),
          },
        ],
      },
      classNames: {
        centerSection: "flex-1 gap-0",
      },
    }),
    [elementOptions, accountElementFilter, isMobile, setAccountElementFilter]
  );

  useEffect(() => {
    if (!parentElementColumn) return;

    const nextFilter =
      accountElementFilter === "all" ? undefined : accountElementFilter;
    parentElementColumn.setFilterValue(nextFilter);
  }, [accountElementFilter, parentElementColumn]);

  // Loading states
  if (isLoadingAccounts || sessionLoading) {
    return <CenteredLoader />;
  }

  // Error state
  if (isError) {
    return (
      <div className="p-3 flex items-center justify-center h-full">
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
      <div className="p-3 flex flex-col items-center justify-center h-full">
        <p className="text-muted-foreground mb-4">No accounts found</p>
        <AddAccountSelection />
      </div>
    );
  }

  // TODO: Perhaps add a column for balances in the future
  return (
    <div className="p-3 overflow-clip h-full min-h-0 flex flex-col">
      <div className="text-sm pb-2">
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
