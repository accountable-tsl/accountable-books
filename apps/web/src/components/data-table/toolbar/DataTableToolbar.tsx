import React, { useCallback, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { DataTableViewOptions } from '@/components/data-table/filter-components/view-options';
import {
  generateSearchPlaceholder,
  categorizeColumns,
  resolveToolbarItems,
  mergeConfigs,
} from './utils';
import type { DataTableToolbarProps, ToolbarItem } from './types';
import { DataTableToolbarFilter } from './DataTableToolbarFilter';

export function DataTableToolbar<TData>({
  table,
  children,
  showViewOptions = true,
  className,
  config,
  ...props
}: DataTableToolbarProps<TData>) {
  const [globalSearchValue, setGlobalSearchValue] = useState<string>('');
  const globalSearchConfig = table?.customOptions?.globalSearch;
  const {
    enabled: globalSearchEnabled = false,
    type: globalSearchType = 'table-wide',
    className: globalSearchClassName,
    placeholder: customPlaceholder,
    allowIndividualFilters,
  } = globalSearchConfig || {};

  const classNames = config?.classNames || {};

  const isFiltered =
    table.getState().columnFilters.length > 0 || table.getState().globalFilter;

  const filterableColumns = useMemo(
    () => table.getAllColumns().filter((column) => column.getCanFilter()),
    [table],
  );

  const {
    groupedTextColumns,
    individualTextColumns,
    otherColumns,
    globalSearchPlaceholder,
  } = useMemo(() => {
    try {
      const { groupedText, individualText, other } =
        categorizeColumns(filterableColumns);
      const labels = groupedText.map(
        (column) => column.columnDef.meta?.label || column.id,
      );
      const placeholder =
        customPlaceholder ||
        (globalSearchType === 'multi-column'
          ? generateSearchPlaceholder(labels)
          : 'Search...');
      return {
        groupedTextColumns: groupedText,
        individualTextColumns: individualText,
        otherColumns: other,
        globalSearchPlaceholder: placeholder,
      };
    } catch (error) {
      return {
        groupedTextColumns: [],
        individualTextColumns: filterableColumns,
        otherColumns: [],
        globalSearchPlaceholder: 'Search...',
      };
    }
  }, [filterableColumns, customPlaceholder]);

  const handleGlobalSearchChange = useCallback(
    (value: string) => {
      setGlobalSearchValue(value);
      const colsToSearch =
        globalSearchType === 'table-wide'
          ? table.getAllColumns() // Search ALL columns for table-wide
          : groupedTextColumns; // Search only grouped text columns for multi-column

      const columnIds = colsToSearch.map((col) => col.id);
      const globalSearchColFn = table?.customOptions?.setGlobalSearchColumns;
      if (globalSearchColFn) globalSearchColFn(columnIds);

      table.setGlobalFilter(value || undefined);
    },
    [table, groupedTextColumns, globalSearchType],
  );

  const handleReset = useCallback(() => {
    setGlobalSearchValue('');
    table.resetColumnFilters();
    table.setGlobalFilter(undefined);
  }, [table]);

  // Merge user config with defaults
  const resolvedConfig = useMemo(() => mergeConfigs(config), [config]);

  // Deep memoization of resolved items to prevent component re-mounting
  const toolbarSections = useMemo(
    () => ({
      left: resolveToolbarItems(resolvedConfig.layout.left),
      center: resolveToolbarItems(resolvedConfig.layout.center),
      right: resolveToolbarItems(resolvedConfig.layout.right),
    }),
    [resolvedConfig.layout],
  );

  // Memoized component renderers for each toolbar item type
  const renderedItems = useMemo(() => {
    const renderItem = (
      item: ToolbarItem,
      sectionKey: string,
      index: number,
    ) => {
      const key = item.key || `${sectionKey}-${item.type}-${index}`;

      switch (item.type) {
        case 'search': {
          const searchComponents = [
            ...(globalSearchEnabled && groupedTextColumns.length > 0
              ? [
                  <div className="relative" key="global-search">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={globalSearchPlaceholder}
                      value={globalSearchValue}
                      onChange={(event) =>
                        handleGlobalSearchChange(event.target.value)
                      }
                      className={cn(
                        'pl-8 h-8 w-40 lg:w-56',
                        globalSearchClassName,
                      )}
                    />
                  </div>,
                ]
              : []),
            ...(!globalSearchEnabled || allowIndividualFilters
              ? individualTextColumns.map((column) => (
                  <DataTableToolbarFilter key={column.id} column={column} />
                ))
              : []),
          ];
          return searchComponents.length > 0 ? (
            <React.Fragment key={key}>{searchComponents}</React.Fragment>
          ) : null;
        }
        case 'filters': {
          const filterComponents = [
            ...otherColumns.map((column) => (
              <DataTableToolbarFilter
                key={`${key}-${column.id}`}
                column={column}
              />
            )),
          ];
          return filterComponents.length > 0 ? (
            <React.Fragment key={key}>{filterComponents}</React.Fragment>
          ) : null;
        }
        case 'reset': {
          if (!isFiltered) return null;
          return (
            <Button
              aria-label="Reset filters"
              variant="outline"
              size="sm"
              className="border-dashed"
              onClick={handleReset}
              key={key}
            >
              <X />
              Reset
            </Button>
          );
        }
        case 'viewOptions': {
          if (!showViewOptions) return null;
          return (
            <DataTableViewOptions
              key={key}
              table={table}
              {...(item.props || {})}
            />
          );
        }
        case 'custom': {
          if (!item.component) return null;
          const CustomComponent = item.component;
          return (
            <CustomComponent key={key} table={table} {...(item.props || {})} />
          );
        }
        default:
          return null;
      }
    };

    return {
      left: toolbarSections.left
        .map((item, index) => renderItem(item, 'left', index))
        .filter(Boolean),
      center: toolbarSections.center
        .map((item, index) => renderItem(item, 'center', index))
        .filter(Boolean),
      right: toolbarSections.right
        .map((item, index) => renderItem(item, 'right', index))
        .filter(Boolean),
    };
  }, [
    globalSearchEnabled,
    groupedTextColumns,
    globalSearchPlaceholder,
    globalSearchValue,
    handleGlobalSearchChange,
    globalSearchClassName,
    allowIndividualFilters,
    individualTextColumns,
    otherColumns,
    isFiltered,
    handleReset,
    showViewOptions,
    table,
  ]);

  // Resolve items for each section
  const {
    left: leftItems,
    center: centerItems,
    right: rightItems,
  } = renderedItems;

  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      className={cn(
        'flex w-full items-center justify-between gap-2 py-1',
        className,
        classNames?.toolbar ?? '',
      )}
      {...props}
    >
      {/* Left section */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-2',
          classNames?.leftSection || '',
        )}
      >
        {leftItems}
      </div>

      {/* Center section */}
      {centerItems.length > 0 && centerItems && (
        <div
          className={cn(
            'flex items-center gap-2',
            classNames?.centerSection || '',
          )}
        >
          {centerItems}
        </div>
      )}

      {/* Right section */}
      <div
        className={cn(
          'flex items-center gap-2',
          classNames?.rightSection || '',
        )}
      >
        {rightItems}
        {children}
      </div>
    </div>
  );
}
