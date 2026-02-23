import { Button } from '@/components/ui/button';

import { ACTION_CENTER_ID } from '../constants';
import {
  MOCK_ACTION_CENTER_TASKS,
  MOCK_COMPLIANCE_ALERTS,
  MOCK_HAS_CONNECTED_BANK,
  MOCK_QUICK_ACTIONS,
} from '../mock-data';

export function DashboardRightRail() {
  return (
    <div
      id={ACTION_CENTER_ID}
      className="flex min-w-0 flex-col gap-4 lg:w-[320px] lg:shrink-0 xl:w-[380px]"
    >
      <div className="bg-background border-border/50 flex min-w-0 flex-col overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border/50 bg-muted/20 dark:bg-muted/30 flex min-h-12 shrink-0 items-center border-b px-4 text-sm md:px-5">
          <p className="text-foreground min-w-0 truncate font-semibold">
            Action Center
          </p>
        </div>
        <div className="flex flex-col">
          {!MOCK_HAS_CONNECTED_BANK || MOCK_ACTION_CENTER_TASKS.length === 0 ? (
            <div className="p-4 md:px-5">
              <p className="text-muted-foreground text-sm">
                No actions needed from you right now.
              </p>
            </div>
          ) : (
            MOCK_ACTION_CENTER_TASKS.map((task) => (
              <div
                key={task.id}
                className="border-border/50 hover:bg-muted/30 group flex min-w-0 flex-col gap-3 border-b p-4 text-sm transition-colors last:border-0 sm:flex-row sm:items-center sm:justify-between md:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="group-hover:text-primary font-medium transition-colors">
                    {task.title}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Due: <span className="text-foreground">{task.due}</span> ·{' '}
                    <span className="text-destructive/80 font-medium">
                      {task.impact}
                    </span>
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full shrink-0 font-medium shadow-sm transition-transform active:scale-95 sm:w-auto"
                  onClick={() => {}}
                >
                  {task.ctaLabel}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-background border-border/50 flex min-w-0 flex-col overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border/50 bg-muted/20 dark:bg-muted/30 flex min-h-12 shrink-0 items-center border-b px-4 text-sm md:px-5">
          <p className="text-foreground min-w-0 truncate font-semibold">
            Deadlines
          </p>
        </div>
        <div className="flex flex-col">
          {!MOCK_HAS_CONNECTED_BANK || MOCK_COMPLIANCE_ALERTS.length === 0 ? (
            <div className="p-4 md:px-5">
              <p className="text-muted-foreground text-xs">
                No upcoming deadlines.
              </p>
            </div>
          ) : (
            MOCK_COMPLIANCE_ALERTS.map((alert) => (
              <div
                key={alert.id}
                className="text-muted-foreground border-border/50 hover:bg-muted/30 flex min-w-0 flex-wrap items-center justify-between gap-2 border-b p-4 text-xs transition-colors last:border-0 sm:flex-nowrap md:px-5"
              >
                <span className="text-foreground/80 font-medium">
                  {alert.title}
                  {alert.due != null && ` · ${alert.due}`}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-background border-border/50 flex min-w-0 flex-col overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border/50 bg-muted/20 dark:bg-muted/30 flex min-h-12 shrink-0 items-center border-b px-4 text-sm md:px-5">
          <p className="text-foreground min-w-0 truncate font-semibold">
            Quick actions
          </p>
        </div>
        <div className="flex flex-col">
          {MOCK_QUICK_ACTIONS.map((action) => (
            <div
              key={action.label}
              className="border-border/50 hover:bg-muted/30 flex min-w-0 items-center justify-between gap-2 border-b p-3 transition-colors last:border-0 md:px-5"
            >
              <span className="min-w-0 text-sm font-medium">
                {action.label}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 font-medium"
                onClick={() => {}}
              >
                Go
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
