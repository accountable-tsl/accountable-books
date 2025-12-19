import { DatePicker } from '@/components/date-picker/date-picker';

// For String
export function EditableTextCell({
  value,
  onValueChange,
  placeholder,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex" title={value || ''}>
      <input
        type="text"
        placeholder={placeholder || ''}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        className="focus-within:text-blue-500 focus-within:border-1 p-1 pl-0 focus-within:pl-1 w-full"
      />
    </div>
  );
}

// For FS Date
export function EditableDateCell({ value }: { value?: Date }) {
  return (
    <DatePicker
      showLabel={false}
      value={value}
      classNames={{
        wrapper: 'contents',
        trigger:
          'border-0 rounded-none shadow-none focus-visible:border-0 focus-visible:ring-0 !pl-0 bg-transparent dark:bg-transparent dark:text-muted-foreground dark:hover:bg-transparent',
      }}
    />
  );
}

// For Numbers (e.g., Exchange Rate)
export function EditableNumberCell({
  value,
  onValueChange,
  placeholder,
  decimals = 4,
  min,
  max,
}: {
  value?: string | number;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  decimals?: number;
  min?: number;
  max?: number;
}) {
  const stringValue = value?.toString() || '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // Allow empty string, numbers, and decimal points
    if (inputValue === '' || /^\d*\.?\d*$/.test(inputValue)) {
      onValueChange?.(inputValue);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const numValue = parseFloat(e.target.value);
    if (!isNaN(numValue)) {
      // Clamp to min/max if provided
      let clampedValue = numValue;
      if (min !== undefined && clampedValue < min) clampedValue = min;
      if (max !== undefined && clampedValue > max) clampedValue = max;

      // Format to specified decimal places
      const formatted = clampedValue.toFixed(decimals);
      onValueChange?.(formatted);
    } else if (e.target.value === '') {
      onValueChange?.('');
    }
  };

  return (
    <div className="flex" title={stringValue || ''}>
      <input
        type="text"
        inputMode="decimal"
        placeholder={placeholder || ''}
        value={stringValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className="focus-within:text-blue-500 focus-within:border-1 p-1 w-full text-right"
      />
    </div>
  );
}
