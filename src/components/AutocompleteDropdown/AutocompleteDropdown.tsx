import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { VariantProps } from "class-variance-authority";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "../ui/drawer";

type Item =
  | string
  | {
      value: string;
      label: string;
    };

interface AutocompleteDropdownProps {
  id?: string;
  items: Item[] | any[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  searchPlaceholder?: string;
  mapItem?: (item: any) => { value: string; label: string };
  drawerTitle?: string;
  drawerDescription?: string;
  width?: string;
}

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
 * Usage: <AutocompleteDropdown items={["Apple", "Banana"]} onChange={(v) => console.log(v)} />
 * or <AutocompleteDropdown items={apiData} mapItem={(item) => ({ value: item.id, label: item.name })} />
 */

export const AutocompleteDropdown = ({
  id,
  items,
  value = "",
  onChange,
  placeholder = "Select an option...",
  className,
  variant = "outline",
  searchPlaceholder = "Search...",
  mapItem,
  drawerTitle = " ",
  drawerDescription = " ",
  width = "", // w-200px for small
}: AutocompleteDropdownProps) => {
  const [open, setOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value);

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

  // Sync external value with internal state
  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  const handleSelect = (searchValue: string) => {
    const currentValue = searchValue.split("|_|")[0].trim() || "";
    // const newValue = currentValue === selectedValue ? "" : currentValue;

    const selectedItem = normalizedItems.find(
      (item) => item.value === currentValue
    );
    const newValue = selectedItem?.value === selectedValue ? "" : currentValue;

    setSelectedValue(newValue);
    onChange?.(newValue);
    setOpen(false);
  };

  // Normalize and filter items to ensure valid values
  const normalizedItems = useMemo(
    () =>
      items
        .map((item) => normalizeItem(item, mapItem))
        .filter((item) => item.value.trim() !== ""),
    [items, mapItem]
  );

  // Shared content for Popover and Drawer
  const dropdownContent = (
    <Command>
      <CommandInput id={id} placeholder={searchPlaceholder} className="h-9" />
      <CommandList>
        <CommandEmpty>No options found.</CommandEmpty>
        <CommandGroup>
          {normalizedItems.map((item) => {
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
      className={cn("w-full justify-between", width, className)}
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
        <div className="max-h-[300px]">{dropdownContent}</div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent
        className={`p-0`}
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        {dropdownContent}
      </PopoverContent>
    </Popover>
  );
};

// Set displayName for better debugging
AutocompleteDropdown.displayName = "AutocompleteDropdown";
