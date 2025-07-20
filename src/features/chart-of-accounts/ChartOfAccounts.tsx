import { SimpleSelect } from "@/components/SimpleSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AddBankAccountDialog } from "@/domains/bankAccounts/AddBankAccountDialog";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { Filter, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useChartOfAccountsQuery } from "./hooks";
import { useSession } from "@/features/auth/Session";
import { CenteredLoader } from "@/components/CenteredLoader";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableExtras } from "@/components/data-table/types";
import { useDataTable } from "@/components/data-table/use-data-table";
import { getCoaTableColumns } from "./coa-columns";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [isAddCoaDialogOpen, setIsAddCoaDialogOpen] = useState(false);
  const [isBankAccountDialogOpen, setIsBankAccountDialogOpen] = useState(false);

  const columns = useMemo(() => getCoaTableColumns(), []);
  const accountElements = [
    { label: "All", value: "all" },
    { label: "Assets", value: "assets" },
    { label: "Liabilities", value: "liabilities" },
    { label: "Income", value: "income" },
    { label: "Expenses", value: "expenses" },
    { label: "Equity", value: "equity" },
  ];

  const accountStatus = [
    { label: "All Status", value: "all" },
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
    { label: "Archived", value: "archived" },
  ];

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
  };

  const { table } = useDataTable({
    data: accounts || [],
    columns,
    customOptions,
  });
  if (isLoadingAccounts || sessionLoading) return <CenteredLoader />;
  if (!accounts) return null;

  const filteredAccounts = accounts.filter((account) => {
    return true;
  });

  const handleSelectAll = (checked: boolean) => {};

  const selectableAccountsCount = filteredAccounts.filter(
    (acc) => !acc.isLocked
  ).length;
  const isAllSelectableSelected =
    selectedAccounts.length === selectableAccountsCount &&
    selectableAccountsCount > 0;

  return (
    <div className="p-3 overflow-clip flex flex-col gap-4 h-full min-h-0">
      <div
        className={cn(
          "flex items-center justify-between min-w-0 max-w-full mt-1",
          selectedAccounts.length > 0 ? "blur" : ""
        )}
      >
        <div className="text-sm">
          Manage your account structure and classifications
        </div>
        {!isMobile && (
          <>
            <hr className="grow" />
            <div className="hidden xl:flex items-center gap-1 rounded-md bg-secondary dark:bg-card">
              {accountElements.map((tab) => {
                const isActive = (val: string) =>
                  val.toLowerCase() === accountElementFilter.toLowerCase();

                return (
                  <Button
                    key={tab.value}
                    variant="outline"
                    size="sm"
                    className={cn(
                      "font-light border-0 shadow-none",
                      isActive(tab.value)
                        ? "text-foreground border dark:border-0 !dark:bg-muted/50"
                        : "!bg-transparent text-foreground/50"
                    )}
                    onClick={() =>
                      setAccountElementFilter(tab.value.toLowerCase())
                    }
                  >
                    {tab.label}
                  </Button>
                );
              })}
            </div>
            <hr className="grow" />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsBankAccountDialogOpen(true)}
              >
                Add bank account
              </Button>
              <Button onClick={() => setIsAddCoaDialogOpen(true)}>
                Add account
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 md:opacity-60">
        <div className="relative flex-1">
          {/* <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          /> */}
        </div>
        <div className="flex gap-2">
          <SimpleSelect
            options={accountElements}
            value={accountElementFilter.toLowerCase()}
            onChange={(val) => setAccountElementFilter(val)}
            icon={<Filter className="h-4 w-4" />}
            width="w-full md:w-[10rem]"
          />
          <SimpleSelect
            options={accountStatus}
            value={statusFilter.toLowerCase()}
            onChange={(val) => setStatusFilter(val)}
            width="w-full md:w-[7.5rem]"
          />
        </div>
      </div>

      {/* Bulk Actions */}
      {!isMobile && selectedAccounts.length > 0 && (
        <div className="flex justify-between items-center p-4 border rounded-md bg-muted/30 overflow-clip gap-4">
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

      {/* Accounts Table */}
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>

      <AddBankAccountDialog
        open={isBankAccountDialogOpen}
        onOpenChange={setIsBankAccountDialogOpen}
      />
    </div>
  );
};

ChartOfAccounts.whyDidYouRender = true;
