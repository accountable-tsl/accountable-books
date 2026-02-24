import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Paperclip,
} from 'lucide-react';

import { LineInfoCard } from './line-info-card';
import { PanelEmptyState } from './panel-empty-state';
import {
  formatCompactLineLabel,
  formatCurrency,
  formatDetailAmount,
  formatSourceLabel,
  formatVariance,
  formatVariancePercent,
  getAmountTone,
  getVarianceTone,
} from './statement-format';
import { formatIsoDate } from './statement-utils';

import type { LineVarianceIntent } from './statement-format';
import type {
  DetailAuditEvent,
  DetailTransaction,
  StatementLine,
} from './statement-types';

const AUDIT_EVENT_LABEL: Record<string, string> = {
  ledger_posted_auto: 'Posted automatically',
  ledger_posted_manual: 'Manual posting',
  metadata_updated: 'Metadata updated',
  ledger_superseded: 'Superseded',
  ledger_split_created: 'Split created',
  ledger_reversed: 'Reversed',
  ledger_marked_reviewed: 'Marked reviewed',
  ledger_marked_unreviewed: 'Marked unreviewed',
};

function auditEventLabel(ev: DetailAuditEvent): string {
  return AUDIT_EVENT_LABEL[ev.eventType] ?? ev.eventType;
}

export type DetailsPanelProps = {
  selectedLine: StatementLine | null;
  selectedLineParent: StatementLine | undefined;
  showCompare: boolean;
  compareLabel: string;
  detailAccounts: StatementLine[];
  detailTransactions: DetailTransaction[];
  currencyCode: string;
  canOpenLedgerExplorer: boolean;
  /** Set of line IDs that are derived/computed (no transactions to show). */
  derivedLineIds: Set<string>;
  /** Maps a line id to its variance intent. */
  getLineVarianceIntent: (lineId: string) => LineVarianceIntent;
};

export function DetailsPanel({
  selectedLine,
  selectedLineParent,
  showCompare,
  compareLabel,
  detailAccounts,
  detailTransactions,
  currencyCode,
  canOpenLedgerExplorer,
  derivedLineIds,
  getLineVarianceIntent,
}: DetailsPanelProps) {
  const [expandedTxnId, setExpandedTxnId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedTxnId(null);
  }, [selectedLine?.id]);

  if (!selectedLine) {
    return <PanelEmptyState message="Select a line to see details." />;
  }

  const breadcrumb = selectedLineParent
    ? `${selectedLineParent.label} › ${selectedLine.label}`
    : null;
  const isTopLevelWithChildren = !!selectedLine.children?.length;
  const isDerivedLine = derivedLineIds.has(selectedLine.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 text-sm">
      <LineInfoCard title={selectedLine.label} subtitle={breadcrumb}>
        <div
          className={cn(
            'mt-3 grid gap-2 text-xs',
            showCompare ? 'grid-cols-2' : 'grid-cols-1',
          )}
        >
          <div className="bg-muted/30 rounded-md p-2">
            <p className="text-muted-foreground">Current</p>
            <p className="mt-1 font-mono font-medium">
              {formatCurrency(selectedLine.amount, currencyCode)}
            </p>
          </div>
          {showCompare && (
            <div className="bg-muted/30 rounded-md p-2">
              <p className="text-muted-foreground">{compareLabel}</p>
              <p className="mt-1 font-mono font-medium">
                {formatCurrency(selectedLine.compareAmount, currencyCode)}
              </p>
            </div>
          )}
        </div>
        {showCompare ? (
          <p
            className={cn(
              'mt-3 text-xs',
              getVarianceTone(
                selectedLine.amount - selectedLine.compareAmount,
                getLineVarianceIntent(selectedLine.id),
              ),
            )}
          >
            Variance:{' '}
            {formatVariance(
              selectedLine.amount - selectedLine.compareAmount,
              currencyCode,
            )}{' '}
            (
            {formatVariancePercent(
              selectedLine.amount,
              selectedLine.compareAmount,
            )}
            )
          </p>
        ) : (
          <p className="text-muted-foreground mt-3 text-xs">
            No comparison selected.
          </p>
        )}
      </LineInfoCard>

      {isTopLevelWithChildren && (
        <div className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden">
          <p className="text-foreground mb-2 shrink-0 text-sm font-semibold">
            Accounts
          </p>
          <div className="bg-background border-border/50 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl border shadow-sm">
            <div className="divide-border/50 divide-y">
              {detailAccounts.map((account) => (
                <div
                  key={`acct-${account.id}`}
                  className={cn(
                    'hover:bg-muted/10 flex items-center justify-between p-3 text-xs transition-colors',
                    account.id === selectedLine.id &&
                      'bg-primary/5 hover:bg-primary/10',
                  )}
                >
                  <span
                    className={cn(
                      'truncate',
                      account.id === selectedLine.id
                        ? 'text-primary font-medium'
                        : 'font-medium',
                    )}
                  >
                    {formatCompactLineLabel(account.label)}
                  </span>
                  <span
                    className={cn(
                      'ml-2 flex-shrink-0 font-mono font-medium',
                      getAmountTone(account.amount),
                    )}
                  >
                    {formatDetailAmount(account.amount, currencyCode)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!isTopLevelWithChildren && !isDerivedLine && (
        <div className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden">
          <p className="text-foreground mb-2 shrink-0 text-sm font-semibold">
            Transactions
          </p>
          <div className="bg-background border-border/50 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl border shadow-sm">
            <div className="divide-border/50 divide-y">
              {detailTransactions.map((txn) => {
                const isExpanded = expandedTxnId === txn.id;
                const toggle = () =>
                  setExpandedTxnId((id) => (id === txn.id ? null : txn.id));
                return (
                  <div
                    key={txn.id}
                    className={cn(
                      'group transition-colors',
                      isExpanded ? 'bg-primary/5' : 'hover:bg-muted/10',
                    )}
                  >
                    <button
                      type="button"
                      onClick={toggle}
                      className="flex w-full cursor-pointer items-start justify-between gap-3 p-3 text-left text-xs"
                      aria-expanded={isExpanded}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'font-medium',
                            isExpanded ? 'text-primary' : 'text-foreground',
                          )}
                        >
                          {txn.description}
                        </p>
                        <p className="text-muted-foreground mt-1 text-[11px]">
                          {txn.date} · {formatSourceLabel(txn.source)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className={cn(
                              'font-mono font-medium',
                              getAmountTone(txn.amount),
                            )}
                          >
                            {formatDetailAmount(txn.amount, currencyCode)}
                          </span>
                          <span className="text-muted-foreground w-4 text-[10px] font-semibold tracking-wider">
                            {txn.drCr}
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="text-primary size-4 shrink-0 transition-transform" />
                        ) : (
                          <ChevronRight className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors" />
                        )}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-border/50 bg-background/50 text-muted-foreground border-t px-3 pt-3 pb-4 text-[11px]">
                        <div className="flex flex-col gap-4">
                          {/* Ledger coding details */}
                          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                            <p className="text-foreground font-semibold">
                              Account
                            </p>
                            <p className="mt-1 font-medium sm:mt-0">
                              {txn.account.code} {txn.account.label}
                            </p>
                          </div>

                          {/* Attachments */}
                          {(txn.attachments?.length ?? 0) > 0 && (
                            <div>
                              <p className="text-foreground font-semibold">
                                Attachments
                              </p>
                              <ul className="mt-1 space-y-1">
                                {txn.attachments!.map((file) => (
                                  <li key={file.id}>
                                    <a
                                      href={file.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-foreground hover:text-primary flex items-center gap-1.5 truncate underline transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Paperclip className="size-3.5 shrink-0" />
                                      {file.name}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Audit Trail */}
                          {(txn.auditEvents?.length ?? 0) > 0 && (
                            <div>
                              <p className="text-foreground font-semibold">
                                Activity history
                              </p>
                              <ul className="mt-2 space-y-0">
                                {txn.auditEvents!.map((ev, index) => {
                                  const isLast =
                                    index === txn.auditEvents!.length - 1;
                                  return (
                                    <li key={ev.id} className="flex gap-3">
                                      {/* Timeline dot & line */}
                                      <div className="flex flex-col items-center">
                                        <div className="bg-border ring-background/50 z-10 mt-1.5 size-2 shrink-0 rounded-full ring-2" />
                                        {!isLast && (
                                          <div className="bg-border/50 my-1 w-px flex-1" />
                                        )}
                                      </div>

                                      {/* Content */}
                                      <div
                                        className={cn(
                                          'min-w-0 flex-1',
                                          !isLast && 'pb-4',
                                        )}
                                      >
                                        <p className="text-foreground leading-snug">
                                          <span className="font-medium">
                                            {auditEventLabel(ev)}
                                          </span>{' '}
                                          by {ev.actorName}
                                        </p>
                                        <p className="mt-0.5 leading-none opacity-80">
                                          {formatIsoDate(ev.timestamp, {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </p>
                                        {ev.comment && (
                                          <p
                                            className="text-primary/80 mt-1 line-clamp-2 leading-snug italic"
                                            title={ev.comment}
                                          >
                                            &ldquo;{ev.comment}&rdquo;
                                          </p>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 shrink-0">
        {canOpenLedgerExplorer && (
          <button
            type="button"
            className="text-foreground hover:bg-muted/30 group flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium shadow-sm transition-colors"
          >
            <span>Open Ledger Explorer</span>
            <ArrowRight className="text-muted-foreground group-hover:text-foreground size-4 transition-colors" />
          </button>
        )}
      </div>
    </div>
  );
}
