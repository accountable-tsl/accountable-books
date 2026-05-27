import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

type SimpleCalendarProps = Omit<
  ComponentProps<typeof Calendar>,
  'mode' | 'selected' | 'onSelect'
> & {
  date?: Date;
  onSelect?: (date: Date | undefined) => void;
};

export default function SimpleCalendar({
  date,
  onSelect,
  className,
  ...props
}: SimpleCalendarProps) {
  const [localDate, setLocalDate] = useState<Date | undefined>(new Date());

  const activeDate = date ?? localDate;
  const setDate = onSelect ?? setLocalDate;

  return (
    <Calendar
      mode="single"
      defaultMonth={activeDate}
      selected={activeDate}
      onSelect={setDate}
      className={cn('rounded border shadow-sm', className)}
      {...props}
    />
  );
}
