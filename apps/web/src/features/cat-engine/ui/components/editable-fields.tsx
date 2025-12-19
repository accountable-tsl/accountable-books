import { useEffect, useState } from 'react';

import { DatePicker } from '@/components/date-picker/date-picker';

// For String
export function EditableTextCell({
  value = '',
  onCommit,
  placeholder,
  markDirty,
}: {
  value?: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  markDirty: () => void;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const commitIfDirty = () => {
    if (localValue !== value) {
      onCommit?.(localValue);
    }
  };

  const handleChange = (value: string | undefined) => {
    if (value !== localValue) {
      setLocalValue(value || ''); // UI only
      markDirty();
    }
  };

  return (
    <div className="flex" title={value}>
      <input
        type="text"
        placeholder={placeholder || ''}
        value={localValue}
        onChange={(e) => handleChange(e.target.value)} // UI only
        onBlur={commitIfDirty} // intent
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur(); // forces commit
          }
        }}
        className="focus-within:text-blue-500 focus-within:border-1 p-1 pl-0 focus-within:pl-1 w-full"
      />
    </div>
  );
}

// For FS Date
export function EditableDateCell({
  value,
  onCommit,
  markDirty,
}: {
  value?: Date;
  onCommit: (date: Date | undefined) => void;
  markDirty: () => void;
}) {
  const [localDate, setLocalDate] = useState<Date | undefined>(value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLocalDate(value);
  }, [value]);

  const commitIfDirty = () => {
    if (localDate?.getTime() !== value?.getTime()) {
      onCommit?.(localDate);
    } else {
      setLocalDate(value); // revert if invalid/no change
    }
  };

  const handleChange = (value: Date | undefined) => {
    if (!value) return;
    setLocalDate(value); // UI only
    markDirty();
  };
  return (
    <DatePicker
      showLabel={false}
      value={localDate}
      onChange={(date) => handleChange(date)} // UI only
      classNames={{
        wrapper: 'contents',
        trigger:
          'border-0 rounded-none shadow-none focus-visible:border-0 focus-visible:ring-0 !pl-0 bg-transparent dark:bg-transparent dark:text-muted-foreground dark:hover:bg-transparent',
      }}
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) commitIfDirty(); // commit when popover closes
        setOpen(isOpen);
      }}
    />
  );
}

// For Numbers (e.g., Exchange Rate)
export function EditableNumberCell({
  value = '',
  onCommit,
  markDirty,
  placeholder,
  decimals = 4,
  min,
  max,
}: {
  value?: string | number;
  onCommit: (value: string) => void;
  markDirty: () => void;
  placeholder?: string;
  decimals?: number;
  min?: number;
  max?: number;
}) {
  const [localValue, setLocalValue] = useState(value?.toString() || '');

  useEffect(() => {
    setLocalValue(value?.toString() || '');
  }, [value]);

  const commitIfDirty = () => {
    const numValue = parseFloat(localValue);
    if (!isNaN(numValue) && numValue !== Number(value)) {
      const clamped = Math.min(
        Math.max(numValue, min ?? numValue),
        max ?? numValue,
      );
      onCommit?.(clamped.toFixed(decimals));
    } else {
      setLocalValue(value?.toString() || ''); // revert
    }
  };

  const handleChange = (value: string | undefined) => {
    if (value !== localValue) {
      setLocalValue(value || '');
      markDirty();
    }
  };

  return (
    <div className="flex" title={localValue}>
      <input
        type="text"
        inputMode="decimal"
        placeholder={placeholder || ''}
        value={localValue}
        onChange={(e) => handleChange(e.target.value)} // UI only
        onBlur={commitIfDirty} // commit intent
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur(); // forces commit
        }}
        className="focus-within:text-blue-500 focus-within:border-1 p-1 w-full text-right"
      />
    </div>
  );
}
