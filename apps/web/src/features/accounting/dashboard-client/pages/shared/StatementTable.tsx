import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

import type { StatementLine } from './statement-types';

type StatementTableProps = {
  visibleLines: StatementLine[];
  sectionLabels: Record<string, string>;
  renderRow: (line: StatementLine, depth?: number) => ReactNode;
  showCompare: boolean;
  ariaLabel: string;
  isMobile: boolean;
};

export function StatementTable({
  visibleLines,
  sectionLabels,
  renderRow,
  showCompare,
  ariaLabel,
  isMobile,
}: StatementTableProps) {
  return (
    <div
      className={cn('min-h-0', isMobile ? 'overflow-y-auto' : 'overflow-auto')}
      role="table"
      aria-label={ariaLabel}
    >
      <div className="w-full">
        <div
          className="text-muted-foreground bg-background sticky top-0 z-10 flex h-9 w-full items-center justify-between gap-3 border-b px-3 text-xs font-medium tracking-wider uppercase"
          role="row"
        >
          <span className="min-w-0 flex-1" role="columnheader">
            Line Item
          </span>
          {!isMobile && showCompare && (
            <span className="w-28 shrink-0 text-right" role="columnheader">
              Prior
            </span>
          )}
          <span
            className={cn(
              'shrink-0 text-right',
              isMobile ? 'w-24 min-w-20' : 'w-28',
            )}
            role="columnheader"
          >
            Current
          </span>
          {!isMobile && showCompare && (
            <span className="w-24 shrink-0 text-right" role="columnheader">
              Variance
            </span>
          )}
          {!isMobile && (
            <span className="w-16 shrink-0 text-right" role="columnheader">
              {showCompare ? 'Change' : '% Rev'}
            </span>
          )}
        </div>

        {visibleLines.map((line) => {
          const isSectionEnd =
            line.id === 'gross_profit' || line.id === 'operating_result';
          return (
            <div
              key={line.id}
              className={cn(
                sectionLabels[line.id] && 'bg-muted/5',
                isSectionEnd && 'mb-4',
              )}
            >
              {renderRow(line)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
