import { SimpleTooltip } from '@/components/TooltipHelper';
import { cn } from '@/lib/utils';
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  StickyNote,
} from 'lucide-react';

import {
  formatCurrency,
  formatPercentOfRevenue,
  formatSignedCurrency,
  formatVariancePercent,
  isFavorableDelta,
} from '../income-statement-format';
import { STATEMENT_TABLE_WIDTHS } from '../shared/StatementTable';

import type { LineVarianceIntent } from '../shared/statement-format';
import type {
  ReconciliationStatus,
  StatementLine,
  StatementNote,
} from '../shared/statement-types';

const RECONCILIATION_TOOLTIP: Record<ReconciliationStatus, string> = {
  reconciled: 'Reconciled',
  pending: 'Needs review',
  unreconciled: 'Unreconciled',
};

// ---------------------------------------------------------------------------
// ChangePct (private helper)
// ---------------------------------------------------------------------------

function ChangePct({
  delta,
  pct,
  favorable,
}: {
  delta: number;
  pct: string;
  favorable: boolean | null;
}) {
  const tone =
    favorable === null
      ? 'text-muted-foreground'
      : favorable
        ? 'text-green-600 dark:text-green-500'
        : 'text-destructive';
  const isUp = delta > 0;
  const isDown = delta < 0;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-end gap-0.5 text-[11px] font-light tracking-tighter',
        tone,
      )}
    >
      {isUp && <ArrowUpRight className="size-3 shrink-0" aria-hidden />}
      {isDown && <ArrowDownRight className="size-3 shrink-0" aria-hidden />}
      {pct}
    </span>
  );
}

// ---------------------------------------------------------------------------
// StatementRow
// ---------------------------------------------------------------------------

export type StatementRowProps = {
  line: StatementLine;
  depth?: number;
  selectedLineId: string | null;
  expandedRows: Record<string, boolean>;
  showCompare: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  notesMap: Map<string, StatementNote>;
  currencyCode: string;
  revenueAmount: number;
  getLineVarianceIntent: (lineId: string) => LineVarianceIntent;
  canOpenLedgerExplorer: boolean;
  onSelectLine: (lineId: string, tab: 'details' | 'notes') => void;
  onToggleExpand: (lineId: string) => void;
};

export function StatementRow({
  line,
  depth = 0,
  selectedLineId,
  expandedRows,
  showCompare,
  isMobile,
  isDesktop,
  notesMap,
  currencyCode,
  revenueAmount,
  getLineVarianceIntent,
  canOpenLedgerExplorer,
  onSelectLine,
  onToggleExpand,
}: StatementRowProps) {
  const isSelected = selectedLineId === line.id;
  const hasChildren = !!line.children?.length;
  const isExpanded = !!expandedRows[line.id];

  // Compare-mode values
  const delta = line.amount - line.compareAmount;
  const varianceIntent = getLineVarianceIntent(line.id);
  const favorable = isFavorableDelta(delta, varianceIntent);
  const pct = formatVariancePercent(line.amount, line.compareAmount);
  const percentOfRev = formatPercentOfRevenue(line.amount, revenueAmount);

  // Row styling
  const isNetIncome = line.id === 'net_income';
  const rowToneClass =
    line.tone === 'total'
      ? isNetIncome
        ? 'bg-muted/30 font-semibold'
        : 'bg-muted/20 font-semibold'
      : line.tone === 'subtotal'
        ? 'bg-muted/10 font-medium'
        : depth > 0
          ? 'text-[13px]'
          : 'font-medium';

  const rowBorderClass =
    line.tone === 'total' || line.tone === 'subtotal'
      ? 'border-t border-border/60'
      : '';

  const handleRowAction = () => {
    // 1. Always expand/collapse if it has children
    if (hasChildren && depth === 0) {
      onToggleExpand(line.id);
    }

    // 2. Decide if we also select the row
    // On desktop, we always select to keep the static right rail updated.
    // On tablet/mobile (where selecting opens a sheet drawer), we only select leaf rows.
    if (isDesktop || !hasChildren) {
      onSelectLine(line.id, 'details');
    }
  };

  const handleToggleAction = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (hasChildren && depth === 0) {
      onToggleExpand(line.id);
    }
  };

  const childrenId = `statement-children-${line.id}`;
  const indentPx = Math.max(depth - 1, 0) * 18;

  return (
    <div key={line.id}>
      <div
        role="row"
        data-statement-row
        aria-expanded={hasChildren && depth === 0 ? isExpanded : undefined}
        aria-controls={hasChildren && depth === 0 ? childrenId : undefined}
        tabIndex={0}
        className={cn(
          'flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors',
          'hover:bg-muted/30 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline',
          rowToneClass,
          rowBorderClass,
          isSelected && 'bg-primary/5',
        )}
        onClick={handleRowAction}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRowAction();
          }
        }}
      >
        {/* Cell: Line item */}
        <span
          className={cn(
            'flex flex-1 items-center gap-1.5',
            isMobile ? 'min-w-0' : STATEMENT_TABLE_WIDTHS.lineItemMinDesktop,
          )}
          role="cell"
        >
          {/* Only render the indent spacer when it has width; zero-width items still consume `gap`. */}
          {indentPx > 0 && (
            <span
              className="shrink-0"
              style={{ width: `${indentPx}px` }}
              aria-hidden
            />
          )}
          {hasChildren && depth === 0 ? (
            <button
              type="button"
              className="hover:bg-muted-foreground/20 flex size-4 shrink-0 items-center justify-center rounded-sm transition-colors"
              onClick={handleToggleAction}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleToggleAction(e);
                }
              }}
              aria-label={
                isExpanded ? 'Collapse sub-accounts' : 'Expand sub-accounts'
              }
            >
              {isExpanded ? (
                <ChevronDown
                  className="text-muted-foreground size-3.5"
                  aria-hidden
                />
              ) : (
                <ChevronRight
                  className="text-muted-foreground size-3.5"
                  aria-hidden
                />
              )}
            </button>
          ) : (
            <span className="size-3.5 shrink-0" aria-hidden />
          )}
          {/* Fixed-width status slot so child rows align, even when a status is missing. */}
          {depth > 0 && (
            <span className="flex w-3 shrink-0 items-center justify-start">
              {line.reconciliationStatus ? (
                <SimpleTooltip
                  content={RECONCILIATION_TOOLTIP[line.reconciliationStatus]}
                  ariaLabel={RECONCILIATION_TOOLTIP[line.reconciliationStatus]}
                  side="top"
                >
                  <span
                    className={cn(
                      'size-1.5 rounded-full opacity-60',
                      line.reconciliationStatus === 'reconciled' &&
                        'bg-emerald-500/70 dark:bg-emerald-400/70',
                      line.reconciliationStatus === 'pending' &&
                        'bg-amber-500/70 dark:bg-amber-400/70',
                      line.reconciliationStatus === 'unreconciled' &&
                        'bg-muted-foreground/35',
                    )}
                    aria-hidden
                  />
                </SimpleTooltip>
              ) : (
                <span className="size-1.5 rounded-full opacity-0" aria-hidden />
              )}
            </span>
          )}
          <span
            className={cn(
              'flex min-w-0 items-baseline gap-1.5',
              depth > 0 && 'text-muted-foreground',
            )}
          >
            <span className="min-w-0 truncate">{line.label}</span>
            {(() => {
              const hasOwnNote = notesMap.has(line.id);
              const childNoteCount =
                !hasOwnNote && hasChildren && !isExpanded
                  ? (line.children?.filter((c) => notesMap.has(c.id)).length ??
                    0)
                  : 0;
              const showIndicator = hasOwnNote || childNoteCount > 0;
              if (!showIndicator) return null;

              const isInherited = !hasOwnNote && childNoteCount > 0;
              const preview = hasOwnNote
                ? notesMap.get(line.id)!.body.slice(0, 80) +
                  (notesMap.get(line.id)!.body.length > 80 ? '...' : '')
                : `${childNoteCount} account note${childNoteCount > 1 ? 's' : ''}`;

              return (
                <SimpleTooltip content={preview} side="top">
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={hasOwnNote ? 'View note' : preview}
                    className={cn(
                      'shrink-0 transition-opacity',
                      isInherited
                        ? 'text-muted-foreground/30 hover:text-muted-foreground/60'
                        : 'text-muted-foreground/60 hover:text-muted-foreground',
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectLine(line.id, 'notes');
                    }}
                  >
                    <StickyNote className="size-3" aria-hidden />
                  </span>
                </SimpleTooltip>
              );
            })()}
            {line.code && (
              <span
                className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums"
                aria-label={`Account code ${line.code}`}
              >
                {line.code}
              </span>
            )}
          </span>
        </span>

        {/* Cell: Prior period amount */}
        {!isMobile && showCompare && (
          <span
            className={cn(
              'text-muted-foreground shrink-0 text-right font-mono text-sm tabular-nums',
              STATEMENT_TABLE_WIDTHS.compareAmountDesktop,
            )}
            role="cell"
          >
            {formatCurrency(line.compareAmount, currencyCode)}
          </span>
        )}

        {/* Cell: Current period amount */}
        <span
          className={cn(
            'text-foreground shrink-0 text-right font-mono text-sm tabular-nums',
            isMobile
              ? STATEMENT_TABLE_WIDTHS.currentAmountMobile
              : STATEMENT_TABLE_WIDTHS.currentAmountDesktop,
            isMobile && showCompare && 'flex flex-col items-end gap-0.5',
            line.amount < 0 && 'text-destructive',
          )}
          role="cell"
        >
          <span>{formatCurrency(line.amount, currencyCode)}</span>
          {isMobile && showCompare && (
            <span className="text-muted-foreground font-mono text-[11px] font-light tabular-nums">
              {formatCurrency(line.compareAmount, currencyCode)}
            </span>
          )}
        </span>

        {/* Cell: Variance */}
        {!isMobile && showCompare && (
          <span
            className={cn(
              'text-muted-foreground shrink-0 text-right font-mono text-[11px] font-light tabular-nums',
              STATEMENT_TABLE_WIDTHS.varianceDesktop,
            )}
            role="cell"
          >
            {formatSignedCurrency(delta, currencyCode)}
          </span>
        )}

        {/* Cell: Change % or % of revenue */}
        {!isMobile &&
          (showCompare ? (
            <span
              className={cn(
                'flex shrink-0 justify-end',
                STATEMENT_TABLE_WIDTHS.changeDesktop,
              )}
              role="cell"
            >
              <ChangePct delta={delta} pct={pct} favorable={favorable} />
            </span>
          ) : (
            <span
              className={cn(
                'text-muted-foreground shrink-0 text-right font-mono text-[11px] tabular-nums',
                STATEMENT_TABLE_WIDTHS.changeDesktop,
              )}
              role="cell"
            >
              {percentOfRev}
            </span>
          ))}
      </div>

      {/* Expandable children */}
      {hasChildren && isExpanded && (
        <div
          id={childrenId}
          className="border-border/60 ml-6 border-l"
          role="rowgroup"
        >
          {line.children!.map((child) => (
            <StatementRow
              key={child.id}
              line={child}
              depth={depth + 1}
              selectedLineId={selectedLineId}
              expandedRows={expandedRows}
              showCompare={showCompare}
              isMobile={isMobile}
              isDesktop={isDesktop}
              notesMap={notesMap}
              currencyCode={currencyCode}
              revenueAmount={revenueAmount}
              getLineVarianceIntent={getLineVarianceIntent}
              canOpenLedgerExplorer={canOpenLedgerExplorer}
              onSelectLine={onSelectLine}
              onToggleExpand={onToggleExpand}
            />
          ))}

          {/* Minimal footer line for expanded top-level groups (accountants only). */}
          {depth === 0 && canOpenLedgerExplorer && (
            <>
              <button
                type="button"
                className="text-muted-foreground flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 text-left text-[11px] font-normal hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  // Wiring to a real Ledger Explorer comes later.
                  onSelectLine(line.id, 'details');
                }}
              >
                {/* Match first-level line start (chevron placeholder + icon slot). */}
                <span className="size-3.5 shrink-0" aria-hidden />
                <span className="flex w-3 shrink-0 items-center justify-start">
                  <BookOpen className="size-3" aria-hidden />
                </span>
                <span className="min-w-0 truncate">
                  Open in Ledger Explorer
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
