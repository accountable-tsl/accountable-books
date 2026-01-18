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
  width?: string;
  height?: string;
};

export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: SimpleSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('rounded', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={typeof option === 'string' ? option : option.value}
            value={typeof option === 'string' ? option : option.value}
          >
            {typeof option === 'string' ? option : option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
