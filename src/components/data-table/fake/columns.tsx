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
  },
  {
    accessorKey: "accountType",
    header: "Type",
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
