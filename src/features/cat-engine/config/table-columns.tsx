import { ColumnDef } from "@tanstack/react-table";

export const getCatEngineColumns = (): ColumnDef<any>[] => {
  return [
    {
      header: "Name",
      accessorKey: "name",
    },
  ];
};
