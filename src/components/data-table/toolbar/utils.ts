import type { Row, Column } from "@tanstack/react-table";
import type {
  ToolbarItem,
  ToolbarItemType,
  ToolbarSectionConfig,
  DataTableToolbarConfig,
} from "./types";
import { DEFAULT_CONFIG } from "./config";

// Multi-column filter function
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
export function generateSearchPlaceholder(labels: string[]): string {
  if (labels.length === 0) return "Search...";
  if (labels.length > 5) return "Search...";

  const lowerLabels = labels.map((label) => label.toLowerCase());

  if (lowerLabels.length === 1) return `Search by ${lowerLabels[0]}...`;

  if (lowerLabels.length === 2)
    return `Search by ${lowerLabels[0]} or ${lowerLabels[1]}...`;

  const lastLabel = lowerLabels.pop()!;

  return `Search by ${lowerLabels.join(", ")}, or ${lastLabel}...`;
}

// Helper function to categorize columns
export function categorizeColumns<TData>(columns: Column<TData>[]) {
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

// Helper function to resolve and sort items in a section
export function resolveToolbarItems(items: ToolbarItem[] = []): ToolbarItem[] {
  return items
    .filter((item) => {
      const shouldShow =
        typeof item.show === "function" ? item.show() : item.show !== false;
      return shouldShow;
    })
    .sort((a, b) => a.position - b.position)
    .map((item, _index, arr) => {
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
export function mergeConfigs(
  userConfig?: DataTableToolbarConfig
): DataTableToolbarConfig {
  if (!userConfig) return DEFAULT_CONFIG;
  const merged = { ...DEFAULT_CONFIG };
  // Merge each section
  Object.keys(userConfig.layout).forEach((section) => {
    const sectionKey = section as keyof ToolbarSectionConfig;
    const userItems = userConfig.layout[sectionKey] || [];
    const defaultItems = DEFAULT_CONFIG.layout[sectionKey] || [];
    // // Create a map of default items by type for easy lookup
    // const defaultItemMap = new Map(
    //   defaultItems.map((item) => [item.type, item])
    // );
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
