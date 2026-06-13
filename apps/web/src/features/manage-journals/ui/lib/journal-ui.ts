import type { JournalListRow } from '@accountable-books/contracts/schema';

export type JournalStatus = 'draft' | 'posted' | 'voided' | 'reversed';

export function getJournalStatusDotClass(status: JournalStatus) {
  switch (status) {
    case 'posted':
      return 'bg-emerald-500';
    case 'voided':
      return 'bg-destructive/70';
    case 'reversed':
      return 'bg-amber-500';
    default:
      return 'bg-muted-foreground/50';
  }
}

/** Single dot color for all recurring templates so they read as "recurring" at a glance without extra status decoding. */
export const RECURRING_TEMPLATE_DOT_CLASS = 'bg-violet-500';

export function getJournalStatusBadgeVariant(status: JournalStatus) {
  switch (status) {
    case 'posted':
      return 'default' as const;
    case 'voided':
      return 'outline' as const;
    case 'reversed':
      return 'outline' as const;
    default:
      return 'secondary' as const;
  }
}

export function isGeneratedJournal(journal: JournalListRow) {
  return (
    journal.kind === 'journal' &&
    journal.journalSource === 'generated_from_template'
  );
}

export function isRecurringTemplateJournal(journal: JournalListRow) {
  return journal.kind === 'recurring_template';
}
