import { Column, Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DataTableSliderFilter } from "@/components/data-table/filter-components/slider";
import { DataTableDateFilter } from "@/components/data-table/filter-components/date";
import { DataTableFacetedFilter } from "@/components/data-table/filter-components/faceted";
import { DataTableViewOptions } from "@/components/data-table/filter-components/view-options";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { CustomTable } from "@/components/data-table/types";
import { DataTableExport } from "@/components/data-table/data-export";

export interface DataTableToolbarProps<TData>
  extends React.HTMLAttributes<HTMLDivElement> {
  table: CustomTable<TData>;
  children?: React.ReactNode;
  showViewOptions?: boolean;
  config?: DataTableToolbarConfig;
}

const DEFAULT_CONFIG: DataTableToolbarConfig = {
  layout: {
    left: [
      { type: "search", position: 1, show: true },
      { type: "filters", position: 2, show: true },
      { type: "reset", position: 3, show: true },
    ],
    right: [{ type: "viewOptions", position: 1, show: true }],
  },
};

export function DataTableToolbar<TData>({
  table,
  children,
  showViewOptions = true,
  className,
  config,
  ...props
}: DataTableToolbarProps<TData>) {
  const [globalSearchValue, setGlobalSearchValue] = useState<string>("");
  const globalSearchConfig = table?.customOptions?.globalSearch;
  const {
    enabled: globalSearchEnabled = false,
    type: globalSearchType = "table-wide",
    className: globalSearchClassName,
    placeholder: customPlaceholder,
    allowIndividualFilters,
  } = globalSearchConfig || {};

  const isFiltered =
    table.getState().columnFilters.length > 0 || table.getState().globalFilter;

  const filterableColumns = useMemo(
    () => table.getAllColumns().filter((column) => column.getCanFilter()),
    [table]
  );

  const {
    groupedTextColumns,
    individualTextColumns,
    otherColumns,
    globalSearchPlaceholder,
  } = useMemo(() => {
    const { groupedText, individualText, other } =
      categorizeColumns(filterableColumns);

    const labels = groupedText.map(
      (column) => column.columnDef.meta?.label || column.id
    );

    const placeholder =
      customPlaceholder ||
      (globalSearchType === "multi-column"
        ? generateSearchPlaceholder(labels)
        : "Search...");

    return {
      groupedTextColumns: groupedText,
      individualTextColumns: individualText,
      otherColumns: other,
      globalSearchPlaceholder: placeholder,
    };
  }, [filterableColumns, customPlaceholder]);

  const handleGlobalSearchChange = useCallback(
    (value: string) => {
      setGlobalSearchValue(value);

      const colsToSearch =
        globalSearchType === "table-wide"
          ? table.getAllColumns() // Search ALL columns for table-wide
          : groupedTextColumns; // Search only grouped text columns for multi-column

      const columnIds = colsToSearch.map((col) => col.id);
      table.options.globalFilterFn = createMultiColumnFilter(columnIds);
      table.setGlobalFilter(value || undefined);
    },
    [table, groupedTextColumns, globalSearchType]
  );

  const handleReset = useCallback(() => {
    setGlobalSearchValue("");
    table.resetColumnFilters();
    table.setGlobalFilter(undefined);
  }, [table]);

  // Merge user config with defaults
  const resolvedConfig = useMemo(() => mergeConfigs(config), [config]);

  const renderToolbarItem = useCallback((item: ToolbarItem, index: number) => {
    const key = item.key || `${item.type}-${index}`;

    switch (item.type) {
      case "search":
    }
  }, []);

  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      className={cn(
        "flex w-full items-start justify-between gap-2 p-1",
        className
      )}
      {...props}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {globalSearchEnabled && groupedTextColumns.length > 0 && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={globalSearchPlaceholder}
              value={globalSearchValue}
              onChange={(event) => handleGlobalSearchChange(event.target.value)}
              className={cn("pl-8 h-8 w-40 lg:w-56", globalSearchClassName)}
            />
          </div>
        )}
        {(!globalSearchEnabled || allowIndividualFilters) &&
          individualTextColumns.map((column) => (
            <DataTableToolbarFilter key={column.id} column={column} />
          ))}

        {otherColumns.map((column) => (
          <DataTableToolbarFilter key={column.id} column={column} />
        ))}
        {isFiltered && (
          <Button
            aria-label="Reset filters"
            variant="outline"
            size="sm"
            className="border-dashed"
            onClick={handleReset}
          >
            <X />
            Reset
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {children}

        {/* TODO: Treat later */}
        {/* <DataTableExport
          table={table as any}
          data={allItems}
          selectedData={selectedItems}
          getSelectedItems={getSelectedItems}
          entityName={entityName}
          columnMapping={columnMapping}
          columnWidths={columnWidths}
          headers={headers}
          transformFunction={transformFunction}
          size={config.size}
        /> */}
        {showViewOptions && <DataTableViewOptions table={table} />}
      </div>
    </div>
  );
}

/**
 * Renders a filter component for a given table column in the data table toolbar.
 *
 * This component determines the appropriate filter input to display based on the column's metadata,
 * such as filter variant (e.g., text, number, range, date, etc.), and provides the necessary input
 * controls for filtering the column's data.
 *
 * @template TData - The type of the data represented in the table rows.
 * @param {Object} props
 * @param {import("@tanstack/react-table").Column<TData, unknown>} props.column - The column instance for which to render the filter UI.
 * @returns {JSX.Element | null} The filter input element for the column, or null if no filter is applicable.
 */
interface DataTableToolbarFilterProps<TData> {
  column: Column<TData>;
}

function DataTableToolbarFilter<TData>({
  column,
}: DataTableToolbarFilterProps<TData>) {
  {
    const columnMeta = column.columnDef.meta;

    const onFilterRender = useCallback(() => {
      if (!columnMeta?.variant) return null;

      switch (columnMeta.variant) {
        case "text":
          return (
            <Input
              placeholder={columnMeta.placeholder ?? columnMeta.label}
              value={(column.getFilterValue() as string) ?? ""}
              onChange={(event) => column.setFilterValue(event.target.value)}
              className="h-8 w-40 lg:w-56"
            />
          );

        case "number":
          return (
            <div className="relative">
              <Input
                type="number"
                inputMode="numeric"
                placeholder={columnMeta.placeholder ?? columnMeta.label}
                value={(column.getFilterValue() as string) ?? ""}
                onChange={(event) => column.setFilterValue(event.target.value)}
                className={cn("h-8 w-[120px]", columnMeta.unit && "pr-8")}
              />
              {columnMeta.unit && (
                <span className="absolute top-0 right-0 bottom-0 flex items-center rounded-r-md bg-accent px-2 text-muted-foreground text-sm">
                  {columnMeta.unit}
                </span>
              )}
            </div>
          );

        case "range":
          return (
            <DataTableSliderFilter
              column={column}
              title={columnMeta.label ?? column.id}
            />
          );

        case "date":
        case "dateRange":
          return (
            <DataTableDateFilter
              column={column}
              title={columnMeta.label ?? column.id}
              multiple={columnMeta.variant === "dateRange"}
            />
          );

        case "select":
        case "multiSelect":
          return (
            <DataTableFacetedFilter
              column={column}
              title={columnMeta.label ?? column.id}
              options={columnMeta.options ?? []}
              multiple={columnMeta.variant === "multiSelect"}
            />
          );

        default:
          return null;
      }
    }, [column, columnMeta]);

    return onFilterRender();
  }
}

export function createMultiColumnFilter<TData>(columnIds: string[]) {
  return (row: Row<TData>, _columnId: string, filterValue: string): boolean => {
    if (!filterValue?.trim()) return true;

    const searchValue = filterValue.toLowerCase().trim();

    return columnIds.some((colId) => {
      const cellValue = row.getValue(colId);
      if (cellValue == null) return false;
      return String(cellValue).toLowerCase().includes(searchValue);
    });
  };
}

// Helper function to generate search placeholder text
function generateSearchPlaceholder(labels: string[]): string {
  if (labels.length === 0) return "Search...";
  if (labels.length > 5) return "Search...";

  const lowerLabels = labels.map((label) => label.toLowerCase());

  if (lowerLabels.length === 1) {
    return `Search by ${lowerLabels[0]}...`;
  }

  if (lowerLabels.length === 2) {
    return `Search by ${lowerLabels[0]} or ${lowerLabels[1]}...`;
  }

  const lastLabel = lowerLabels.pop()!;
  return `Search by ${lowerLabels.join(", ")}, or ${lastLabel}...`;
}

// Helper function to categorize columns
function categorizeColumns<TData>(columns: Column<TData>[]) {
  const groupedText: Column<TData>[] = [];
  const individualText: Column<TData>[] = [];
  const other: Column<TData>[] = [];

  columns.forEach((column) => {
    const columnMeta = column.columnDef.meta;

    const isGroupedTextColumn =
      columnMeta?.variant === "text" &&
      columnMeta.separateFilter !== true &&
      column.getCanFilter();

    const isIndividualTextColumn =
      columnMeta?.variant === "text" &&
      columnMeta.separateFilter === true &&
      column.getCanFilter();

    if (isGroupedTextColumn) {
      groupedText.push(column);
    } else if (isIndividualTextColumn) {
      individualText.push(column);
    } else {
      other.push(column);
    }
  });

  return { groupedText, individualText, other };
}

// Types for the flexible toolbar configuration
export type ToolbarItemType =
  | "search"
  | "filters"
  | "reset"
  | "viewOptions"
  | "custom";

export type ToolbarSection = "left" | "center" | "right";

export interface ToolbarItem {
  type: ToolbarItemType;
  position: number;
  component?: React.ComponentType<any>;
  props?: Record<string, any>;
  key?: string; // For handling duplicates
  show?: boolean | (() => boolean); // Conditional rendering
  mobile?: {
    position?: number;
    section?: ToolbarSection;
    hide?: boolean;
  };
}

export interface ToolbarSectionConfig {
  left?: ToolbarItem[];
  center?: ToolbarItem[];
  right?: ToolbarItem[];
}

export interface DataTableToolbarConfig {
  layout: ToolbarSectionConfig;
  // Global overrides for default behavior
  defaults?: {
    showSearch?: boolean;
    showFilters?: boolean;
    showReset?: boolean;
    showViewOptions?: boolean;
  };
}

// Helper function to resolve and sort items in a section
function resolveToolbarItems(items: ToolbarItem[] = []): ToolbarItem[] {
  return items
    .filter((item) => {
      const shouldShow =
        typeof item.show === "function" ? item.show() : item.show !== false;
      return shouldShow;
    })
    .sort((a, b) => a.position - b.position)
    .map((item, index, arr) => {
      // Handle position conflicts by auto-incrementing
      const conflictingItems = arr.filter((i) => i.position === item.position);
      if (conflictingItems.length > 1) {
        const conflictIndex = conflictingItems.indexOf(item);
        return { ...item, position: item.position + conflictIndex };
      }
      return item;
    })
    .sort((a, b) => a.position - b.position);
}

// Helper to merge user config with defaults
function mergeConfigs(
  userConfig?: DataTableToolbarConfig
): DataTableToolbarConfig {
  if (!userConfig) return DEFAULT_CONFIG;

  const merged = { ...DEFAULT_CONFIG };

  // Merge each section
  Object.keys(userConfig.layout).forEach((section) => {
    const sectionKey = section as keyof ToolbarSectionConfig;
    const userItems = userConfig.layout[sectionKey] || [];
    const defaultItems = DEFAULT_CONFIG.layout[sectionKey] || [];

    // Create a map of default items by type for easy lookup
    const defaultItemMap = new Map(
      defaultItems.map((item) => [item.type, item])
    );

    // Start with user-defined items
    const mergedItems = [...userItems];

    // Add default items that weren't overridden
    defaultItems.forEach((defaultItem) => {
      const isOverridden = userItems.some(
        (userItem) => userItem.type === defaultItem.type && !userItem.key
      );

      if (!isOverridden) {
        // Check if defaults are disabled
        const isDisabled =
          userConfig.defaults &&
          userConfig.defaults[
            `show${
              defaultItem.type.charAt(0).toUpperCase() +
              defaultItem.type.slice(1)
            }` as keyof typeof userConfig.defaults
          ] === false;

        if (!isDisabled) {
          mergedItems.push(defaultItem);
        }
      }
    });

    merged.layout[sectionKey] = mergedItems;
  });

  return merged;
}
