import { ReportToolbar } from '../components/report-toolbar';

import type { PeriodBounds } from '../period-utils';
import type { ReportPeriod } from '../report-period';

export function DashboardIncomeTab({
  period,
  bounds,
  onPeriodChange,
}: {
  period: ReportPeriod;
  bounds: PeriodBounds;
  onPeriodChange: (rp: ReportPeriod) => void;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <ReportToolbar
          period={period}
          bounds={bounds}
          onPeriodChange={onPeriodChange}
        />
        <div className="bg-background/80 flex min-h-[220px] flex-1 flex-col rounded-md border-2 border-fuchsia-500/80 p-4">
          <div className="mb-2 text-sm font-medium text-fuchsia-900 dark:text-fuchsia-200">
            Profit &amp; Loss Grid A
          </div>
          <div className="grid flex-1 grid-cols-3 gap-2">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-center justify-center rounded border border-fuchsia-400/90 bg-fuchsia-100/70 text-[11px] text-fuchsia-900 dark:bg-fuchsia-900/40 dark:text-fuchsia-100"
              >
                A{idx + 1}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2 lg:w-[320px] lg:shrink-0 xl:w-[380px]">
        <div className="bg-background/80 flex min-h-[220px] flex-1 flex-col rounded-md border-2 border-lime-500/80 p-4">
          <div className="mb-2 text-sm font-medium text-lime-900 dark:text-lime-200">
            Profit &amp; Loss Grid B
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-center justify-center rounded border border-lime-400/90 bg-lime-100/70 text-[11px] text-lime-900 dark:bg-lime-900/40 dark:text-lime-100"
              >
                B{idx + 1}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
