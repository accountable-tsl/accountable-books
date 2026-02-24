import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

/** Props for the action and data health strip (pending vs all-clear). */
export type ActionDataHealthStripProps =
  | {
      mode: 'pending';
      summary: string;
      subline?: string;
      ctaLabel: string;
      onCtaClick: () => void;
    }
  | {
      mode: 'allClear';
      message: string;
      dataHealthLine?: string;
      ctaLabel?: string;
      onCtaClick?: () => void;
    };

export function ActionDataHealthStrip(props: ActionDataHealthStripProps) {
  const sectionClass =
    'bg-background dark:bg-muted/30 rounded-md px-4 text-sm flex min-h-12 items-center';

  if (props.mode === 'pending') {
    const { summary, subline, ctaLabel, onCtaClick } = props;
    return (
      <div
        className={cn(sectionClass, 'border-primary/30 dark:border-primary/20')}
        role="status"
        aria-live="polite"
      >
        <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3">
          <AlertCircle className="text-primary size-4 shrink-0" aria-hidden />
          <span className="line-clamp-2 min-w-0 flex-1 text-xs font-medium md:line-clamp-1 md:text-sm">
            {summary}
            <br className="md:hidden" />
            {subline && (
              <span className="text-muted-foreground font-normal">
                {' — '}
                {subline}
              </span>
            )}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 cursor-pointer font-normal md:hidden"
            onClick={onCtaClick}
          >
            {ctaLabel}
          </Button>
        </div>
      </div>
    );
  }

  const { message, dataHealthLine } = props;
  return (
    <div className={sectionClass} role="status" aria-live="polite">
      <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3">
        <CheckCircle2
          className="size-4 shrink-0 text-green-600 dark:text-green-500"
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          {message}
          {dataHealthLine && (
            <span className="text-muted-foreground">
              {' · '}
              {dataHealthLine}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
