import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
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
import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react';

type MultiSelectContextType = {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedValues: Set<string>;
  toggleValue: (value: string) => void;
  items: Map<string, ReactNode>;
  onItemAdded: (value: string, label: ReactNode) => void;
};
const MultiSelectContext = createContext<MultiSelectContextType | null>(null);

export function MultiSelect({
  children,
  values,
  defaultValues,
  onValuesChange,
}: {
  children: ReactNode;
  values?: string[];
  defaultValues?: string[];
  onValuesChange?: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [internalValues, setInternalValues] = useState(
    new Set<string>(values ?? defaultValues),
  );
  const selectedValues = values ? new Set(values) : internalValues;
  const [items, setItems] = useState<Map<string, ReactNode>>(new Map());

  function toggleValue(value: string) {
    const getNewSet = (prev: Set<string>) => {
      const newSet = new Set(prev);
      if (newSet.has(value)) {
        newSet.delete(value);
      } else {
        newSet.add(value);
      }
      return newSet;
    };
    setInternalValues(getNewSet);
    onValuesChange?.([...getNewSet(selectedValues)]);
  }

  const onItemAdded = useCallback((value: string, label: ReactNode) => {
    setItems((prev) => {
      if (prev.get(value) === label) return prev;
      return new Map(prev).set(value, label);
    });
  }, []);

  return (
    <MultiSelectContext.Provider
      value={{
        open,
        setOpen,
        selectedValues,
        toggleValue,
        items,
        onItemAdded,
      }}
    >
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        {children}
      </Popover>
    </MultiSelectContext.Provider>
  );
}

export function MultiSelectTrigger({
  className,
  children,
  ...props
}: {
  className?: string;
  children?: ReactNode;
} & ComponentPropsWithoutRef<typeof Button>) {
  const { open } = useMultiSelectContext();

  return (
    <PopoverTrigger asChild>
      <Button
        {...props}
        variant={props.variant ?? 'outline'}
        role={props.role ?? 'combobox'}
        aria-expanded={props['aria-expanded'] ?? open}
        className={cn(
          "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='text-'])]:text-muted-foreground flex h-auto min-h-9 w-fit items-center justify-between gap-2 overflow-hidden rounded-md border bg-transparent px-3 py-1.5 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
      >
        {children}
        <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
  );
}

export function MultiSelectValue({
  placeholder,
  clickToRemove = true,
  className,
  overflowBehavior = 'wrap-when-open',
  ...props
}: {
  placeholder?: string;
  clickToRemove?: boolean;
  overflowBehavior?: 'wrap' | 'wrap-when-open' | 'cutoff';
} & Omit<ComponentPropsWithoutRef<'div'>, 'children'>) {
  const { selectedValues, toggleValue, items, open } = useMultiSelectContext();
  const [overflowAmount, setOverflowAmount] = useState(0);
  const valueRef = useRef<HTMLDivElement | null>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  const shouldWrap =
    overflowBehavior === 'wrap' ||
    (overflowBehavior === 'wrap-when-open' && open);
  const isCutoff = overflowBehavior === 'cutoff';

  const checkOverflow = useCallback(() => {
    if (valueRef.current == null) return;

    const containerElement = valueRef.current;
    const overflowElement = overflowRef.current;
    const items = containerElement.querySelectorAll<HTMLElement>(
      '[data-selected-item]',
    );

    // Reset all items
    items.forEach((child) => {
      child.style.removeProperty('display');
      child.style.removeProperty('max-width');
      child.style.removeProperty('overflow');
      child.style.removeProperty('text-overflow');
      child.style.removeProperty('white-space');
    });

    // Show overflow badge temporarily to measure its width
    if (overflowElement != null) {
      overflowElement.style.display = 'block';
    }

    const overflowWidth = overflowElement?.offsetWidth || 40;
    const gapSize = 6; // gap-1.5 = 6px

    let amount = 0;

    if (isCutoff) {
      // In cutoff mode: always keep first item visible, hide from the end
      // Start hiding from the last item (skip first item)
      const startIndex = items.length > 1 ? items.length - 1 : items.length;

      for (let i = startIndex; i >= 1; i--) {
        const child = items[i]!;
        amount = items.length - i;
        child.style.display = 'none';

        // Check if we fit now (accounting for overflow badge)
        const visibleCount = items.length - amount;
        const gapsWidth = visibleCount > 0 ? (visibleCount - 1) * gapSize : 0;

        if (
          containerElement.scrollWidth + overflowWidth + gapsWidth <=
          containerElement.clientWidth
        ) {
          break;
        }
      }

      // Always show overflow badge in cutoff mode when there's overflow
      if (overflowElement != null) {
        if (amount > 0) {
          overflowElement.style.display = 'block';
        } else {
          overflowElement.style.display = 'none';
        }
      }

      // Truncate first item if needed to ensure overflow badge is visible
      if (items.length > 0 && amount > 0) {
        const firstItem = items[0]!;
        const visibleCount = items.length - amount;
        const gapsWidth = (visibleCount - 1) * gapSize;
        const availableForFirstItem =
          containerElement.clientWidth - overflowWidth - gapsWidth;

        // If first item would be too wide, truncate it
        if (firstItem.offsetWidth > availableForFirstItem) {
          firstItem.style.maxWidth = `${Math.max(50, availableForFirstItem)}px`;
          firstItem.style.overflow = 'hidden';
          firstItem.style.textOverflow = 'ellipsis';
          firstItem.style.whiteSpace = 'nowrap';
        }
      }
    } else {
      // Original behavior for wrap modes
      if (overflowElement != null) overflowElement.style.display = 'none';

      for (let i = items.length - 1; i >= 0; i--) {
        const child = items[i]!;
        if (containerElement.scrollWidth <= containerElement.clientWidth) {
          break;
        }
        amount = items.length - i;
        child.style.display = 'none';
        overflowElement?.style.removeProperty('display');
      }
    }

    setOverflowAmount(amount);
  }, [isCutoff]);

  const handleResize = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        valueRef.current = node;

        const mutationObserver = new MutationObserver(checkOverflow);
        const observer = new ResizeObserver(debounce(checkOverflow, 100));

        mutationObserver.observe(node, {
          childList: true,
          attributes: true,
          attributeFilter: ['class', 'style'],
        });
        observer.observe(node);

        return () => {
          observer.disconnect();
          mutationObserver.disconnect();
          valueRef.current = null;
        };
      } else {
        valueRef.current = null;
      }
    },
    [checkOverflow],
  );

  if (selectedValues.size === 0 && placeholder) {
    return (
      <span className="text-muted-foreground min-w-0 overflow-hidden font-normal">
        {placeholder}
      </span>
    );
  }

  return (
    <div
      {...props}
      ref={handleResize}
      className={cn(
        'flex w-full min-w-0 gap-1.5 overflow-hidden',
        shouldWrap && 'h-full flex-wrap',
        className,
      )}
    >
      {[...selectedValues]
        .filter((value) => items.has(value))
        .map((value, index) => (
          <Badge
            variant="outline"
            data-selected-item
            className={cn(
              'group flex items-center gap-1',
              isCutoff && index === 0 && 'min-w-0',
            )}
            key={value}
            onClick={
              clickToRemove
                ? (e) => {
                    e.stopPropagation();
                    toggleValue(value);
                  }
                : undefined
            }
          >
            <span className={cn(isCutoff && index === 0 && 'min-w-0 truncate')}>
              {items.get(value)}
            </span>
            {clickToRemove && (
              <XIcon className="text-muted-foreground group-hover:text-destructive size-2 shrink-0" />
            )}
          </Badge>
        ))}
      <Badge
        style={{
          display:
            overflowAmount > 0 && (isCutoff || !shouldWrap) ? 'block' : 'none',
        }}
        variant="outline"
        ref={overflowRef}
        className="shrink-0 text-xs font-normal whitespace-nowrap"
      >
        +{overflowAmount}
      </Badge>
    </div>
  );
}

export function MultiSelectContent({
  search = true,
  children,
  className,
  ...props
}: {
  search?: boolean | { placeholder?: string; emptyMessage?: string };
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<typeof Command>, 'children'>) {
  const canSearch = typeof search === 'object' ? true : search;

  return (
    <>
      <div style={{ display: 'none' }}>
        <Command>
          <CommandList>{children}</CommandList>
        </Command>
      </div>
      <PopoverContent
        className={cn('w-[var(--radix-popover-trigger-width)] p-0', className)}
      >
        <Command {...props}>
          {canSearch ? (
            <CommandInput
              placeholder={
                typeof search === 'object' ? search.placeholder : undefined
              }
            />
          ) : (
            <button autoFocus className="sr-only" />
          )}
          <CommandList>
            {canSearch && (
              <CommandEmpty>
                {typeof search === 'object' ? search.emptyMessage : undefined}
              </CommandEmpty>
            )}
            {children}
          </CommandList>
        </Command>
      </PopoverContent>
    </>
  );
}

export function MultiSelectItem({
  value,
  children,
  badgeLabel,
  onSelect,
  iconClassName,
  ...props
}: {
  badgeLabel?: ReactNode;
  value: string;
  iconClassName?: string;
} & Omit<ComponentPropsWithoutRef<typeof CommandItem>, 'value'>) {
  const { toggleValue, selectedValues, onItemAdded } = useMultiSelectContext();
  const isSelected = selectedValues.has(value);

  useEffect(() => {
    onItemAdded(value, badgeLabel ?? children);
  }, [value, children, onItemAdded, badgeLabel]);

  return (
    <CommandItem
      {...props}
      onSelect={() => {
        toggleValue(value);
        onSelect?.(value);
      }}
    >
      <CheckIcon
        className={cn(
          'size-3',
          isSelected ? 'opacity-100' : 'opacity-0',
          iconClassName,
        )}
      />
      {children}
    </CommandItem>
  );
}

export function MultiSelectGroup(
  props: ComponentPropsWithoutRef<typeof CommandGroup>,
) {
  return <CommandGroup {...props} />;
}

export function MultiSelectSeparator(
  props: ComponentPropsWithoutRef<typeof CommandSeparator>,
) {
  return <CommandSeparator {...props} />;
}

function useMultiSelectContext() {
  const context = useContext(MultiSelectContext);
  if (context == null) {
    throw new Error(
      'useMultiSelectContext must be used within a MultiSelectContext',
    );
  }
  return context;
}

function debounce<T extends (...args: never[]) => void>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function (this: unknown, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}
