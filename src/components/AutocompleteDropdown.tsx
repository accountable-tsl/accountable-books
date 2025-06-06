import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { VariantProps } from "class-variance-authority";
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "./ui/drawer";

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

interface AutocompleteDropdownProps
  extends Omit<React.ComponentPropsWithoutRef<"input">, "value" | "onChange"> {
  id?: string;
  items: Item[] | any[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
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
}

// Helper function to get nested property value using dot notation
const getNestedValue = (obj: any, path: string): string => {
  if (!obj || !path) return "";
  return path.split(".").reduce((current, key) => current?.[key], obj) || "";
};

// Normalize items to { value, label } format
const normalizeItem = (
  item: any,
  mapItem?: (item: any) => { value: string; label: string }
): { value: string; label: string } => {
  // Handle strings
  if (typeof item === "string") {
    return item.trim() !== ""
      ? { value: item, label: item }
      : { value: `fallback-${Math.random()}`, label: "Unknown" };
  }

  // Handle API data with mapItem
  if (mapItem) {
    const mapped = mapItem(item);
    return mapped.value &&
      typeof mapped.value === "string" &&
      mapped.value.trim() !== ""
      ? mapped
      : {
          value: `fallback-${Math.random()}`,
          label: mapped.label || "Unknown",
        };
  }

  // Handle preformatted { value, label } objects
  return typeof item === "object" &&
    item.value &&
    typeof item.value === "string" &&
    item.value.trim() !== ""
    ? item
    : { value: `fallback-${Math.random()}`, label: item?.label || "Unknown" };
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
    value = "",
    onValueChange,
    placeholder = "Select an option...",
    className,
    variant = "outline",
    searchPlaceholder = "Search...",
    mapItem,
    drawerTitle = " ",
    drawerDescription = " ",
    width = "", // w-200px for small
    disabled = false,

    actionItems = [],
    onAction,
    showEmptyStateWithActions = true,
    emptyStateMessage = "No options available",
    noResultsMessage = "No results found",

    groupBy,
    groupLabel,
    groups = [],
    ungroupedLabel = "Other",

    ...rest
  } = props;
  const [open, setOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value);
  const [searchQuery, setSearchQuery] = useState("");

  const isMobile = useMediaQuery("(max-width: 768px)");
  const selectedItemRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      // On mount: scroll into view
      requestAnimationFrame(() => {
        node.scrollIntoView({ behavior: "auto", block: "center" });
      });
    }
    // On unmount: React will pass null, nothing else needed
  }, []);

  const handleSelect = (searchValue: string) => {
    const currentValue = searchValue.split("|_|")[0].trim() || "";

    const selectedItem = normalizedItems.find(
      (item) => item.value === currentValue
    );
    const newValue = selectedItem?.value === selectedValue ? "" : currentValue;

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

  // Normalize and filter items to ensure valid values
  const normalizedItems = useMemo(
    () =>
      items
        .map((item) => normalizeItem(item, mapItem))
        .filter((item) => item.value.trim() !== ""),
    [items, mapItem]
  );

  // Grouping
  const useGrouping = !!(groupBy || groups?.length || groupLabel);
  // Group items if grouping is enabled
  const groupedData = useMemo(() => {
    if (!useGrouping) return null;

    const result: GroupedItems[] = [];

    // Handle pre-grouped data
    if (groups?.length) {
      groups.forEach((group) => {
        const normalizedGroupItems = group.items
          .map((item) => normalizeItem(item, mapItem))
          .filter((item) => item.value.trim() !== "");

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

      items.forEach((item) => {
        // Get group key
        const groupKey =
          typeof groupBy === "function"
            ? groupBy(item)
            : getNestedValue(item, groupBy);

        if (!groupKey) return; // Skip items without group

        // Get group label
        let groupLabelText = groupKey;
        if (groupLabel) {
          groupLabelText =
            typeof groupLabel === "function"
              ? groupLabel(item)
              : getNestedValue(item, groupLabel);
        }

        if (!itemGroups[groupKey]) {
          itemGroups[groupKey] = [];
          groupLabels[groupKey] = groupLabelText;
        }
        itemGroups[groupKey].push(item);
      });

      // Convert to GroupedItems format
      Object.keys(itemGroups)
        .sort()
        .forEach((groupKey) => {
          const normalizedGroupItems = itemGroups[groupKey]
            .map((item) => normalizeItem(item, mapItem))
            .filter((item) => item.value.trim() !== "");

          if (normalizedGroupItems.length > 0) {
            result.push({
              id: groupKey,
              label: groupLabels[groupKey],
              items: normalizedGroupItems,
            });
          }
        });
    }

    return result;
  }, [items, groups, groupBy, groupLabel, mapItem, useGrouping]);

  // Filter items based on search query
  const filteredData = useMemo(() => {
    if (!useGrouping) {
      if (!searchQuery.trim()) return normalizedItems;
      return normalizedItems.filter(
        (item) =>
          item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.value.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Grouped filtering
    if (!searchQuery.trim()) return groupedData;
    return (
      groupedData
        ?.map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
              item.value.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }))
        .filter((group) => group.items.length > 0) || []
    );
  }, [normalizedItems, groupedData, searchQuery, useGrouping]);

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
    <Command shouldFilter={false}>
      <CommandInput
        id={id}
        ref={ref}
        placeholder={searchPlaceholder}
        className="h-9"
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        <CommandGroup>
          {showEmptyState && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {emptyStateMessage}
            </div>
          )}
          {showNoResults && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {noResultsMessage}
            </div>
          )}

          {!useGrouping &&
            (filteredData as NormalizedItem[]).map((item) => {
              const isSelected = selectedValue === item.value;

              return (
                <CommandItem
                  key={item.value}
                  ref={isSelected ? selectedItemRef : undefined}
                  value={`${item.value} |_| ${item.label}`}
                  onSelect={handleSelect}
                >
                  {item.label}
                  <Check
                    className={cn(
                      "ml-auto",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              );
            })}

          {/* Grouped filtered items */}
          {useGrouping &&
            (filteredData as GroupedItems[])?.map((group) => (
              <div key={group.id}>
                <div className="px-2 pt-2 text-sm font-semibold text-muted-foreground">
                  {group.label}
                </div>
                <CommandSeparator className="my-1" />
                {group.items.map((item: NormalizedItem) => {
                  const isSelected = selectedValue === item.value;

                  return (
                    <CommandItem
                      key={item.value}
                      ref={isSelected ? selectedItemRef : undefined}
                      value={`${item.value} |_| ${item.label}`}
                      onSelect={handleSelect}
                    >
                      {item.label}
                      <Check
                        className={cn(
                          "ml-auto h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </div>
            ))}

          {(hasSearchResults || showEmptyState || showNoResults) &&
            showActionItems && <CommandSeparator className="my-1" />}

          {/* Action items - always visible regardless of search */}
          {showActionItems &&
            actionItems.map((action) => (
              <CommandItem
                key={action.id}
                value={`action-${action.id} |_| ${action.label}`}
                onSelect={() => handleAction(action.id)}
                className={cn("cursor-pointer", action.className)}
                role="button"
                aria-label={`Action: ${action.label}`}
              >
                {action.icon}
                {action.label}
              </CommandItem>
            ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );

  // Common trigger button
  const triggerButton = (
    <Button
      variant={variant}
      role="combobox"
      aria-expanded={open}
      className={cn(
        "w-full justify-between",
        width,
        className,
        disabled ? "opacity-50 cursor-not-allowed" : ""
      )}
      disabled={disabled}
    >
      <span
        className={`truncate text-left ${
          selectedValue ? "" : "text-muted-foreground"
        }`}
      >
        {selectedValue
          ? normalizedItems.find((item) => item.value === selectedValue)?.label
          : placeholder}
      </span>

      <ChevronsUpDown className="opacity-50" />
    </Button>
  );

  return isMobile ? (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild className="truncate">
        {triggerButton}
      </DrawerTrigger>
      <DrawerContent className="p-4">
        <DrawerTitle className={drawerTitle ? "font-medium" : "invisible"}>
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
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        {dropdownContent}
      </PopoverContent>
    </Popover>
  );
});

// Set displayName for better debugging
AutocompleteDropdown.displayName = "AutocompleteDropdown";
