import type { LucideIcon } from 'lucide-react';
import { AiAssistButton } from '@/components/ai/ai-assist-button';
import { TooltipHelper } from '@/components/TooltipHelper';
import { aiRuntimeStore } from '@/modules/ai';
import { formatAmountCompact } from '@/shared/utils/formatting-utils';
import { ArrowDown, ArrowUp, CoinsIcon, MoveRight } from 'lucide-react';

/** Reusable metric/stat card for dashboard, P&L, and other pages */
export interface MetricCardProps {
  title: string;
  /** Shown in tooltip next to the title — explain what the metric means for the user */
  description?: string;
  value: string;
  change?: {
    direction: 'up' | 'down';
    percent: string;
    label: string;
  };
  footer?: {
    label: string;
    value: string;
    /** When set, value is formatted in full until 1B then abbreviated (B, T) — same as journals totals */
    valueNumber?: number;
  };
  icon?: LucideIcon;
}

export function MetricCard({
  title,
  description,
  value,
  change,
  footer,
  icon: Icon = CoinsIcon,
}: MetricCardProps) {
  const tooltipContent = description ?? title;
  const openAiWithMetricPrompt = () => {
    aiRuntimeStore
      .getState()
      .setInput(
        `Explain the "${title}" metric and what it means for my business.`,
      );
    aiRuntimeStore.getState().open();
  };
  return (
    <div className="dark:bg-background/80 group border-border/60 bg-background/50 hover:border-border/80 relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl border p-4 text-sm shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md">
      <div className="from-primary/5 absolute inset-0 bg-linear-to-br to-transparent opacity-0 mix-blend-overlay transition-opacity duration-500 group-hover:opacity-100"></div>

      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
          <Icon className="text-muted-foreground size-4" />
        </div>
        <AiAssistButton
          onClick={openAiWithMetricPrompt}
          label=""
          className="shrink-0"
        />
      </div>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground flex items-center gap-1 truncate text-xs font-medium">
            {title}
            <TooltipHelper
              content={tooltipContent}
              contentStyle="text-center"
            />
          </div>
          <p className="mt-0.5 truncate font-mono text-lg font-semibold tabular-nums">
            {value}
          </p>
        </div>
        {change && (
          <div className="flex shrink-0 flex-col items-end text-right text-xs">
            <div className="flex items-center gap-1">
              {change.direction === 'up' ? (
                <ArrowUp className="size-3.5 shrink-0 text-green-600 dark:text-green-500" />
              ) : (
                <ArrowDown className="text-destructive size-3.5 shrink-0" />
              )}
              <span className="tabular-nums">{change.percent}</span>
            </div>
            <span className="text-muted-foreground mt-0.5 block max-w-32 truncate">
              {change.label}
            </span>
          </div>
        )}
      </div>
      {footer && (
        <div className="border-border/50 flex min-w-0 items-center justify-between gap-2 border-t pt-2 text-[11px]">
          <span className="text-muted-foreground truncate">{footer.label}</span>
          <MoveRight className="text-muted-foreground size-3.5 shrink-0" />
          <span className="truncate tabular-nums">
            {footer.valueNumber !== undefined
              ? formatAmountCompact(footer.valueNumber, {
                  fullUntil: 'billion',
                })
              : footer.value}
          </span>
        </div>
      )}
    </div>
  );
}
