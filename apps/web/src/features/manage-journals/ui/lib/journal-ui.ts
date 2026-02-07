import type { JournalListRow } from '@accountable-books/contracts/schema';

export type JournalStatus = 'draft' | 'posted' | 'voided';

export function getJournalStatusDotClass(status: JournalStatus) {
  switch (status) {
    case 'posted':
      return 'bg-emerald-500';
    case 'voided':
      return 'bg-destructive/70';
    default:
      return 'bg-muted-foreground/50';
  }
}

export function getJournalStatusBadgeVariant(status: JournalStatus) {
  switch (status) {
    case 'posted':
      return 'default' as const;
    case 'voided':
      return 'outline' as const;
    default:
      return 'secondary' as const;
  }
}

export function isGeneratedJournal(journal: JournalListRow) {
  return journal.kind === 'journal' && journal.journalSource === 'generated_from_template';
}

export function isRecurringTemplateJournal(journal: JournalListRow) {
  return journal.kind === 'recurring_template';
}
