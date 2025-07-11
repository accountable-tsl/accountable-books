import { ColumnDef } from "@tanstack/react-table";
import { CoaResponse } from "@/features/chart-of-accounts/types";
import { ArrowUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const coaTableColumns: ColumnDef<CoaResponse>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },

  {
    id: "Code",
    accessorKey: "code",
    header: ({ column }) => {
      return (
        <div
          className="flex items-center"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Code <ArrowUpDown className="ml-2 h-3 w-3" />
        </div>
      );
    },
  },
  {
    id: "Account Name",
    accessorKey: "name",
    header: "Account Name",
  },
  {
    id: "Account Type",
    accessorKey: "accountTypeLabel",
    header: ({ column }) => {
      return (
        <div
          className="flex items-center"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Account Type <ArrowUpDown className="ml-2 h-3 w-3" />
        </div>
      );
    },
  },
  {
    id: "Account Element",
    accessorKey: "accountElementLabel",
    header: "Element",
  },
  {
    id: "Status",
    accessorKey: "isActive",
    header: "Status",
    cell: (props) => {
      const active =
        props.getValue() === "true" || props.getValue() === true
          ? "Active"
          : "Inactive";
      return (
        <Badge
          className={cn(
            "rounded-lg",
            active === "Inactive" ? "opacity-50" : ""
          )}
        >
          {active}
        </Badge>
      );
    },
  },
  {
    accessorKey: "description",
    header: "Description",
  },
];
