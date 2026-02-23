import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-media-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { MONTHS } from '../constants';
import {
  canCompare,
  getQuarterForMonth,
  getQuarterStartMonth,
} from '../report-period';

import type { PeriodBounds } from '../period-utils';
import type { CompareMode, ReportPeriod } from '../report-period';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUARTERS = [1, 2, 3, 4] as const;

const QUICK_ACTIONS: Array<{
  label: string;
  mode: ReportPeriod['mode'];
  disabled?: boolean;
  title?: string;
}> = [
  { label: 'Full Year', mode: 'year' },
  { label: 'YTD', mode: 'ytd' },
  { label: 'T12M', mode: 'trailing12m' },
  {
    label: 'Custom…',
    mode: 'custom',
    disabled: true,
    title: 'Custom range coming soon',
  },
];

const COMPARE_OPTIONS: Array<{ value: CompareMode; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'prior_period', label: 'Prior Period' },
  { value: 'prior_year', label: 'Prior Year' },
];

// Grid rows: each row has 3 months + 1 quarter
const GRID_ROWS = QUARTERS.map((q) => {
  const startIdx = (q - 1) * 3;
  return {
    quarter: q,
    months: [MONTHS[startIdx], MONTHS[startIdx + 1], MONTHS[startIdx + 2]],
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function periodToAbsolute(p: { monthIdx: number; year: number }): number {
  return p.year * 12 + p.monthIdx;
}

function isMonthDisabled(
  monthIdx: number,
  year: number,
  bounds: PeriodBounds,
): boolean {
  const abs = year * 12 + monthIdx;
  return (
    abs < periodToAbsolute(bounds.earliest) ||
    abs > periodToAbsolute(bounds.latest)
  );
}

function isQuarterDisabled(
  quarter: number,
  year: number,
  bounds: PeriodBounds,
): boolean {
  // A quarter is disabled if all 3 of its months are disabled
  const startMonth = (quarter - 1) * 3;
  return (
    isMonthDisabled(startMonth, year, bounds) &&
    isMonthDisabled(startMonth + 1, year, bounds) &&
    isMonthDisabled(startMonth + 2, year, bounds)
  );
}

// ---------------------------------------------------------------------------
// Picker Interior (shared between popover and sheet)
// ---------------------------------------------------------------------------

function PeriodPickerGrid({
  value,
  bounds,
  onChange,
  onClose,
}: {
  value: ReportPeriod;
  bounds: PeriodBounds;
  onChange: (rp: ReportPeriod) => void;
  onClose: () => void;
}) {
  const [displayYear, setDisplayYear] = useState(value.anchor.year);

  const canGoBack = displayYear > bounds.earliest.year;
  const canGoForward = displayYear < bounds.latest.year;

  const handleMonthClick = (monthIdx: number) => {
    onChange({
      ...value,
      mode: 'month',
      anchor: { monthIdx, year: displayYear },
      endAnchor: undefined,
      compare: canCompare({ ...value, mode: 'month' }) ? value.compare : 'none',
    });
    onClose();
  };

  const handleQuarterClick = (quarter: (typeof QUARTERS)[number]) => {
    const startMonth = getQuarterStartMonth(quarter);
    onChange({
      ...value,
      mode: 'quarter',
      anchor: { monthIdx: startMonth, year: displayYear },
      endAnchor: undefined,
      compare: canCompare({ ...value, mode: 'quarter' })
        ? value.compare
        : 'none',
    });
    onClose();
  };

  const handleQuickAction = (mode: ReportPeriod['mode']) => {
    if (mode === 'custom') {
      // TODO: Custom date range sub-view
      return;
    }
    const now = new Date();
    const anchor =
      mode === 'trailing12m'
        ? { monthIdx: now.getMonth(), year: now.getFullYear() }
        : { monthIdx: 0, year: displayYear };
    const compare = mode === 'trailing12m' ? ('none' as const) : value.compare;
    onChange({
      ...value,
      mode,
      anchor,
      endAnchor: undefined,
      compare,
    });
    onClose();
  };

  const handleCompareChange = (compare: CompareMode) => {
    onChange({ ...value, compare });
  };

  const showCompare = canCompare(value);

  // Check what's currently selected in this display year
  const isMonthSelected = (monthIdx: number) =>
    value.mode === 'month' &&
    value.anchor.year === displayYear &&
    value.anchor.monthIdx === monthIdx;

  const isQuarterSelected = (quarter: number) =>
    value.mode === 'quarter' &&
    value.anchor.year === displayYear &&
    getQuarterForMonth(value.anchor.monthIdx) === quarter;

  const isQuickActionSelected = (mode: string) => {
    if (mode === 'year')
      return value.mode === 'year' && value.anchor.year === displayYear;
    if (mode === 'ytd')
      return value.mode === 'ytd' && value.anchor.year === displayYear;
    if (mode === 'trailing12m') return value.mode === 'trailing12m';
    return false;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Year navigation */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-7"
          disabled={!canGoBack}
          onClick={() => setDisplayYear((y) => y - 1)}
          aria-label="Previous year"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium tabular-nums">{displayYear}</span>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-7"
          disabled={!canGoForward}
          onClick={() => setDisplayYear((y) => y + 1)}
          aria-label="Next year"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Month + Quarter grid: 4 rows × (3 months + 1 quarter) */}
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5">
        {GRID_ROWS.map((row) => (
          <>
            {row.months.map((month) => {
              const disabled = isMonthDisabled(month.idx, displayYear, bounds);
              const selected = isMonthSelected(month.idx);
              return (
                <button
                  key={month.idx}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleMonthClick(month.idx)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    selected
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent hover:text-accent-foreground',
                    disabled && 'pointer-events-none opacity-40',
                  )}
                >
                  {month.short}
                </button>
              );
            })}
            <button
              key={`q${row.quarter}`}
              type="button"
              disabled={isQuarterDisabled(row.quarter, displayYear, bounds)}
              onClick={() => handleQuarterClick(row.quarter)}
              className={cn(
                'text-muted-foreground rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                isQuarterSelected(row.quarter)
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground',
                isQuarterDisabled(row.quarter, displayYear, bounds) &&
                  'pointer-events-none opacity-40',
              )}
            >
              Q{row.quarter}
            </button>
          </>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.mode}
            type="button"
            disabled={action.disabled}
            title={action.title}
            onClick={() => handleQuickAction(action.mode)}
            className={cn(
              'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              isQuickActionSelected(action.mode)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              action.disabled && 'pointer-events-none opacity-40',
            )}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Compare section */}
      {showCompare && (
        <>
          <div className="bg-border h-px" />
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
              Compare
            </span>
            <div className="flex gap-1">
              {COMPARE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleCompareChange(opt.value)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    value.compare === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported Component
// ---------------------------------------------------------------------------

export function ReportPeriodPicker({
  value,
  bounds,
  onChange,
  open,
  onOpenChange,
  children,
}: {
  value: ReportPeriod;
  bounds: PeriodBounds;
  onChange: (rp: ReportPeriod) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const handleClose = () => onOpenChange(false);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{children}</SheetTrigger>
        <SheetContent side="bottom" className="px-4 pt-4 pb-6">
          <SheetHeader className="p-0 pb-3">
            <SheetTitle className="text-sm">Select period</SheetTitle>
          </SheetHeader>
          <PeriodPickerGrid
            value={value}
            bounds={bounds}
            onChange={onChange}
            onClose={handleClose}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-4">
        <PeriodPickerGrid
          value={value}
          bounds={bounds}
          onChange={onChange}
          onClose={handleClose}
        />
      </PopoverContent>
    </Popover>
  );
}
