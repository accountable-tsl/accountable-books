import type { VariantProps } from 'class-variance-authority';
import type { WheelEvent as ReactWheelEvent } from 'react';
import type { DateRange } from 'react-day-picker';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { cva } from 'class-variance-authority';
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  isAfter,
  isBefore,
  isValid,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from 'date-fns';
import { formatInTimeZone, toDate } from 'date-fns-tz';
import { CalendarIcon } from 'lucide-react';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const multiSelectVariants = cva(
  'flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium text-foreground ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground text-background',
        link: 'text-primary underline-offset-4 hover:underline text-background',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

type RangePart = 'from' | 'to';

interface PresetRange {
  label: string;
  getValue: () => { start: Date; end: Date };
}

const buildPresets = (): PresetRange[] => {
  const today = new Date();
  return [
    { label: 'Today', getValue: () => ({ start: today, end: today }) },
    {
      label: 'Yesterday',
      getValue: () => {
        const y = subDays(today, 1);
        return { start: y, end: y };
      },
    },
    {
      label: 'This Week',
      getValue: () => ({
        start: startOfWeek(today, { weekStartsOn: 1 }),
        end: endOfWeek(today, { weekStartsOn: 1 }),
      }),
    },
    {
      label: 'Last Week',
      getValue: () => {
        const s = subDays(startOfWeek(today, { weekStartsOn: 1 }), 7);
        const e = subDays(endOfWeek(today, { weekStartsOn: 1 }), 7);
        return { start: s, end: e };
      },
    },
    {
      label: 'Last 7 Days',
      getValue: () => ({ start: subDays(today, 6), end: today }),
    },
    {
      label: 'This Month',
      getValue: () => ({ start: startOfMonth(today), end: endOfMonth(today) }),
    },
    {
      label: 'Last Month',
      getValue: () => {
        const lastMonthAnchor = subDays(today, today.getDate());
        return {
          start: startOfMonth(lastMonthAnchor),
          end: endOfMonth(lastMonthAnchor),
        };
      },
    },
    {
      label: 'This Year',
      getValue: () => ({ start: startOfYear(today), end: endOfYear(today) }),
    },
    {
      label: 'Last Year',
      getValue: () => {
        const ly = subDays(today, 365);
        return { start: startOfYear(ly), end: endOfYear(ly) };
      },
    },
  ];
};

const generateYears = (centerYear: number, range: number): number[] => {
  const half = Math.floor(range / 2);
  return Array.from({ length: range + 1 }, (_, i) => centerYear - half + i);
};

const clamp = (d: Date, min?: Date, max?: Date) => {
  if (min && isBefore(d, min)) return min;
  if (max && isAfter(d, max)) return max;
  return d;
};

const startOfDayTZ = (d: Date, tz: string) =>
  startOfDay(toDate(d, { timeZone: tz }));
const endOfDayTZ = (d: Date, tz: string) =>
  endOfDay(toDate(d, { timeZone: tz }));

export interface DateRangePickerProps
  extends React.HTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof multiSelectVariants> {
  id?: string;
  className?: string;
  date: DateRange; // controlled: { from?: Date; to?: Date }
  onDateSelect: (range: { from: Date; to?: Date }) => void;

  numberOfMonths?: 1 | 2; // Purely visual: how many calendars to render side-by-side.
  yearsRange?: number;
  closeOnSelect?: boolean;

  alignPopover?: 'start' | 'center' | 'end';
  disabled?: boolean;
  placeholder?: string;
  maxDate?: Date;
  minDate?: Date;
  dateFormat?: string; // display format, default "dd LLL yyyy"
  enableScrollAdjust?: boolean; // opt-in experimental UX
}

export const DateRangePicker = forwardRef<
  HTMLButtonElement,
  DateRangePickerProps
>(
  (
    {
      id = 'date-range-picker',
      className,
      date,
      onDateSelect,
      numberOfMonths = 2,
      yearsRange = 10,
      closeOnSelect = false,
      alignPopover = 'center',
      disabled = false,
      placeholder = 'Pick a date',
      maxDate,
      minDate,
      dateFormat = 'dd LLL yyyy',
      enableScrollAdjust = false,
      variant,
      ...props
    },
    ref,
  ) => {
    // Derived / memoized
    const timeZone = useMemo(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      [],
    );
    const presets = useMemo(buildPresets, []);
    const years = useMemo(
      () => generateYears(new Date().getFullYear(), yearsRange),
      [yearsRange],
    );

    // Local UI state
    const initialMonth = date?.from ?? new Date();
    const [isOpen, setIsOpen] = useState(false);
    const [selectedPreset, setSelectedPreset] = useState<string | null>(
      'This Month',
    );
    const [monthFrom, setMonthFrom] = useState<Date>(initialMonth);
    const [highlightedPart, setHighlightedPart] = useState<string | null>(null);

    const isNewlyOpenedRef = useRef(false);

    // Helpers
    const fmtTZ = useCallback(
      (d?: Date, fmt = dateFormat) =>
        d && isValid(d) ? formatInTimeZone(d, timeZone, fmt) : '',
      [timeZone, dateFormat],
    );
    const normalizeRange = useCallback(
      (from: Date, to: Date) => {
        const f = clamp(startOfDayTZ(from, timeZone), minDate, maxDate);
        const t = clamp(endOfDayTZ(to, timeZone), minDate, maxDate);
        return isAfter(f, t) ? { from: t, to: t } : { from: f, to: t };
      },
      [minDate, maxDate, timeZone],
    );

    const handlePopoverChange = useCallback((open: boolean) => {
      setIsOpen(open);
      if (open) {
        isNewlyOpenedRef.current = true;
      } else {
        isNewlyOpenedRef.current = false;
      }
    }, []);

    const selectPreset = useCallback(
      (p: PresetRange) => {
        const { start, end } = p.getValue();
        const { from, to } = normalizeRange(start, end);
        onDateSelect({ from, to });
        setSelectedPreset(p.label);
        setMonthFrom(from);
        isNewlyOpenedRef.current = false;
        if (closeOnSelect) setIsOpen(false);
      },
      [normalizeRange, onDateSelect, closeOnSelect],
    );

    const handleDateSelect = useCallback(
      (r: DateRange | undefined) => {
        if (!r?.from) return;

        const from = r.from;
        const to = r.to;
        if (!to) return;

        const normalized = normalizeRange(from, to);
        onDateSelect(normalized);
        setSelectedPreset(null);

        if (closeOnSelect) setIsOpen(false);
      },
      [normalizeRange, onDateSelect, closeOnSelect],
    );

    const handleMonthChange = useCallback(
      (monthIndex: number, part: RangePart) => {
        if (monthIndex < 0 || monthIndex > 11) return;

        const src =
          part === 'from'
            ? (date.from ?? new Date())
            : (date.to ?? date.from ?? new Date());
        const year = src.getFullYear();
        const newMonth = new Date(year, monthIndex, 1);

        const from =
          part === 'from'
            ? startOfMonth(toDate(newMonth, { timeZone }))
            : date.from
              ? startOfDayTZ(date.from, timeZone)
              : startOfMonth(toDate(newMonth, { timeZone }));

        const to =
          part === 'to'
            ? endOfMonth(toDate(newMonth, { timeZone }))
            : date.to
              ? endOfDayTZ(date.to, timeZone)
              : undefined;

        if (part === 'from' && to && isAfter(from, to)) {
          if (part === 'from') setMonthFrom(newMonth);
          setSelectedPreset(null);
          onDateSelect({ from }); // clear 'to'
          return;
        }

        if (part === 'to' && to) {
          const currentFrom = date.from
            ? startOfDayTZ(date.from, timeZone)
            : undefined;
          if (currentFrom && isAfter(currentFrom, to)) {
            setSelectedPreset(null);
            onDateSelect({ from: to });
            return;
          }
        }

        if (to) {
          const normalized = normalizeRange(from, to);
          onDateSelect(normalized);
        } else {
          onDateSelect({ from });
        }
        if (part === 'from') setMonthFrom(newMonth);
        setSelectedPreset(null);
      },
      [date.from, date.to, onDateSelect, timeZone, normalizeRange],
    );

    const handleYearChange = useCallback(
      (year: number, part: RangePart) => {
        const srcMonth =
          part === 'from'
            ? (date.from ?? monthFrom)
            : (date.to ?? date.from ?? monthFrom);
        const newMonth = new Date(year, srcMonth.getMonth(), 1);

        const from =
          part === 'from'
            ? startOfMonth(toDate(newMonth, { timeZone }))
            : date.from
              ? startOfDayTZ(date.from, timeZone)
              : startOfMonth(toDate(newMonth, { timeZone }));

        const to =
          part === 'to'
            ? endOfMonth(toDate(newMonth, { timeZone }))
            : (date.to ?? undefined);

        if (part === 'from' && to && isAfter(from, to)) {
          if (part === 'from') {
            setMonthFrom(newMonth);
          }
          setSelectedPreset(null);
          onDateSelect({ from });
          return;
        }

        if (part === 'to' && to) {
          const currentFrom = date.from
            ? startOfDayTZ(date.from, timeZone)
            : undefined;
          if (currentFrom && isAfter(currentFrom, to)) {
            setSelectedPreset(null);
            onDateSelect({ from: to }); // clear 'to'
            return;
          }
        }

        if (to) {
          const normalized = normalizeRange(from, to);
          onDateSelect(normalized);
        } else {
          onDateSelect({ from, to: undefined as any });
        }
        if (part === 'from') setMonthFrom(newMonth);
        setSelectedPreset(null);
      },
      [date.from, date.to, monthFrom, onDateSelect, timeZone, normalizeRange],
    );

    // Button text
    const formatDisplayText = useCallback(() => {
      if (!date?.from) return placeholder;
      if (!date?.to) {
        return fmtTZ(date.from);
      }
      return `${fmtTZ(date.from)} — ${fmtTZ(date.to)}`;
    }, [date?.from, date?.to, fmtTZ, placeholder]);

    const calendarDisabled = useCallback(
      (d: Date) => {
        const dayStart = startOfDayTZ(d, timeZone);
        if (minDate && isBefore(dayStart, startOfDayTZ(minDate, timeZone)))
          return true;
        if (maxDate && isAfter(dayStart, endOfDayTZ(maxDate, timeZone)))
          return true;
        return false;
      },
      [minDate, maxDate, timeZone],
    );

    // Optional scroll-to-tweak UX (off by default; non-standard + a11y risk)
    const onWheel = useCallback(
      (e: ReactWheelEvent) => {
        if (!enableScrollAdjust) return;
        e.preventDefault();
        const inc = e.deltaY > 0 ? -1 : 1;
        const targetId = (e.currentTarget as HTMLElement).id;

        // Day tweak
        if (targetId.includes('firstDay') && date.from) {
          const d = new Date(date.from);
          d.setDate(d.getDate() + inc);
          const normalized = normalizeRange(d, date.to ?? d);
          onDateSelect(normalized);
          setSelectedPreset(null);
        } else if (targetId.includes('secondDay') && date.to) {
          const d = new Date(date.to);
          d.setDate(d.getDate() + inc);
          const normalized = normalizeRange(date.from ?? d, d);
          onDateSelect(normalized);
          setSelectedPreset(null);
        }

        // Month tweak
        if (targetId.includes('firstMonth')) {
          const current = date.from ?? new Date();
          handleMonthChange(current.getMonth() + inc, 'from');
        } else if (targetId.includes('secondMonth')) {
          const current = date.to ?? date.from ?? new Date();
          handleMonthChange(current.getMonth() + inc, 'to');
        }

        // Year tweak
        if (targetId.includes('firstYear')) {
          const y = (date.from ?? new Date()).getFullYear() + inc;
          handleYearChange(y, 'from');
        } else if (targetId.includes('secondYear')) {
          const y = (date.to ?? date.from ?? new Date()).getFullYear() + inc;
          handleYearChange(y, 'to');
        }
      },
      [
        enableScrollAdjust,
        date.from,
        date.to,
        normalizeRange,
        onDateSelect,
        handleMonthChange,
        handleYearChange,
      ],
    );

    useEffect(() => {
      if (date?.from) setMonthFrom(date.from);
    }, [date?.from]);

    // Render pieces
    const renderButtonLabel = () => {
      if (!enableScrollAdjust)
        return <span className="truncate">{formatDisplayText()}</span>;
      // Rich label with tweakable parts
      if (!date?.from) return <span>{placeholder}</span>;
      const one = (
        <>
          <span
            id={`firstDay-${id}`}
            className={cn(
              'date-part',
              highlightedPart === 'firstDay' && 'font-semibold underline',
            )}
            onMouseEnter={() => setHighlightedPart('firstDay')}
            onMouseLeave={() => setHighlightedPart(null)}
            onWheel={onWheel}
          >
            {fmtTZ(date.from, 'dd')}
          </span>{' '}
          <span
            id={`firstMonth-${id}`}
            className={cn(
              'date-part',
              highlightedPart === 'firstMonth' && 'font-semibold underline',
            )}
            onMouseEnter={() => setHighlightedPart('firstMonth')}
            onMouseLeave={() => setHighlightedPart(null)}
            onWheel={onWheel}
          >
            {fmtTZ(date.from, 'LLL')}
          </span>
          ,{' '}
          <span
            id={`firstYear-${id}`}
            className={cn(
              'date-part',
              highlightedPart === 'firstYear' && 'font-semibold underline',
            )}
            onMouseEnter={() => setHighlightedPart('firstYear')}
            onMouseLeave={() => setHighlightedPart(null)}
            onWheel={onWheel}
          >
            {fmtTZ(date.from, 'yyyy')}
          </span>
        </>
      );

      if (!date?.to) return one;

      return (
        <>
          {one}
          {' — '}
          <span
            id={`secondDay-${id}`}
            className={cn(
              'date-part',
              highlightedPart === 'secondDay' && 'font-semibold underline',
            )}
            onMouseEnter={() => setHighlightedPart('secondDay')}
            onMouseLeave={() => setHighlightedPart(null)}
            onWheel={onWheel}
          >
            {fmtTZ(date.to, 'dd')}
          </span>{' '}
          <span
            id={`secondMonth-${id}`}
            className={cn(
              'date-part',
              highlightedPart === 'secondMonth' && 'font-semibold underline',
            )}
            onMouseEnter={() => setHighlightedPart('secondMonth')}
            onMouseLeave={() => setHighlightedPart(null)}
            onWheel={onWheel}
          >
            {fmtTZ(date.to, 'LLL')}
          </span>
          ,{' '}
          <span
            id={`secondYear-${id}`}
            className={cn(
              'date-part',
              highlightedPart === 'secondYear' && 'font-semibold underline',
            )}
            onMouseEnter={() => setHighlightedPart('secondYear')}
            onMouseLeave={() => setHighlightedPart(null)}
            onWheel={onWheel}
          >
            {fmtTZ(date.to, 'yyyy')}
          </span>
        </>
      );
    };

    return (
      <>
        {enableScrollAdjust && (
          <style>{`.date-part{touch-action:none;}`}</style>
        )}

        <Popover open={isOpen} onOpenChange={handlePopoverChange}>
          <PopoverTrigger asChild>
            <Button
              ref={ref}
              {...props}
              className={cn(
                'w-auto justify-start text-left font-normal',
                !date?.from && 'text-muted-foreground',
                multiSelectVariants({ variant, className }),
              )}
              onClick={() => !disabled && setIsOpen((v) => !v)}
              disabled={disabled}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              {renderButtonLabel()}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            className="w-auto p-0"
            align={alignPopover}
            onEscapeKeyDown={() => setIsOpen(false)}
            onInteractOutside={() => setIsOpen(false)}
          >
            <div className="flex">
              <div className="flex flex-col border-r p-3">
                {presets.map((p) => (
                  <Button
                    key={p.label}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'justify-start text-sm font-normal',
                      selectedPreset === p.label && 'bg-accent',
                    )}
                    onClick={() => selectPreset(p)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>

              <div className="p-3">
                {/* Month / Year selectors */}
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <Select
                      value={MONTHS[(date?.from ?? monthFrom).getMonth()]}
                      onValueChange={(value) =>
                        handleMonthChange(
                          MONTHS.indexOf(value as (typeof MONTHS)[number]),
                          'from',
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m) => (
                          <SelectItem key={m} value={m} className="text-xs">
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={(date?.from ?? monthFrom).getFullYear().toString()}
                      onValueChange={(val) =>
                        handleYearChange(parseInt(val, 10), 'from')
                      }
                    >
                      <SelectTrigger className="h-8 w-[90px] text-xs">
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem
                            key={y}
                            value={y.toString()}
                            className="text-xs"
                          >
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {numberOfMonths === 2 && (
                    <div className="flex gap-2">
                      <Select
                        value={
                          date?.to
                            ? MONTHS[date.to.getMonth()]
                            : MONTHS[(date?.from ?? monthFrom).getMonth()]
                        }
                        onValueChange={(value) =>
                          handleMonthChange(
                            MONTHS.indexOf(value as (typeof MONTHS)[number]),
                            'to',
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Month" />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m) => (
                            <SelectItem key={m} value={m} className="text-xs">
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={(date?.to ?? date?.from ?? monthFrom)
                          .getFullYear()
                          .toString()}
                        onValueChange={(val) =>
                          handleYearChange(parseInt(val, 10), 'to')
                        }
                      >
                        <SelectTrigger className="h-8 w-[90px] text-xs">
                          <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map((y) => (
                            <SelectItem
                              key={y}
                              value={y.toString()}
                              className="text-xs"
                            >
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <Calendar
                  mode="range"
                  selected={date}
                  onSelect={handleDateSelect}
                  month={monthFrom}
                  onMonthChange={setMonthFrom}
                  numberOfMonths={numberOfMonths}
                  showOutsideDays={false}
                  disabled={calendarDisabled}
                  className={className}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </>
    );
  },
);

DateRangePicker.displayName = 'DateRangePicker';
