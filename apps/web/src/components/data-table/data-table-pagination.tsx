import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTableProps } from '@/components/data-table/types/data-table';
import { getPageSizeOptions } from '@/components/data-table/utils/pagination-utils';
import { useCallback, useMemo } from 'react';

interface DataTablePaginationProps<TData> {
  table: DataTableProps<TData>['table'];
}

export function DataTablePagination<TData>({ table }: DataTablePaginationProps<TData>) {
  const pagination = table?.customOptions?.pagination;
  const totalFilteredRows = table.getFilteredRowModel().rows.length;

  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination?.pageIndex ?? 0;
  const pageSize = table.getState().pagination?.pageSize ?? 10;
  const selectedRows = table.getFilteredSelectedRowModel().rows.length;

  const pageSizeOptions = useMemo(() => {
    return getPageSizeOptions({
      options: pagination,
      totalRows: totalFilteredRows,
    });
  }, [pagination, totalFilteredRows]);

  const currentPageSize = table.getState().pagination.pageSize;

  // Determine the display value for the current page size
  const getDisplayValue = useCallback((pageSize: number) => {
    return pageSize === totalFilteredRows ? 'All' : pageSize.toString();
  }, []);

  // Get the current value for the select (either number or "all")
  const getCurrentValue = () => {
    return currentPageSize === totalFilteredRows ? 'all' : currentPageSize.toString();
  };

  const startRow = totalFilteredRows === 0 ? 0 : pageIndex * pageSize + 1;
  const endRow = Math.min((pageIndex + 1) * pageSize, totalFilteredRows);

  return (
    <div className="flex items-center justify-between px-2">
      <div className="text-muted-foreground flex-1 text-sm">
        Showing {startRow} - {endRow} of {totalFilteredRows} rows
        {selectedRows > 0 && ` | ${selectedRows} selected`}
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={getCurrentValue()}
            onValueChange={(value) => {
              if (value === 'all') {
                table.setPageSize(totalFilteredRows);
              } else {
                table.setPageSize(Number(value));
              }
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={getDisplayValue(currentPageSize)} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize === 'all' ? 'All' : pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          Page {table.getState().pagination.pageIndex + 1} of {pageCount}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
