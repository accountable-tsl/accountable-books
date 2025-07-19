import { ColumnDef } from "@tanstack/react-table";
import { CoaResponse } from "@/features/chart-of-accounts/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const coaTableColumns: ColumnDef<CoaResponse>[] = [
  // {
  //   id: "select",
  //   header: ({ table }) => (
  //     <Checkbox
  //       checked={
  //         table.getIsAllPageRowsSelected() ||
  //         (table.getIsSomePageRowsSelected() && "indeterminate")
  //       }
  //       onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
  //       aria-label="Select all"
  //     />
  //   ),
  //   cell: ({ row }) => (
  //     <Checkbox
  //       checked={row.getIsSelected()}
  //       onCheckedChange={(value) => row.toggleSelected(!!value)}
  //       aria-label="Select row"
  //     />
  //   ),
  //   enableSorting: false,
  //   enableHiding: false,
  //   enableResizing: false,
  //   size: 32,
  //   minSize: 32,
  //   maxSize: 32,
  // },

  {
    id: "code",
    accessorKey: "code",
    header: "Code",
    enableSorting: true,
    size: 50,
    enableResizing: false,
  },
  {
    id: "account_name",
    accessorKey: "name",
    header: "Account Name",
    enableResizing: true,
    minSize: 200,
  },
  {
    id: "account_type",
    accessorKey: "accountTypeLabel",
    header: "Account Type",
    enableSorting: true,
    enableResizing: true,
  },
  {
    id: "account_element",
    accessorKey: "accountElementLabel",
    header: "Element",
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
