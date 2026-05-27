import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { STATEMENT_TABLE_WIDTHS } from './StatementTable';

type StatementTableSkeletonProps = {
  showCompare: boolean;
  isMobile: boolean;
  showTrailingPercentColumn?: boolean;
};

export function StatementTableSkeleton({
  showCompare,
  isMobile,
  showTrailingPercentColumn = true,
}: StatementTableSkeletonProps) {
  const rowCount = 8;
  return (
    <div
      className={cn('min-h-0', isMobile ? 'overflow-y-auto' : 'overflow-auto')}
      aria-busy="true"
      aria-label="Loading statement"
    >
      <div
        className={cn(
          'w-full',
          !isMobile &&
            (showCompare
              ? STATEMENT_TABLE_WIDTHS.tableMinWithCompare
              : STATEMENT_TABLE_WIDTHS.tableMinNoCompare),
        )}
      >
        <div
          className={cn(
            'text-muted-foreground bg-background sticky top-0 z-10 flex h-9 w-full items-center justify-between gap-3 border-b px-3 text-xs font-medium',
          )}
        >
          <Skeleton
            className={cn(
              'h-4',
              isMobile
                ? 'min-w-0 flex-1'
                : STATEMENT_TABLE_WIDTHS.lineItemMinDesktop,
            )}
          />
          {!isMobile && showCompare && (
            <Skeleton
              className={cn(
                'h-4 shrink-0',
                STATEMENT_TABLE_WIDTHS.compareAmountDesktop,
              )}
            />
          )}
          <Skeleton
            className={cn(
              'h-4 shrink-0',
              isMobile
                ? STATEMENT_TABLE_WIDTHS.currentAmountMobile
                : STATEMENT_TABLE_WIDTHS.currentAmountDesktop,
            )}
          />
          {!isMobile && showCompare && (
            <Skeleton
              className={cn(
                'h-4 shrink-0',
                STATEMENT_TABLE_WIDTHS.varianceDesktop,
              )}
            />
          )}
          {!isMobile && (showCompare || showTrailingPercentColumn) && (
            <Skeleton
              className={cn(
                'h-4 shrink-0',
                STATEMENT_TABLE_WIDTHS.changeDesktop,
              )}
            />
          )}
        </div>
        {Array.from({ length: rowCount }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'border-border/30 flex h-11 items-center gap-3 border-b px-3',
              i % 3 === 2 && 'mb-2',
            )}
          >
            <Skeleton
              className={cn(
                'h-4',
                i % 3 === 0 ? 'w-3/4' : 'w-1/2',
                isMobile
                  ? 'min-w-0 flex-1'
                  : STATEMENT_TABLE_WIDTHS.lineItemMinDesktop,
              )}
            />
            {!isMobile && showCompare && (
              <Skeleton
                className={cn(
                  'h-4 shrink-0',
                  STATEMENT_TABLE_WIDTHS.compareAmountDesktop,
                )}
              />
            )}
            <Skeleton
              className={cn(
                'h-4 shrink-0',
                isMobile
                  ? STATEMENT_TABLE_WIDTHS.currentAmountMobile
                  : STATEMENT_TABLE_WIDTHS.currentAmountDesktop,
              )}
            />
            {!isMobile && showCompare && (
              <Skeleton
                className={cn(
                  'h-4 shrink-0',
                  STATEMENT_TABLE_WIDTHS.varianceDesktop,
                )}
              />
            )}
            {!isMobile && (showCompare || showTrailingPercentColumn) && (
              <Skeleton
                className={cn(
                  'h-4 shrink-0',
                  STATEMENT_TABLE_WIDTHS.changeDesktop,
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
