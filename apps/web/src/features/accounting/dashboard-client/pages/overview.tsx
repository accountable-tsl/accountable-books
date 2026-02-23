import { TooltipHelper } from '@/components/TooltipHelper';
import { cn } from '@/lib/utils';
import { useSession } from '@session';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

import { ActionDataHealthStrip } from '../components/action-data-health-strip';
import { DashboardRightRail } from '../components/dashboard-right-rail';
import { DemoDataBadge } from '../components/demo-data-badge';
import {
  EmptyStateSyncing,
  EmptyStateUnlinkedBank,
} from '../components/empty-states';
import { MetricCard } from '../components/metric-card';
import { ACTION_CENTER_ID, MONTHS, READINESS_KEYS } from '../constants';
import {
  MOCK_ACTION_CENTER_TASKS,
  MOCK_ALL_CLEAR_MESSAGE,
  MOCK_DATA_HEALTH_LINE,
  MOCK_FINANCIAL_OVERVIEW_CARDS,
  MOCK_HAS_CONNECTED_BANK,
  MOCK_HAS_DATA,
} from '../mock-data';

import type { Period } from '../period-utils';

export interface DashboardOverviewTabProps {
  period: Period;
  onPeriodChange: (period: Period) => void;
}

export function DashboardOverviewTab({
  period,
  onPeriodChange,
}: DashboardOverviewTabProps) {
  const { company } = useSession();
  const showDemoBadge = company?.isDemoCompany === true;

  const hasPendingActions =
    MOCK_HAS_CONNECTED_BANK && MOCK_ACTION_CENTER_TASKS.length > 0;
  const firstPendingTask = MOCK_ACTION_CENTER_TASKS[0];

  const currentMonthIdx = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const getReadinessStatusIdx = (monthIdx: number, year: number) => {
    if (year > currentYear) return 3;
    if (year < currentYear) return 0;
    if (monthIdx > currentMonthIdx) return 3;
    if (monthIdx === currentMonthIdx) return 2;
    return 0;
  };

  const selectedStatusIdx = getReadinessStatusIdx(period.monthIdx, period.year);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {hasPendingActions ? (
          <ActionDataHealthStrip
            mode="pending"
            summary={`${MOCK_ACTION_CENTER_TASKS.length} items need your attention`}
            subline={
              firstPendingTask
                ? `${firstPendingTask.title} — ${firstPendingTask.impact}`
                : undefined
            }
            ctaLabel="View actions"
            onCtaClick={() =>
              document
                .getElementById(ACTION_CENTER_ID)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          />
        ) : (
          <ActionDataHealthStrip
            mode="allClear"
            message={MOCK_ALL_CLEAR_MESSAGE}
            dataHealthLine={MOCK_DATA_HEALTH_LINE}
          />
        )}

        {!MOCK_HAS_CONNECTED_BANK ? (
          <EmptyStateUnlinkedBank />
        ) : !MOCK_HAS_DATA ? (
          <EmptyStateSyncing />
        ) : (
          <>
            <div className="bg-background dark:bg-muted/30 rounded-md">
              <div className="flex flex-col">
                <div className="flex h-10 flex-wrap items-center justify-between gap-2 px-4 text-sm">
                  <div className="flex items-center gap-1">
                    <p>Readiness Center</p>
                    {showDemoBadge && <DemoDataBadge />}
                    <TooltipHelper
                      content="Write helpful text here"
                      contentStyle="text-center"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">
                      FY {period.year}
                    </span>
                  </div>
                </div>

                <div className="border-border/50 flex flex-col gap-4 border-t px-4 py-4 md:gap-1">
                  <div className="flex flex-col gap-4 md:flex-row">
                    <div className="bg-muted dark:bg-background md:outline-border border-border/50 flex max-w-full min-w-0 flex-1 flex-col justify-between overflow-hidden rounded-xl border md:h-32 md:flex-4 md:shadow-md md:outline md:dark:shadow-lg">
                      <div
                        className="bg-background/80 min-w-0 flex-1 overflow-x-auto text-sm backdrop-blur-sm [-webkit-overflow-scrolling:touch]"
                        role="grid"
                        aria-label="Readiness by month"
                      >
                        <div
                          className="[&>*:not(:nth-child(13n+1))]:before:bg-border grid h-full min-h-full w-full text-sm *:relative [&>*:not(:nth-child(13n+1))]:before:absolute [&>*:not(:nth-child(13n+1))]:before:top-[30%] [&>*:not(:nth-child(13n+1))]:before:left-0 [&>*:not(:nth-child(13n+1))]:before:h-2/5 [&>*:not(:nth-child(13n+1))]:before:w-px [&>*:not(:nth-child(13n+1))]:before:content-['']"
                          style={{
                            minWidth: 'max-content',
                            gridTemplateColumns:
                              '7rem repeat(12, minmax(2.5rem, 1fr))',
                            gridTemplateRows: 'auto 1fr',
                          }}
                        >
                          <div
                            className="flex items-center px-4 py-1 text-xs"
                            role="columnheader"
                            aria-label="Category"
                          >
                            <span className="bg-primary/50 h-2 w-2 animate-pulse rounded-full"></span>
                          </div>
                          {MONTHS.map((month) => (
                            <div
                              key={month.idx}
                              className="flex h-10 items-center justify-center font-normal"
                              role="columnheader"
                            >
                              {month.short}
                            </div>
                          ))}
                          <div
                            className="bg-background dark:bg-muted/60 flex min-h-9 items-center px-4 py-1"
                            role="rowheader"
                          >
                            Accounting
                          </div>
                          {MONTHS.map((month) => {
                            const statusIdx = getReadinessStatusIdx(
                              month.idx,
                              period.year,
                            );
                            const statusKey = READINESS_KEYS[statusIdx];
                            const Icon = statusKey.icon;
                            const isSelected = month.idx === period.monthIdx;
                            return (
                              <div
                                key={month.idx}
                                className="bg-background dark:bg-muted/60 flex min-h-8 items-center justify-center"
                                role="gridcell"
                              >
                                <button
                                  type="button"
                                  className={cn(
                                    'hover:bg-muted flex size-6 cursor-pointer items-center justify-center rounded-full',
                                    isSelected &&
                                      'bg-primary/85 hover:bg-primary',
                                  )}
                                  title={statusKey.label}
                                  onClick={() =>
                                    onPeriodChange({
                                      monthIdx: month.idx,
                                      year: period.year,
                                    })
                                  }
                                >
                                  <Icon
                                    className={cn(
                                      'size-4',
                                      isSelected
                                        ? 'text-primary-foreground'
                                        : statusKey.className,
                                    )}
                                  />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 px-4 py-2 text-sm opacity-70 sm:h-10 sm:flex-nowrap sm:justify-between">
                        {READINESS_KEYS.map((legendItem) => {
                          const Icon = legendItem.icon;
                          return (
                            <div
                              key={legendItem.label}
                              className="flex cursor-pointer items-center gap-1.5"
                              title={legendItem?.label ?? ''}
                            >
                              <span aria-hidden className="shrink-0">
                                <Icon
                                  className={cn('size-4', legendItem.className)}
                                />
                              </span>
                              <span className="text-[11px] sm:truncate">
                                {legendItem.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 md:w-64 md:shrink-0">
                      <div className="border-border/50 bg-background dark:md:outline-border flex w-full flex-col justify-between gap-2 rounded-xl border px-4 py-3 text-sm md:h-32 md:flex-1 md:shadow-md dark:md:outline">
                        <div className="flex flex-col gap-1">
                          <span className="text-foreground font-medium">
                            {MONTHS[period.monthIdx].long} Readiness
                          </span>
                          <div className="text-muted-foreground line-clamp-3 text-xs leading-relaxed">
                            {selectedStatusIdx === 0 && (
                              <>All tasks complete.</>
                            )}
                            {selectedStatusIdx === 2 && (
                              <>
                                Action Required: 2 tasks remaining
                                <br />
                                Awaiting Accountant: Review
                              </>
                            )}
                            {selectedStatusIdx === 3 && <>Not due yet.</>}
                          </div>
                        </div>
                        {selectedStatusIdx === 2 && (
                          <button className="text-primary group mt-2 flex cursor-pointer items-center gap-1 border-t pt-2 hover:underline">
                            <span className="truncate text-xs font-medium">
                              Message Accountant
                            </span>
                            <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-border/50 bg-background/50 dark:bg-muted/10 flex flex-col justify-between gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center md:mt-1 md:border-none md:bg-transparent md:px-1 md:py-0 md:shadow-none md:dark:bg-transparent">
                    <div className="flex flex-wrap items-center gap-2">
                      <CheckCircle2 className="size-4 shrink-0 text-green-600 md:hidden dark:text-green-500" />
                      <span className="text-foreground font-medium md:hidden md:font-normal">
                        Data reliability
                        <span className="hidden md:inline">:</span>
                      </span>
                      <span className="text-muted-foreground hidden px-1 sm:inline md:hidden">
                        ·
                      </span>
                      <span className="text-muted-foreground text-xs leading-snug">
                        {MOCK_DATA_HEALTH_LINE}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-background dark:bg-muted/30 flex min-w-0 flex-col rounded-md">
              <div className="flex h-10 items-center justify-between px-4 text-sm">
                <div className="flex items-center gap-1">
                  <div>Financial Overview</div>
                  {showDemoBadge && <DemoDataBadge />}
                </div>
                <div className="text-muted-foreground">
                  {MONTHS[period.monthIdx].short} {period.year}
                </div>
              </div>

              <div
                className={cn(
                  'border-border/50 grid w-full min-w-0 grid-cols-1 gap-4 border-t px-4 py-4 sm:grid-cols-2',
                  MOCK_FINANCIAL_OVERVIEW_CARDS.length % 3 === 0
                    ? 'lg:grid-cols-3'
                    : 'lg:grid-cols-2 xl:grid-cols-3',
                )}
              >
                {MOCK_FINANCIAL_OVERVIEW_CARDS.map((card) => (
                  <MetricCard key={card.title} {...card} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <DashboardRightRail />
    </div>
  );
}
