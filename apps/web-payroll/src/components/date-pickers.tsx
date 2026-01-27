import * as React from 'react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format, isValid, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

interface LabelProps {
  showLabel?: boolean;
  label?: string;
  className?: string; // className for the Field wrapper potentially
}

export interface DatePickerProps
  extends Omit<React.ComponentProps<typeof Button>, 'value' | 'onChange'> {
  value?: string | Date;
  onChange?: (date: string | undefined) => void;
  label?: LabelProps;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  classNames?: {
    root?: string;
    trigger?: string;
    label?: string;
    popoverContent?: string;
  };
  calendarProps?: Omit<
    React.ComponentProps<typeof Calendar>,
    'mode' | 'selected' | 'onSelect'
  >;
  popoverContentProps?: React.ComponentProps<typeof PopoverContent>;
  id?: string;
}

export const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      label,
      placeholder = 'Select date',
      disabled,
      invalid,
      classNames,
      className,
      calendarProps,
      popoverContentProps,
      id,
      ...props
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);

    const selectedDate = useMemo(() => {
      if (!value) return undefined;
      if (value instanceof Date) return value;
      const parsed = parseISO(value);
      return isValid(parsed) ? parsed : undefined;
    }, [value]);

    const handleSelect = (date: Date | undefined) => {
      setOpen(false);
      if (!date) {
        onChange?.('');
        return;
      }
      onChange?.(format(date, 'yyyy-MM-dd'));
    };

    const rootClass = cn('gap-0', classNames?.root, className);
    const triggerClass = cn(
      'w-full justify-between text-left font-normal',
      invalid && 'border-destructive focus-visible:ring-destructive/30',
      classNames?.trigger,
    );

    return (
      <Field className={rootClass}>
        {label?.showLabel && (
          <FieldLabel
            htmlFor={id}
            className={cn(
              disabled && 'cursor-not-allowed opacity-50',
              classNames?.label,
              label.className,
            )}
          >
            {label.label ?? 'Date'}
          </FieldLabel>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              ref={ref}
              id={id}
              variant="outline"
              disabled={disabled}
              className={triggerClass}
              {...props}
            >
              <span>
                {selectedDate ? format(selectedDate, 'PP') : placeholder}
              </span>
              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className={cn('w-auto p-0', classNames?.popoverContent)}
            align="start"
            {...popoverContentProps}
          >
            <Calendar
              mode="single"
              captionLayout="dropdown"
              {...calendarProps}
              selected={selectedDate}
              onSelect={handleSelect}
            />
          </PopoverContent>
        </Popover>
      </Field>
    );
  },
);
DatePicker.displayName = 'DatePicker';
