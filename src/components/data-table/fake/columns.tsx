import { ColumnDef } from "@tanstack/react-table";
import { Account } from "./seed";

export const accountColumns: ColumnDef<Account>[] = [
  {
    accessorKey: "accountCode",
    header: "Code",
  },
  {
    accessorKey: "accountName",
    header: "Name",
    enableSorting: true,
  },
  {
    accessorKey: "accountType",
    header: "Type",
    enableSorting: true,
  },
  {
    accessorKey: "currency",
    header: "Currency",
  },
  {
    accessorKey: "currentBalance",
    header: "Balance",
  },
];
