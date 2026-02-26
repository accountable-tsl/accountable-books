import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

import type { StatementLine } from './statement-types';

export const STATEMENT_TABLE_WIDTHS = {
  tableMinWithCompare: 'min-w-[760px]',
  tableMinNoCompare: 'min-w-[620px]',
  lineItemMinDesktop: 'min-w-[14rem]',
  compareAmountDesktop: 'w-36',
  currentAmountDesktop: 'w-36',
  currentAmountMobile: 'w-24 min-w-20',
  varianceDesktop: 'w-32',
  changeDesktop: 'w-[4.5rem]',
} as const;

type StatementTableProps = {
  visibleLines: StatementLine[];
  sectionLabels: Record<string, string>;
  renderRow: (line: StatementLine, depth?: number) => ReactNode;
  showCompare: boolean;
  currentColumnLabel: string;
  compareColumnLabel?: string;
  ariaLabel: string;
  isMobile: boolean;
};

export function StatementTable({
  visibleLines,
  sectionLabels,
  renderRow,
  showCompare,
  currentColumnLabel,
  compareColumnLabel,
  ariaLabel,
  isMobile,
}: StatementTableProps) {
  return (
    <div
      className={cn('min-h-0', isMobile ? 'overflow-y-auto' : 'overflow-auto')}
      role="table"
      aria-label={ariaLabel}
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
          className="text-muted-foreground bg-background sticky top-0 z-10 flex h-9 w-full items-center justify-between gap-3 border-b px-3 text-xs font-medium"
          role="row"
        >
          <span
            className={cn(
              'flex-1 tracking-wider uppercase',
              isMobile ? 'min-w-0' : STATEMENT_TABLE_WIDTHS.lineItemMinDesktop,
            )}
            role="columnheader"
          >
            Line Item
          </span>
          {!isMobile && showCompare && (
            <span
              className={cn(
                STATEMENT_TABLE_WIDTHS.compareAmountDesktop,
                'shrink-0 text-right tracking-normal uppercase',
              )}
              role="columnheader"
              title={compareColumnLabel ?? 'Prior'}
            >
              <span className="block truncate">
                {compareColumnLabel ?? 'Prior'}
              </span>
            </span>
          )}
          <span
            className={cn(
              'shrink-0 text-right tracking-normal uppercase',
              isMobile
                ? STATEMENT_TABLE_WIDTHS.currentAmountMobile
                : STATEMENT_TABLE_WIDTHS.currentAmountDesktop,
            )}
            role="columnheader"
            title={currentColumnLabel}
          >
            <span className="block truncate">{currentColumnLabel}</span>
          </span>
          {!isMobile && showCompare && (
            <span
              className={cn(
                STATEMENT_TABLE_WIDTHS.varianceDesktop,
                'shrink-0 text-right tracking-wider uppercase',
              )}
              role="columnheader"
            >
              Variance
            </span>
          )}
          {!isMobile && (
            <span
              className={cn(
                STATEMENT_TABLE_WIDTHS.changeDesktop,
                'shrink-0 text-right tracking-wider uppercase',
              )}
              role="columnheader"
            >
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
