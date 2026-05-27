import { forwardRef, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { safeFormatDate } from '@/shared/utils/formatting-utils';
import { ChevronDownIcon } from 'lucide-react';

export interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  label?: string;
  showLabel?: boolean;
  name?: string;
  disabled?: boolean;
  buttonVariant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link';
  classNames?: { wrapper?: string; trigger?: string; label?: string };
  calendarDisabled?: (date: Date) => boolean;

  open?: boolean;
  onOpenChange?: (isOpen: boolean) => void;

  align?: 'start' | 'center' | 'end';
}

export const DatePicker = forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      label = 'Date',
      showLabel = true,
      name,
      disabled,
      buttonVariant = 'outline',
      classNames = {},
      calendarDisabled = false,

      open: controlledOpen,
      onOpenChange: controlledOnOpenChange,

      align = 'start',
    },
    ref,
  ) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const [internalDate, setInternalDate] = useState<Date | undefined>(value);

    const open = controlledOpen ?? internalOpen;
    const setOpen = controlledOnOpenChange ?? setInternalOpen;

    const formattedDate = useMemo(
      () =>
        safeFormatDate({
          date: value ?? internalDate,
          formatString: 'dd MMM yyyy',
        }),
      [value, internalDate],
    );

    const handleChange = (selected: Date | undefined) => {
      if (!value) setInternalDate(selected);
      onChange?.(selected);
      setOpen(false);
    };

    return (
      <div className={cn('flex flex-col gap-3', classNames?.wrapper)}>
        {showLabel && (
          <Label htmlFor={name} className={cn('px-1', classNames?.label)}>
            {label}
          </Label>
        )}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              ref={ref}
              disabled={disabled}
              variant={buttonVariant}
              id="date"
              className={cn(
                'w-48 justify-between font-normal',
                classNames?.trigger,
              )}
            >
              {formattedDate || 'Select date'}
              <ChevronDownIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align={align}>
            <Calendar
              mode="single"
              selected={value ?? internalDate}
              captionLayout="dropdown"
              onSelect={handleChange}
              disabled={calendarDisabled}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  },
);

DatePicker.displayName = 'DatePicker';
