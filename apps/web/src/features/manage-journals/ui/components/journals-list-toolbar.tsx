import type { RefObject } from 'react';
import { useCallback, useMemo } from 'react';
import { DateRangePicker } from '@/components/date-picker/date-range-picker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { isValidYMD, toYMD } from '@/shared/utils/date-utils';
import { Plus, SlidersHorizontal, Upload } from 'lucide-react';

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Posted', value: 'posted' },
  { label: 'Voided', value: 'voided' },
  { label: 'Reversed', value: 'reversed' },
  { label: 'Recurring', value: 'recurring' },
] as const;

export type JournalListStatusFilter = (typeof statusOptions)[number]['value'];
export type JournalListAdvancedStatus = Exclude<JournalListStatusFilter, 'all'>;

export function JournalsListToolbar({
  status,
  searchQuery,
  dateFrom,
  dateTo,
  defaultDateFrom,
  defaultDateTo,
  counts,
  advancedStatusFilters,
  hideGenerated,
  onStatusChange,
  onSearchQueryChange,
  onDateFromChange,
  onDateToChange,
  onAdvancedStatusToggle,
  onHideGeneratedChange,
  onClearAdvancedFilters,
  onResetFilters,
  onCreateJournal,
  onImportClick,
  searchInputRef,
  showStatusOptions = true,
}: {
  status: JournalListStatusFilter;
  searchQuery: string;
  dateFrom: string;
  dateTo: string;
  defaultDateFrom?: string;
  defaultDateTo?: string;
  counts: Record<JournalListStatusFilter, number>;
  advancedStatusFilters: Set<JournalListAdvancedStatus>;
  hideGenerated: boolean;
  onStatusChange: (value: JournalListStatusFilter) => void;
  onSearchQueryChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onAdvancedStatusToggle: (value: JournalListAdvancedStatus) => void;
  onHideGeneratedChange: (value: boolean) => void;
  onClearAdvancedFilters: () => void;
  onResetFilters: () => void;
  onCreateJournal?: () => void;
  onImportClick?: () => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  showStatusOptions?: boolean;
}) {
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');

  const parseYMDToLocalDate = useCallback((value: string): Date | undefined => {
    if (!value || !isValidYMD(value)) return undefined;
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }, []);

  const selectedDateRange = useMemo(
    () => ({
      from: parseYMDToLocalDate(dateFrom),
      to: parseYMDToLocalDate(dateTo),
    }),
    [dateFrom, dateTo, parseYMDToLocalDate],
  );
  const handleDateRangeSelect = useCallback(
    (range: { from: Date; to?: Date }) => {
      onDateFromChange(toYMD(range.from));
      onDateToChange(range.to ? toYMD(range.to) : '');
    },
    [onDateFromChange, onDateToChange],
  );

  const isUsingDefaultDateRange =
    !!dateFrom &&
    !!dateTo &&
    !!defaultDateFrom &&
    !!defaultDateTo &&
    dateFrom === defaultDateFrom &&
    dateTo === defaultDateTo;
  const hasActiveDateFilter =
    !!(dateFrom || dateTo) && !isUsingDefaultDateRange;
  const hasActiveAdvancedFilters =
    advancedStatusFilters.size > 0 || hasActiveDateFilter || hideGenerated;

  const hasActiveFilters =
    status !== 'all' || !!searchQuery || hasActiveAdvancedFilters;
  const advancedFiltersCount =
    advancedStatusFilters.size +
    (hasActiveDateFilter ? 1 : 0) +
    (hideGenerated ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={advancedFiltersCount > 0 ? 'secondary' : 'outline'}
              size="icon"
              className="relative h-9 w-9 shrink-0"
              title="More filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {advancedFiltersCount > 0 && (
                <span className="bg-foreground text-background absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium">
                  {advancedFiltersCount}
                </span>
              )}
              <span className="sr-only">More filters</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-foreground text-xs font-medium">
                  Date range
                </span>
                <div className="flex items-center gap-2">
                  <DateRangePicker
                    date={selectedDateRange}
                    onDateSelect={handleDateRangeSelect}
                    variant="outline"
                    numberOfMonths={1}
                    alignPopover="start"
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-foreground text-xs font-medium">
                  Extra status filters
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-full justify-between text-xs font-normal"
                    >
                      {advancedStatusFilters.size === 0
                        ? 'All statuses'
                        : `${advancedStatusFilters.size} selected`}
                      <svg
                        className="h-3 w-3 opacity-50"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2" align="start">
                    <div className="flex flex-col gap-1">
                      {(
                        [
                          { key: 'draft', label: 'Draft' },
                          { key: 'posted', label: 'Posted' },
                          { key: 'voided', label: 'Voided' },
                          { key: 'reversed', label: 'Reversed' },
                          { key: 'recurring', label: 'Recurring' },
                        ] as const
                      ).map(({ key, label }) => (
                        <label
                          key={key}
                          className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition-colors"
                        >
                          <Checkbox
                            checked={advancedStatusFilters.has(key)}
                            onCheckedChange={() => onAdvancedStatusToggle(key)}
                          />
                          <span className="flex-1 text-sm">{label}</span>
                          <span className="text-muted-foreground text-xs">
                            {counts[key]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="hide-generated"
                  checked={hideGenerated}
                  onCheckedChange={(checked) =>
                    onHideGeneratedChange(checked === true)
                  }
                />
                <Label
                  htmlFor="hide-generated"
                  className="cursor-pointer text-sm"
                >
                  Hide generated
                </Label>
              </div>

              {(hasActiveFilters || hasActiveAdvancedFilters) && (
                <div className="flex items-center justify-end gap-3 pt-1">
                  {hasActiveAdvancedFilters && (
                    <Button
                      variant="link"
                      size="sm"
                      className="text-muted-foreground h-auto p-0 text-xs"
                      onClick={onClearAdvancedFilters}
                    >
                      Clear advanced
                    </Button>
                  )}
                  <Button
                    variant="link"
                    size="sm"
                    className="text-muted-foreground h-auto p-0 text-xs"
                    onClick={onResetFilters}
                    disabled={!hasActiveFilters}
                  >
                    Reset all
                  </Button>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <div className="relative flex-1">
          <Input
            ref={searchInputRef}
            className="h-9"
            placeholder="Search title, ref, note..."
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
        </div>
        <Button
          size="sm"
          className="h-9 gap-1.5"
          onClick={onCreateJournal}
          disabled={!onCreateJournal}
        >
          <Plus className="h-4 w-4" />
          New
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onImportClick}
          title="Import CSV"
        >
          <Upload className="h-4 w-4" />
          <span className="sr-only">Import CSV</span>
        </Button>
      </div>

      {showStatusOptions && (
        <div className="flex items-center justify-between gap-1 overflow-hidden whitespace-nowrap">
          {statusOptions
            .filter(
              (option) =>
                // Keep the option UNLESS (isTablet is true AND value is "voided")
                !(isTablet && option.value === 'voided'),
            )
            .map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => onStatusChange(option.value)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium capitalize transition-colors sm:px-2.5 sm:py-1 sm:text-xs',
                  status === option.value
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {option.label}
                <span className="ml-1 font-mono text-[10px] opacity-70">
                  {counts[option.value]}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
