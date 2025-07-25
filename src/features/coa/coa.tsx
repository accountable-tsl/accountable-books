import { SimpleSelect } from "@/components/SimpleSelect";
import { Button } from "@/components/ui/button";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { Filter, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useChartOfAccountsQuery } from "./hooks";
import { useSession } from "@/features/auth/Session";
import { CenteredLoader } from "@/components/CenteredLoader";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableExtras } from "@/components/data-table/types";
import { useDataTable } from "@/components/data-table/use-data-table";
import { getCoaTableColumns } from "./coa-columns";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableToolbarConfig } from "@/components/data-table/toolbar";
import { AddAccountSelection } from "@/features/coa/coa-add-account";
import { QuickFilter } from "@/features/coa/coa-quickfilter";
import { getAccountElementOptions } from "@/features/coa/utils";
import { CoaActionBar } from "./coa-action-bar";

export const ChartOfAccounts: React.FC = () => {
  const isMobile = useIsMobile();
  const { companyId, loading: sessionLoading } = useSession();
  const {
    data: accounts,
    isLoading: isLoadingAccounts,
    isError,
  } = useChartOfAccountsQuery({
    companyId: companyId || "",
  });

  const [accountElementFilter, setAccountElementFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  const columns = useMemo(() => getCoaTableColumns(), []);

  const customOptions: DataTableExtras = {
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
              <QuickFilter
                isMobile={isMobile}
                accountElementFilter={accountElementFilter}
                setAccountElementFilter={setAccountElementFilter}
                options={elementOptions}
              />
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

  // Handle bulk selection
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked && accounts) {
        const selectableIds = accounts
          .filter((acc) => !acc.isLocked)
          .map((acc) => acc.id);
        setSelectedAccounts(selectableIds);
      } else {
        setSelectedAccounts([]);
      }
    },
    [accounts]
  );

  // Handle bulk actions
  const handleBulkArchive = useCallback(() => {
    // TODO: Implement bulk archive functionality
    console.log("Archiving accounts:", selectedAccounts);
    setSelectedAccounts([]);
  }, [selectedAccounts]);

  const handleBulkDelete = useCallback(() => {
    // TODO: Implement bulk delete functionality
    console.log("Deleting accounts:", selectedAccounts);
    setSelectedAccounts([]);
  }, [selectedAccounts]);

  // const selectableAccountsCount = accounts.filter(
  //   (acc) => !acc.isLocked
  // ).length;
  // const isAllSelectableSelected =
  //   selectedAccounts.length === selectableAccountsCount &&
  //   selectableAccountsCount > 0;

  const y = table.getSelectedRowModel().rows.map((row) => row.original);
  console.log(y);

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

  // No data state
  if (!accounts || accounts.length === 0) {
    return (
      <div className="p-3 flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No accounts found</p>
          {/* <Button onClick={() => setIsAddCoaDialogOpen(true)}>
            Add your first account
          </Button> */}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 overflow-clip flex flex-col gap-4 h-full min-h-0">
      {/* <div className="text-sm">
        Manage your account structure and classifications
      </div> */}

      {/* Accounts Table */}
      <DataTable table={table} actionBar={<CoaActionBar table={table} />}>
        <>
          <DataTableToolbar table={table} config={toolbarConfig} />
          {/* Bulk Actions
           * If any accounts are selected, and the selection is within the current filter, show the bulk actions
           */}

          {!isMobile && y.length > 0 && (
            <div className="flex justify-between items-center px-4 py-1 border rounded-md bg-muted/30 overflow-clip gap-4">
              <div className="flex items-center divide-x text-sm min-w-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="pr-2 truncate">10 accounts selected</div>
                  </TooltipTrigger>
                  <TooltipContent>10 accounts selected</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="pl-2 truncate">1 unused, 4 archived</div>
                  </TooltipTrigger>
                  <TooltipContent>1 unused, 4 archived</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button variant="outline" size="sm">
                  Archive
                </Button>
                <Button variant="destructive" size="sm">
                  Delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedAccounts([])}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      </DataTable>
    </div>
  );
};
