import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type SimpleSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options:
    | string[]
    | { label: string; value: string }[]
    | ReadonlyArray<{ label: string; value: string }>
    | ReadonlyArray<string>;
  placeholder: string;
  className?: string;
  contentClassName?: string;
  itemClassName?: string;
  disabled?: boolean;
  width?: string;
  height?: string;
};

export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  contentClassName,
  itemClassName,
  disabled,
}: SimpleSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        className={cn('min-w-0 rounded', className)}
        disabled={disabled}
      >
        <span className="truncate">
          <SelectValue placeholder={placeholder} />
        </span>
      </SelectTrigger>

      <SelectContent className={contentClassName}>
        {options.map((option) => (
          <SelectItem
            key={typeof option === 'string' ? option : option.value}
            value={typeof option === 'string' ? option : option.value}
            className={cn(itemClassName, 'w-full text-sm')}
          >
            {typeof option === 'string' ? option : option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
