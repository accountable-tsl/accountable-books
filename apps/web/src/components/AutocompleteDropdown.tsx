import type { VariantProps } from 'class-variance-authority';
import { Check, ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BeatLoader } from 'react-spinners';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/shared/hooks/use-media-query';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from './ui/drawer';

type Item =
  | string
  | {
      value: string;
      label: string;
    };

export interface ActionItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  className?: string;
}

export interface GroupedItems {
  id: string;
  label: string;
  items: any[];
}

interface NormalizedItem {
  value: string;
  label: string;
}

interface ClassNames {
  commandList?: string;
  actionItemsContainer?: string;
}

interface AutocompleteDropdownProps
  extends Omit<React.ComponentPropsWithoutRef<'input'>, 'value' | 'onChange'> {
  id?: string;
  items: Item[] | any[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  variant?: VariantProps<typeof buttonVariants>['variant'];
  searchPlaceholder?: string;
  mapItem?: (item: any) => { value: string; label: string };
  drawerTitle?: string;
  drawerDescription?: string;
  width?: string;
  disabled?: boolean;

  // New action item props
  actionItems?: ActionItem[];
  onAction?: (actionId: string) => void;
  showEmptyStateWithActions?: boolean; // default: true
  emptyStateMessage?: string; // default: "No options available"
  noResultsMessage?: string; // default: "No results found"

  // Grouping props
  groupBy?: string | ((item: any) => string);
  groupLabel?: string | ((item: any) => string);
  groups?: GroupedItems[];
  ungroupedLabel?: string; // default: "Other"
  groupOrder?: string[] | ((a: string, b: string) => number); // Custom group ordering

  // Async and infinite scroll
  async?: boolean;
  onSearchChange?: (query: string) => void;
  onLoadMore?: () => void;
  isLoading?: boolean; // Loading state for async fetches
  hasMore?: boolean;
  debounceTimeout?: number; //in ms

  chevron?: 'down' | 'updown';

  open?: boolean;
  onOpenChange?: (open: boolean) => void;

  classNames?: ClassNames;
}

// Helper function to get nested property value using dot notation
const getNestedValue = (obj: any, path: string): string => {
  if (!obj || !path) return '';
  return path.split('.').reduce((current, key) => current?.[key], obj) || '';
};

// Normalize items to { value, label } format
const normalizeItem = (
  item: any,
  mapItem?: (item: any) => { value: string; label: string },
): { value: string; label: string } => {
  // Handle strings
  if (typeof item === 'string') {
    return item.trim() !== ''
      ? { value: item, label: item }
      : { value: `fallback-${Math.random()}`, label: 'Unknown' };
  }

  // Handle API data with mapItem
  if (mapItem) {
    const mapped = mapItem(item);
    return mapped.value &&
      typeof mapped.value === 'string' &&
      mapped.value.trim() !== ''
      ? mapped
      : {
          value: `fallback-${Math.random()}`,
          label: mapped.label || 'Unknown',
        };
  }

  // Handle preformatted { value, label } objects
  return typeof item === 'object' &&
    item.value &&
    typeof item.value === 'string' &&
    item.value.trim() !== ''
    ? item
    : { value: `fallback-${Math.random()}`, label: item?.label || 'Unknown' };
};

const mergeRefs = <T,>(...refs: React.Ref<T>[]) => {
  return (node: T) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<T>).current = node;
      }
    });
  };
};

/**
 * A reusable dropdown with autocomplete search, supporting strings or objects.
 * Switches to Drawer on mobile (≤768px) and Popover on desktop.
 * Usage: <AutocompleteDropdown items={["Apple", "Banana"]} onValueChange={(v) => console.log(v)} />
 * or <AutocompleteDropdown items={apiData} mapItem={(item) => ({ value: item.id, label: item.name })} />
 */

export const AutocompleteDropdown = forwardRef<
  HTMLInputElement,
  AutocompleteDropdownProps
>((props, ref) => {
  const {
    id,
    items,
    value = '',
    onValueChange,
    placeholder = 'Select an option...',
    className,
    variant = 'outline',
    searchPlaceholder = 'Search...',
    mapItem,
    drawerTitle = ' ',
    drawerDescription = ' ',
    width = '', // w-200px for small
    disabled = false,

    actionItems = [],
    onAction,
    showEmptyStateWithActions = true,
    emptyStateMessage = 'No options available',
    noResultsMessage = 'No results found',

    groupBy,
    groupLabel,
    groups = [],
    ungroupedLabel = 'Other',
    groupOrder,

    async: asyncMode = false,
    onSearchChange,
    onLoadMore,
    isLoading = false,
    hasMore = false,
    debounceTimeout = 300,

    chevron = 'updown',

    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,

    classNames = {},

    ...rest
  } = props;
  const [internalOpen, setInternalOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value);
  const [searchQuery, setSearchQuery] = useState('');
  const lastItemObserver = useRef<IntersectionObserver | null>(null);

  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const isMobile = useMediaQuery('(max-width: 768px)');
  const selectedItemRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      // On mount: scroll into view
      requestAnimationFrame(() => {
        node.scrollIntoView({ behavior: 'auto', block: 'center' });
      });
    }
    // On unmount: React will pass null, nothing else needed
  }, []);

  const lastItemRef = useCallback(
    (node: HTMLDivElement) => {
      if (lastItemObserver.current) lastItemObserver.current.disconnect();

      if (!node || !hasMore || isLoading) return;

      lastItemObserver.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            onLoadMore?.();
          }
        },
        { threshold: 0.1 },
      );

      lastItemObserver.current.observe(node);
    },
    [hasMore, isLoading, onLoadMore],
  );

  const handleSelect = (searchValue: string) => {
    const currentValue = searchValue.split('|_|')[0].trim() || '';

    const selectedItem = normalizedItems.find(
      (item) => item.value === currentValue,
    );
    const newValue = selectedItem?.value === selectedValue ? '' : currentValue;

    setSelectedValue(newValue);
    onValueChange?.(newValue);
    setOpen(false);
  };

  const handleAction = (actionId: string) => {
    onAction?.(actionId);
    // Don't close dropdown automatically - let developer decide
  };

  // Sync external value with internal state
  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  // Reset state when closing dropdown
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      if (asyncMode && onSearchChange) {
        onSearchChange(''); // Reset async search
      }
    } else if (asyncMode && onSearchChange) {
      // Trigger initial search when opening
      onSearchChange('');
    }
  }, [open, asyncMode, onSearchChange]);

  // Debounced search handler
  useEffect(() => {
    if (!asyncMode || !onSearchChange) return;
    // if (searchQuery === "") return;

    const handler = setTimeout(() => {
      onSearchChange(searchQuery);
    }, debounceTimeout);

    return () => clearTimeout(handler);
  }, [searchQuery, debounceTimeout, asyncMode, onSearchChange]);

  // Normalize and filter items to ensure valid values
  const normalizedItems = useMemo(
    () =>
      items
        .map((item) => normalizeItem(item, mapItem))
        .filter((item) => item.value.trim() !== ''),
    [items, mapItem],
  );

  // Grouping
  const useGrouping = !!(groupBy || groups?.length || groupLabel);
  // Group items if grouping is enabled
  const groupedData = useMemo(() => {
    if (!useGrouping) return null;

    const result: GroupedItems[] = [];

    // Handle pre-grouped data
    if (groups?.length) {
      let groupsToProcess = groups;

      // Apply custom ordering if provided
      if (groupOrder) {
        if (typeof groupOrder === 'function') {
          groupsToProcess = [...groups].sort((a, b) => groupOrder(a.id, b.id));
        } else {
          // Order by provided array, then append any missing groups
          const orderedGroups = groupOrder
            .map((id) => groups.find((g) => g.id === id))
            .filter((g): g is GroupedItems => g !== undefined);
          const remainingGroups = groups.filter(
            (g) => !groupOrder.includes(g.id),
          );
          groupsToProcess = [...orderedGroups, ...remainingGroups];
        }
      }

      groupsToProcess.forEach((group) => {
        const normalizedGroupItems = group.items
          .map((item) => normalizeItem(item, mapItem))
          .filter((item) => item.value.trim() !== '');

        if (normalizedGroupItems.length > 0) {
          result.push({
            id: group.id,
            label: group.label,
            items: normalizedGroupItems,
          });
        }
      });
    }
    // Handle auto-grouping of items
    if (items.length > 0 && groupBy) {
      const itemGroups: { [key: string]: any[] } = {};
      const groupLabels: { [key: string]: string } = {};
      const ungroupedItems: any[] = [];

      items.forEach((item) => {
        // Get group key
        const groupKey =
          typeof groupBy === 'function'
            ? groupBy(item)
            : getNestedValue(item, groupBy);

        if (
          !groupKey ||
          groupKey === null ||
          groupKey === undefined ||
          groupKey === ''
        ) {
          ungroupedItems.push(item);
          return;
        }

        // Get group label
        let groupLabelText = groupKey;
        if (groupLabel) {
          groupLabelText =
            typeof groupLabel === 'function'
              ? groupLabel(item)
              : getNestedValue(item, groupLabel);
        }

        if (!itemGroups[groupKey]) {
          itemGroups[groupKey] = [];
          groupLabels[groupKey] = groupLabelText;
        }
        itemGroups[groupKey].push(item);
      });

      // Convert to GroupedItems format with custom ordering
      const groupKeys = Object.keys(itemGroups);
      const sortedGroupKeys = groupOrder
        ? typeof groupOrder === 'function'
          ? groupKeys.sort(groupOrder)
          : // Order by provided array, then append any missing keys
            [
              ...groupOrder.filter((key) => groupKeys.includes(key)),
              ...groupKeys.filter((key) => !groupOrder.includes(key)),
            ]
        : groupKeys.sort(); // Default to alphabetical

      sortedGroupKeys.forEach((groupKey) => {
        const normalizedGroupItems = itemGroups[groupKey]
          .map((item) => normalizeItem(item, mapItem))
          .filter((item) => item.value.trim() !== '');

        if (normalizedGroupItems.length > 0) {
          result.push({
            id: groupKey,
            label: groupLabels[groupKey],
            items: normalizedGroupItems,
          });
        }
      });

      if (ungroupedItems.length > 0) {
        const normalizedUngroupedItems = ungroupedItems
          .map((item) => normalizeItem(item, mapItem))
          .filter((item) => item.value.trim() !== '');

        if (normalizedUngroupedItems.length > 0) {
          result.push({
            id: 'ungrouped',
            label: ungroupedLabel, // Uses the prop you already have
            items: normalizedUngroupedItems,
          });
        }
      }
    }

    return result;
  }, [items, groups, groupBy, groupLabel, mapItem, useGrouping, groupOrder, ungroupedLabel]);

  // Create a flattened lookup map for O(1) access to all items
  // This serves as the single source of truth for item lookups
  const allItemsMap = useMemo(() => {
    const map = new Map<string, string>();

    // Add items from normalizedItems (for non-grouped or when groupBy is used)
    normalizedItems.forEach((item) => {
      map.set(item.value, item.label);
    });

    // Add items from groups (overwrites if duplicate, which is correct - groups take precedence)
    if (useGrouping && groupedData) {
      groupedData.forEach((group) => {
        group.items.forEach((item) => {
          map.set(item.value, item.label);
        });
      });
    }

    return map;
  }, [normalizedItems, useGrouping, groupedData]);

  // Filter items based on search query
  const filteredData = useMemo(() => {
    // In async mode, use all items (server handles filtering)
    if (asyncMode) {
      return useGrouping ? groupedData : normalizedItems;
    }

    const query = searchQuery.toLowerCase().trim();
    if (!query) return useGrouping ? groupedData : normalizedItems;

    if (!useGrouping) {
      return normalizedItems.filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          item.value.toLowerCase().includes(query),
      );
    }

    // Grouped filtering
    return (
      groupedData
        ?.map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              item.label.toLowerCase().includes(query) ||
              item.value.toLowerCase().includes(query),
          ),
        }))
        .filter((group) => group.items.length > 0) || []
    );
  }, [normalizedItems, groupedData, searchQuery, useGrouping, asyncMode]);

  // Calculate total items for last item detection
  const totalItems = useMemo(() => {
    if (!filteredData) return 0;
    if (!useGrouping) return (filteredData as NormalizedItem[]).length;
    return (
      (filteredData as GroupedItems[])?.reduce(
        (total, group) => total + group.items.length,
        0,
      ) || 0
    );
  }, [filteredData, useGrouping]);

  // Determine what to show based on grouping mode
  const hasRegularItems = useGrouping
    ? groupedData?.some((group) => group.items.length > 0) || false
    : normalizedItems.length > 0;

  const hasSearchResults = useGrouping
    ? Array.isArray(filteredData) &&
      (filteredData as GroupedItems[]).some((group) => group.items.length > 0)
    : Array.isArray(filteredData) && filteredData.length > 0;

  const showEmptyState = !hasRegularItems && showEmptyStateWithActions;
  const showNoResults =
    hasRegularItems && !hasSearchResults && searchQuery.length > 0;
  const showActionItems = actionItems.length > 0;

  // Shared content for Popover and Drawer
  const dropdownContent = (
    <Command shouldFilter={false} className="flex flex-col">
      <CommandInput
        id={id}
        ref={ref}
        placeholder={searchPlaceholder}
        className="h-9"
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList aria-busy={isLoading} className={classNames.commandList}>
        <CommandGroup>
          {!useGrouping && (
            <>
              {(filteredData as NormalizedItem[]).map((item, index) => {
                const isSelected = selectedValue === item.value;
                const isLastItem = index === totalItems - 1;
                let itemRef: React.Ref<HTMLDivElement> | undefined;

                if (isSelected) itemRef = selectedItemRef;
                if (isLastItem && hasMore)
                  itemRef = mergeRefs(itemRef || null, lastItemRef);

                return (
                  <CommandItem
                    key={item.value}
                    ref={itemRef}
                    value={`${item.value} |_| ${item.label}`}
                    onSelect={handleSelect}
                  >
                    {item.label}
                    <Check
                      className={cn(
                        'ml-auto',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                );
              })}
              {hasMore && isLoading && (
                <div className="text-muted-foreground py-3 text-center text-sm">
                  <BeatLoader />
                </div>
              )}
            </>
          )}

          {/* Grouped filtered items */}
          {useGrouping &&
            (() => {
              let itemCounter = 0;

              return (filteredData as GroupedItems[]).map(
                (group, groupIndex, allGroups) => (
                  <div key={group.id}>
                    <div className="text-muted-foreground px-2 pt-2 text-sm font-semibold">
                      {group.label}
                    </div>
                    <CommandSeparator className="my-1" />

                    {group.items.map((item) => {
                      itemCounter++;
                      const isSelected = selectedValue === item.value;
                      const isAbsoluteLast = itemCounter === totalItems;
                      let itemRef: React.Ref<HTMLDivElement> | undefined;

                      if (isSelected) itemRef = selectedItemRef;
                      if (isAbsoluteLast && hasMore)
                        itemRef = mergeRefs(itemRef || null, lastItemRef);

                      return (
                        <CommandItem
                          key={item.value}
                          ref={itemRef}
                          value={`${item.value} |_| ${item.label}`}
                          onSelect={handleSelect}
                        >
                          {item.label}
                          <Check
                            className={cn(
                              'ml-auto h-4 w-4',
                              isSelected ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                        </CommandItem>
                      );
                    })}

                    {groupIndex === allGroups.length - 1 &&
                      hasMore &&
                      isLoading && (
                        <div className="text-muted-foreground py-3 text-center text-sm">
                          <BeatLoader />
                        </div>
                      )}
                  </div>
                ),
              );
            })()}

          {showEmptyState && (
            <div className="text-muted-foreground py-6 text-center text-sm">
              {emptyStateMessage}
            </div>
          )}
          {showNoResults && (
            <div className="text-muted-foreground py-6 text-center text-sm">
              {noResultsMessage}
            </div>
          )}
        </CommandGroup>
      </CommandList>

      {/* Action items - fixed at bottom, outside scroll area */}
      {showActionItems && (
        <div className={cn('border-t', classNames.actionItemsContainer)}>
          <CommandGroup>
            {actionItems.map((action) => (
              <CommandItem
                key={action.id}
                value={`action-${action.id} |_| ${action.label}`}
                onSelect={() => handleAction(action.id)}
                className={cn('cursor-pointer', action.className)}
                role="button"
                aria-label={`Action: ${action.label}`}
              >
                {action.icon}
                {action.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </div>
      )}
    </Command>
  );

  // Get the label for the selected value using O(1) lookup
  const getSelectedLabel = useMemo(() => {
    if (!selectedValue) return placeholder;
    return allItemsMap.get(selectedValue) ?? placeholder;
  }, [selectedValue, allItemsMap, placeholder]);

  // Common trigger button
  const triggerButton = (
    <Button
      variant={variant}
      role="combobox"
      aria-expanded={open}
      className={cn(
        'w-full justify-between',
        width,
        className,
        disabled ? 'cursor-not-allowed opacity-50' : '',
      )}
      disabled={disabled}
    >
      <span
        className={`truncate text-left ${selectedValue ? '' : 'text-muted-foreground'}`}
      >
        {getSelectedLabel}
      </span>

      {chevron === 'down' ? (
        open ? (
          <ChevronUp className="opacity-50" />
        ) : (
          <ChevronDown className="opacity-50" />
        )
      ) : (
        <ChevronsUpDown className="opacity-50" />
      )}
    </Button>
  );

  return isMobile ? (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild className="truncate">
        {triggerButton}
      </DrawerTrigger>
      <DrawerContent className="p-4">
        <DrawerTitle className={drawerTitle ? 'font-medium' : 'invisible'}>
          {drawerTitle}
        </DrawerTitle>
        <DrawerDescription>{drawerDescription}</DrawerDescription>
        <div className="max-h-[300px] overflow-y-auto">{dropdownContent}</div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Popover open={open} onOpenChange={setOpen} {...rest} modal>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent
        className={`p-0`}
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        {dropdownContent}
      </PopoverContent>
    </Popover>
  );
});

// Set displayName for better debugging
AutocompleteDropdown.displayName = 'AutocompleteDropdown';
