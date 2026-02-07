import type { JournalListRow } from '@accountable-books/contracts/schema';
import { FormattedAmount } from '@/components/FormattedAmount';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { safeFormatDate, toTitleCase } from '@/shared/utils/formatting-utils';
import { AlertTriangle, Repeat } from 'lucide-react';

import {
  getJournalStatusDotClass,
  isGeneratedJournal,
  isRecurringTemplateJournal,
} from '../lib/journal-ui';

function isBalancedRow(row: JournalListRow): boolean {
  const dr = Number(row.totalDebit);
  const cr = Number(row.totalCredit);
  if (!Number.isFinite(dr) || !Number.isFinite(cr)) return true;
  return Math.abs(dr - cr) < 0.01;
}

export function JournalListItem({
  journal,
  selected,
  onClick,
}: {
  journal: JournalListRow;
  selected: boolean;
  onClick: () => void;
}) {
  const balanced = isBalancedRow(journal);
  const isGenerated = isGeneratedJournal(journal);
  const isRecurringTemplate = isRecurringTemplateJournal(journal);
  const displayStatus = journal.kind === 'journal' ? journal.status : 'draft';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex h-18 w-full flex-col justify-center gap-0.5 border-b px-4 py-2 text-left transition-colors',
        selected ? 'bg-accent' : 'hover:bg-accent/50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'inline-block h-2 w-2 shrink-0 rounded-full',
              getJournalStatusDotClass(displayStatus),
            )}
            title={toTitleCase(displayStatus)}
          />
          <span className="text-ms truncate">{journal.title}</span>
          {isRecurringTemplate && (
            <Repeat
              className="text-muted-foreground/60 h-3 w-3 shrink-0"
              aria-label="Recurring template"
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!balanced && journal.kind === 'journal' && journal.status === 'draft' && (
            <AlertTriangle className="text-destructive h-3 w-3" />
          )}
          <span className="text-muted-foreground font-mono text-sm tabular-nums">
            <FormattedAmount
              amount={journal.totalDebit}
              currency={journal.currencyCode}
              showSymbol
              separator=""
            />
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pl-4">
        <div className="text-muted-foreground flex items-center truncate font-sans text-xs">
          <span className="truncate">
            {safeFormatDate({
              date: journal.date,
              formatString: 'MMM dd, yyyy',
            })}
            {journal.reference && (
              <span className="ml-1.5 font-mono opacity-60">
                {journal.reference}
              </span>
            )}
            {journal.contactName && (
              <>
                <span className="mx-1 opacity-40">/</span>
                {journal.contactName}
              </>
            )}
          </span>

          {isGenerated && (
            <span
              className={cn(
                'bg-accent text-muted-foreground ml-1.5 shrink-0 items-center rounded px-1.5 py-px text-[10px] font-medium',
                selected ? 'border py-0' : '',
              )}
            >
              Auto
            </span>
          )}
        </div>
        <span className="text-muted-foreground shrink-0 text-[11px]">
          {journal.entriesCount} lines
        </span>
      </div>
    </button>
  );
}
