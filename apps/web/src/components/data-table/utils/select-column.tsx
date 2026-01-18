import type { ColumnDef } from '@tanstack/react-table';

import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

type SelectionColumnOptions = {
  id?: string;
  headerCheckboxClassName?: string;
  cellCheckboxClassName?: string;
};

export function createSelectionColumn<T>(
  options: SelectionColumnOptions = {},
): ColumnDef<T, any> {
  return {
    id: options.id || '__select__9x8b7c6d',
    header: ({ table }) => (
      <Checkbox
        className={cn(options.headerCheckboxClassName)}
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        className={options.cellCheckboxClassName}
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    size: 32,
    minSize: 32,
    maxSize: 32,
  };
}
