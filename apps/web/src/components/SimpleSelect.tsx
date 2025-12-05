import { ReactNode } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Option = {
  label: string;
  value: string;
};

type SimpleSelectProps = {
  value: string;
  onChange: (val: string) => void;
  options: Option[];
  placeholder?: string;
  width?: string;
  height?: string;
  icon?: ReactNode;
  className?: string;
};

export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder,
  width,
  height,
  icon,
  className,
}: SimpleSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn(width, height, className)}>
        {icon && <span className="mr-2">{icon}</span>}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
