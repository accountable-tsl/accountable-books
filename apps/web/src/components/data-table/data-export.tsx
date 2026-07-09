import type {
  DataTransformFunction,
  ExportableData,
} from '@/shared/utils/export-utils';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  exportData,
  exportToCSV,
  exportToExcel,
} from '@/shared/utils/export-utils';
import { DownloadIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import type { CustomTable } from './types/data-table';

type ExportColumn = {
  id: string;
  columnDef: { header?: unknown };
};

/** Format a camelCase or snake_case column id as a Title Case label. */
function formatColumnLabel(columnId: string): string {
  return columnId
    .split(/(?=[A-Z])|_/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Map column ids to header labels, preferring the column's own header text. */
function buildColumnMapping(columns: ExportColumn[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const column of columns) {
    const headerText = column.columnDef.header;
    mapping[column.id] =
      headerText && typeof headerText === 'string'
        ? headerText
        : formatColumnLabel(column.id);
  }
  return mapping;
}

function buildColumnWidths(
  exportHeaders: string[],
  columnWidths?: Array<{ wch: number }>,
): Array<{ wch: number }> {
  return exportHeaders.map((_, index) => columnWidths?.[index] || { wch: 15 });
}

function compareDefinedValues(
  valueA: string | number | boolean,
  valueB: string | number | boolean,
  isDescending: boolean,
): number {
  if (typeof valueA === 'string' && typeof valueB === 'string') {
    return isDescending
      ? valueB.localeCompare(valueA)
      : valueA.localeCompare(valueB);
  }

  // For numeric and other comparable types
  if (isDescending) return valueB > valueA ? 1 : -1;
  return valueA > valueB ? 1 : -1;
}

function compareExportValues(
  valueA: ExportableData[string],
  valueB: ExportableData[string],
  isDescending: boolean,
): number {
  if (valueA === valueB) return 0;

  // Null/undefined values sort last ascending, first descending
  if (valueA === null || valueA === undefined) return isDescending ? 1 : -1;
  if (valueB === null || valueB === undefined) return isDescending ? -1 : 1;

  return compareDefinedValues(valueA, valueB, isDescending);
}

/**
 * Order items by the table's current sorting so the export matches what the
 * user sees. Returns the items unchanged when there is no sorting or the sort
 * field is not present in the data.
 */
function sortByTableSorting<TData extends ExportableData>(
  items: TData[],
  sorting: Array<{ id: string; desc: boolean }>,
): TData[] {
  if (sorting.length === 0) return items;

  const { id: sortField, desc: isDescending } = sorting[0];
  const sampleItem = items[0];
  if (sampleItem && !(sortField in sampleItem)) {
    console.warn(`Sort field "${sortField}" not found in data. Skipping sort.`);
    return items;
  }

  return [...items].sort((a, b) => {
    try {
      return compareExportValues(
        a[sortField as keyof TData],
        b[sortField as keyof TData],
        isDescending,
      );
    } catch (sortError) {
      console.error('Error during sorting:', sortError);
      return 0; // Maintain original order on error
    }
  });
}

interface DataTableExportProps<TData extends ExportableData> {
  table: CustomTable<TData>;
  data?: TData[];
  selectedData?: TData[];
  getSelectedItems?: () => Promise<TData[]>;
  getAllItems?: () => Promise<TData[]>;
  entityName?: string;
  columnMapping?: Record<string, string>;
  columnWidths?: Array<{ wch: number }>;
  headers?: string[];
  transformFunction?: DataTransformFunction<TData>;
  size?: 'sm' | 'default' | 'lg';
}

export function DataTableExport<TData extends ExportableData>({
  table,
  data: receivedData,
  selectedData,
  getSelectedItems,
  getAllItems,
  entityName = 'items',
  columnMapping,
  columnWidths,
  headers,
  transformFunction,
  size = 'default',
}: Readonly<DataTableExportProps<TData>>): ReactElement {
  const [isLoading, setIsLoading] = useState(false);
  const data = receivedData ?? table.customOptions?.stableData;
  if (!data) return <></>;

  const getVisibleColumns = () =>
    table
      .getAllColumns()
      .filter((column) => column.getIsVisible())
      .filter((column) => column.id !== 'actions' && column.id !== 'select');

  // Create a data fetching function based on the current state
  const fetchExportData = async (): Promise<TData[]> => {
    // If we have selected items and a function to get their complete data
    if (getSelectedItems && selectedData && selectedData.length > 0) {
      // Check if data is on current page or needs to be fetched
      if (selectedData.some((item) => Object.keys(item).length === 0)) {
        // We have placeholder data, need to fetch complete data
        toast.loading('Preparing export...', {
          description: `Fetching complete data for selected ${entityName}.`,
          id: 'export-data-toast',
        });
      }

      // Fetch complete data for selected items
      const selectedItems = await getSelectedItems();

      if (selectedItems.length === 0) {
        throw new Error(
          `Failed to retrieve complete data for selected ${entityName}`,
        );
      }

      // Order the items according to the current sorting in the table
      // This preserves the table's page order in the exported data
      return sortByTableSorting(selectedItems, table.getState().sorting);
    }

    // If we're exporting all data and have a method to get it with proper ordering
    if (getAllItems && !selectedData?.length) {
      toast.loading('Preparing export...', {
        description: `Fetching all ${entityName} with current sorting...`,
        id: 'export-data-toast',
      });

      // Fetch all data with server-side sorting applied
      const allItems = await getAllItems();

      if (allItems.length === 0) {
        throw new Error(`No ${entityName} available to export`);
      }

      return allItems;
    }

    // Otherwise use the provided data (current page data)
    if (!data || data.length === 0) {
      throw new Error('No data available for export');
    }
    return selectedData && selectedData.length > 0 ? selectedData : data;
  };

  const handleExport = async (type: 'csv' | 'excel') => {
    if (isLoading) return; // Prevent multiple export requests

    try {
      // Get visible columns from the table
      const visibleColumns = getVisibleColumns();

      // Generate export options based on visible columns and respect column order
      const columnOrder = table.getState().columnOrder;
      const orderedVisibleColumns =
        columnOrder.length > 0
          ? [...visibleColumns].sort((a, b) => {
              const aIndex = columnOrder.indexOf(a.id);
              const bIndex = columnOrder.indexOf(b.id);
              // If column isn't in the order array, put it at the end
              if (aIndex === -1) return 1;
              if (bIndex === -1) return -1;
              return aIndex - bIndex;
            })
          : visibleColumns;

      // Generate export headers - use provided headers if available, otherwise fall back to visible columns
      const exportHeaders =
        headers && headers.length > 0
          ? headers
          : orderedVisibleColumns.map((column) => column.id);

      // Auto-generate column mapping from table headers if not provided
      const exportColumnMapping =
        columnMapping ?? buildColumnMapping(orderedVisibleColumns);

      // Use the generic export function with proper options
      await exportData(
        type,
        fetchExportData,
        () => setIsLoading(true),
        () => setIsLoading(false),
        {
          entityName,
          headers: exportHeaders,
          columnMapping: exportColumnMapping,
          columnWidths: buildColumnWidths(exportHeaders, columnWidths),
          transformFunction,
        },
      );
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error('Export failed', {
        description: 'There was a problem exporting. Please try again.',
        id: 'export-data-toast',
      });
      setIsLoading(false);
    }
  };

  const exportAllPages = async (type: 'csv' | 'excel') => {
    if (isLoading || !getAllItems) return;
    setIsLoading(true);

    try {
      // Show toast for long operations
      toast.loading('Preparing export...', {
        description: `Fetching all ${entityName}...`,
        id: 'export-data-toast',
      });

      // Fetch all data with server-side sorting
      const allData = await getAllItems();

      if (allData.length === 0) {
        toast.error('Export failed', {
          description: 'No data available to export.',
          id: 'export-data-toast',
        });
        return;
      }

      // Get visible columns and apply export
      const visibleColumns = getVisibleColumns();

      const exportHeaders =
        headers && headers.length > 0
          ? headers
          : visibleColumns.map((column) => column.id);

      // Auto-generate column mapping if not provided - from the custom headers
      // when given, otherwise from the visible columns
      const exportColumnMapping =
        columnMapping ??
        (headers && headers.length > 0
          ? Object.fromEntries(
              headers.map((header) => [header, formatColumnLabel(header)]),
            )
          : buildColumnMapping(visibleColumns));

      // Update toast for processing
      toast.loading('Processing data...', {
        description: 'Generating export file...',
        id: 'export-data-toast',
      });

      // Generate timestamp for filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${entityName}-all-pages-export-${timestamp}`;

      // Export based on type
      let success = false;
      if (type === 'csv') {
        success = exportToCSV(
          allData,
          filename,
          exportHeaders,
          exportColumnMapping,
          transformFunction,
        );
      } else {
        success = exportToExcel(
          allData,
          filename,
          exportColumnMapping,
          buildColumnWidths(exportHeaders, columnWidths),
          exportHeaders,
          transformFunction,
        );
      }

      if (success) {
        toast.success('Export successful', {
          description: `Exported all ${allData.length} ${entityName} to ${type.toUpperCase()}.`,
          id: 'export-data-toast',
        });
      }
    } catch (error) {
      console.error('Error exporting all pages:', error);
      toast.error('Export failed', {
        description:
          'There was a problem exporting all pages. Please try again.',
        id: 'export-data-toast',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Check if any rows are selected
  const hasSelection = selectedData && selectedData.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <DownloadIcon className="mr-2 h-4 w-4" />
              Export
              {hasSelection && (
                <span className="ml-1">({selectedData?.length})</span>
              )}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasSelection ? (
          <>
            <DropdownMenuItem
              onClick={() => handleExport('csv')}
              disabled={isLoading}
            >
              Export Selected as CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleExport('excel')}
              disabled={isLoading}
            >
              Export Selected as XLS
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem
              onClick={() => handleExport('csv')}
              disabled={isLoading}
            >
              Export Current Page as CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleExport('excel')}
              disabled={isLoading}
            >
              Export Current Page as XLS
            </DropdownMenuItem>
            {getAllItems && (
              <>
                <DropdownMenuItem
                  onClick={() => exportAllPages('csv')}
                  disabled={isLoading}
                >
                  Export All Pages as CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportAllPages('excel')}
                  disabled={isLoading}
                >
                  Export All Pages as XLS
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
