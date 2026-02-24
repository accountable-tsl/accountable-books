import { TooltipHelper } from '@/components/TooltipHelper';
import { cn } from '@/lib/utils';

export type KpiItem = {
  title: string;
  description?: string;
  value: string;
  direction: 'up' | 'down';
  percent: string;
};

export function KpiStrip({ kpis }: { kpis: KpiItem[] }) {
  return (
    <div className="border-border/60 grid grid-cols-3 divide-x border-b">
      {kpis.map((kpi) => (
        <div key={kpi.title} className="px-3 py-2">
          <div className="text-muted-foreground flex items-center gap-1 truncate text-[11px] font-medium">
            <span className="min-w-0 truncate">{kpi.title}</span>
            {kpi.description != null && (
              <TooltipHelper
                content={kpi.description}
                trigger={null}
                icon={true}
                iconSize={10}
                triggerWrapperClassName="shrink-0"
              />
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold tabular-nums">
              {kpi.value}
            </span>
            <span
              className={cn(
                'text-[11px] font-medium',
                kpi.direction === 'up'
                  ? 'text-green-600 dark:text-green-500'
                  : 'text-destructive',
              )}
            >
              {kpi.percent}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
