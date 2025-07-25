import { ColumnDef } from "@tanstack/react-table";
import { CoaResponse } from "@/features/coa/types";
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
        hidden: false,
      },
    },
    {
      accessorFn: (row) => {
        if (row.isDeleted) return "Archived";
        return row.isActive ? "Active" : "Inactive";
      },
      id: "status",
      header: () => {
        return <div className="text-center">Status</div>;
      },
      size: 85,
      minSize: 85,
      maxSize: 85,
      enableColumnFilter: true,
      meta: {
        label: "Status",
        variant: "multiSelect",
        options: [
          { label: "Active", value: "Active" },
          { label: "Inactive", value: "Inactive" },
          { label: "Archived", value: "Archived" },
        ],
      },
    },
    { id: "description", accessorKey: "description", header: "Description" },
    {
      id: "parent_account_element",
      accessorKey: "parentAccountElementKey",
      header: "Parent Element",
      enableColumnFilter: true,
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue === "all") return true;
        return row.getValue(columnId) === filterValue;
      },
      meta: {
        hidden: true,
      },
      maxSize: 100,
    },
  ];
}
