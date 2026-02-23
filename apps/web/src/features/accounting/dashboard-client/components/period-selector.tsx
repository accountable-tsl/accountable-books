import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  clampPeriodToBounds,
  getMonthOptionsForYear,
  getYearOptions,
} from '../period-utils';

import type { Period, PeriodBounds } from '../period-utils';

export function PeriodSelector({
  period,
  periodBounds,
  onPeriodChange,
}: {
  period: Period;
  periodBounds: PeriodBounds;
  onPeriodChange: (period: Period) => void;
}) {
  const yearOptions = getYearOptions(periodBounds);
  const monthOptions = getMonthOptionsForYear(period.year, periodBounds);

  const handleYearChange = (value: string) => {
    const newYear = Number(value);
    const next = clampPeriodToBounds(
      { ...period, year: newYear },
      periodBounds,
    );
    onPeriodChange(next);
  };

  const handleMonthChange = (value: string) => {
    const newMonthIdx = Number(value);
    const next = clampPeriodToBounds(
      { ...period, monthIdx: newMonthIdx },
      periodBounds,
    );
    onPeriodChange(next);
  };

  const monthValue = String(period.monthIdx);
  const yearValue = String(period.year);
  const monthInOptions = monthOptions.some((m) => m.value === monthValue);

  return (
    <div
      className="flex shrink-0 items-center gap-2"
      role="group"
      aria-label="Viewing period"
    >
      <Select
        value={
          monthInOptions ? monthValue : (monthOptions[0]?.value ?? monthValue)
        }
        onValueChange={handleMonthChange}
      >
        <SelectTrigger
          size="sm"
          className="text-muted-foreground min-w-[4.5rem]"
          aria-label="Month"
        >
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent className="min-w-[4.5rem]">
          {monthOptions.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={yearValue} onValueChange={handleYearChange}>
        <SelectTrigger
          size="sm"
          className="text-muted-foreground min-w-[5rem]"
          aria-label="Year"
        >
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent className="min-w-[5rem]">
          {yearOptions.map((y) => (
            <SelectItem key={y.value} value={y.value}>
              {y.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
