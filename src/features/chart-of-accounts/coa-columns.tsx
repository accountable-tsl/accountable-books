import { ColumnDef } from "@tanstack/react-table";
import { CoaResponse } from "@/features/chart-of-accounts/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Text } from "lucide-react";

export function getCoaTableColumns(): ColumnDef<CoaResponse>[] {
  return [
    {
      id: "code",
      accessorKey: "code",
      header: "Code",
      cell: (props) => {
        return <div>{String(props.getValue())}</div>;
      },
      enableSorting: true,
      size: 50,
      enableResizing: false,
      enableColumnFilter: true,
      meta: {
        label: "Code",
        variant: "text",
        placeholder: "Search account code...",
        icon: Text,
      },
    },
    {
      id: "account_name",
      accessorKey: "name",
      header: "Account Name",
      enableResizing: true,
      minSize: 200,
      enableColumnFilter: true,
      meta: {
        label: "Account Name",
        variant: "text",
        placeholder: "Search account name...",
        icon: Text,
        separateFilter: true,
      },
    },
    {
      id: "account_type",
      accessorKey: "accountTypeLabel",
      header: "Account Type",
      enableSorting: true,
      enableResizing: true,
      enableColumnFilter: true,
      meta: {
        label: "Type",
        variant: "text",
        placeholder: "Search account type...",
        icon: Text,
      },
    },
    {
      id: "account_element",
      accessorKey: "accountElementLabel",
      header: "Element",
      meta: {
        label: "Element",
      },
    },
    {
      id: "status",
      accessorKey: "isActive",
      header: () => {
        return <div className="text-center">Status</div>;
      },
      cell: (props) => {
        const active =
          props.getValue() === "true" || props.getValue() === true
            ? "Active"
            : "Inactive";
        return (
          <div className="flex items-center justify-center">
            <Badge
              className={cn(
                "rounded-lg",
                active === "Inactive" ? "opacity-50" : ""
              )}
            >
              {active}
            </Badge>
          </div>
        );
      },
      size: 85,
      minSize: 85,
      maxSize: 85,
    },
    { id: "description", accessorKey: "description", header: "Description" },
  ];
}
