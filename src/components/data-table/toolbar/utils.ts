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
  const a = DEFAULT_CONFIG;
  const b = userConfig;
  return {
    layout: {
      left: mergeSection(a.layout.left, b.layout.left),
      center: mergeSection(a.layout.center, b.layout.center),
      right: mergeSection(a.layout.right, b.layout.right),
    },
    defaults: {
      ...a.defaults,
      ...b.defaults, // b overrides a
    },
  };
}

function mergeSection(
  a: ToolbarItem[] = [],
  b: ToolbarItem[] = []
): ToolbarItem[] {
  const result: ToolbarItem[] = [];

  const byPosition = new Map<number, ToolbarItem>();

  // Add all items from a into map by position
  for (const item of a) {
    byPosition.set(item.position, item);
  }

  // Add all items from b, replacing any in a at same position
  for (const item of b) {
    byPosition.set(item.position, item);
  }

  // Now, to resolve conflicts and preserve shifting:
  const maxPosition = Math.max(
    ...[
      ...byPosition.keys(),
      ...a.map((i) => i.position),
      ...b.map((i) => i.position),
    ],
    0
  );

  const filled: Set<number> = new Set();
  const temp: ToolbarItem[] = [];

  // Insert items from b first, respecting their positions
  for (const item of b) {
    const { position } = item;
    temp[position] = item;
    filled.add(position);
  }

  // Now insert a's items, but skip if position is already filled, and shift forward if needed
  for (const item of a) {
    let pos = item.position;
    while (filled.has(pos)) pos++;
    temp[pos] = item;
    filled.add(pos);
  }

  // Build final array in order
  for (let i = 0; i <= temp.length; i++) {
    if (temp[i]) result.push(temp[i]);
  }

  return result;
}
