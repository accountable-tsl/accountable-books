import type {
  JournalBatchStatus,
  RecurringTemplateStatus,
} from '@accountable-books/contracts/schema';
import { cn } from '@/lib/utils';

type LabelConfig = {
  label: string;
  className: string;
};

const statusMap: Record<
  JournalBatchStatus | RecurringTemplateStatus,
  LabelConfig
> = {
  posted: { label: 'Posted', className: 'bg-emerald-500/10 text-emerald-500' },
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  voided: { label: 'Voided', className: 'bg-destructive/10 text-destructive' },
  active: { label: 'Active', className: 'bg-emerald-500/10 text-emerald-500' },
  paused: { label: 'Paused', className: 'bg-amber-500/10 text-amber-600' },
  closed: { label: 'Closed', className: 'bg-muted text-muted-foreground' },
};

export function StatusLabel({
  status,
  noColor = false,
  className,
}: {
  status: JournalBatchStatus | RecurringTemplateStatus;
  noColor?: boolean;
  className?: string;
}) {
  const config = statusMap[status];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.25 font-sans text-[10px] font-medium',
        noColor ? 'bg-muted text-muted-foreground' : config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
