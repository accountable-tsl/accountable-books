import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Info } from 'lucide-react';

interface EmployeeComputationNotesIndicatorProps {
  notes: string[];
}

export function EmployeeComputationNotesIndicator({
  notes,
}: Readonly<EmployeeComputationNotesIndicatorProps>) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center rounded-sm p-0.5 transition-colors"
          aria-label="Employee-specific payroll settings"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-auto max-w-65 p-2 text-left">
        <ul className="space-y-1">
          {notes.map((note) => (
            <li key={note} className="text-[11px] leading-snug">
              {note}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
