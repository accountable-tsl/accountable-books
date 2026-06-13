import type {
  JournalBatchStatus,
  RecurringTemplateStatus,
} from '@accountable-books/contracts/schema';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ArrowLeft, Menu } from 'lucide-react';

import { StatusLabel } from './status-label';

export type JournalDetailHeaderAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  className?: string;
  title?: string;
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link';
  disabled?: boolean;
  onClick: () => void;
};

export function JournalDetailHeader({
  systemReference,
  status,
  leftAddon,
  actions,
  onBack,
  isMobile,
  showStatusLabel = true,
}: {
  systemReference: string | null;
  status: JournalBatchStatus | RecurringTemplateStatus;
  leftAddon?: React.ReactNode;
  actions: readonly JournalDetailHeaderAction[];
  onBack?: () => void;
  isMobile: boolean;
  showStatusLabel?: boolean;
}) {
  const inlineMobileAction = actions.length === 1 ? actions[0] : null;
  const menuMobileActions = actions.length > 1 ? actions : [];

  return (
    <div className="flex items-center justify-between border-b px-5 py-2 pt-6 text-sm sm:pt-2">
      <div className="flex items-baseline gap-1">
        <div
          className="text-muted-foreground max-w-36 truncate font-mono whitespace-nowrap sm:pt-2 sm:text-sm"
          title={systemReference || undefined}
        >
          {systemReference || 'Journal'}
        </div>

        {showStatusLabel && <StatusLabel status={status} />}
        {leftAddon ?? null}
      </div>

      {isMobile && (
        <div className="flex gap-2">
          {inlineMobileAction ? (
            <button
              type="button"
              onClick={inlineMobileAction.onClick}
              disabled={inlineMobileAction.disabled}
              title={inlineMobileAction.title}
              className="flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs disabled:opacity-50"
            >
              {inlineMobileAction.icon && (
                <inlineMobileAction.icon className="size-4" />
              )}
              {inlineMobileAction.label}
            </button>
          ) : null}

          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center justify-center gap-1 rounded-md border px-2.5 py-1.5 text-xs"
            >
              <ArrowLeft className="size-4" />
              Back
            </button>
          ) : null}

          {actions.length > 1 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center"
                >
                  <Menu className="size-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="relative z-10 flex w-32 flex-col gap-1.5 rounded-none border-none bg-inherit px-0 py-0 shadow-none"
                align="end"
              >
                {menuMobileActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.key}
                      onClick={action.onClick}
                      disabled={action.disabled}
                      title={action.title}
                      className={cn(
                        'bg-background flex w-full items-center justify-end gap-1 rounded border px-2 py-0.75 text-sm disabled:pointer-events-none disabled:opacity-50',
                        action.className,
                      )}
                    >
                      {action.label}
                      <Icon className="size-3" />
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      {!isMobile && (
        <div className="flex gap-1">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                variant={action.variant || 'ghost'}
                size="sm"
                key={action.key}
                disabled={action.disabled}
                onClick={action.onClick}
                title={action.title}
                className={cn(
                  'h-6 rounded py-0 text-xs font-medium',
                  action.className,
                )}
              >
                <Icon className="size-3" />
                {action.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
