import type { JournalBatchInput } from '@accountable-books/contracts/schema';

type JournalEntryInput = JournalBatchInput['entries'][number];

export type JournalEntryPayloadLine = {
  description: string;
  side: JournalEntryInput['side'];
  amount: number;
  coaId: string;
  projectId?: string | null;
};

export function resolveEntryDescription(p: {
  lineDescription: string;
  journalDescription: string;
  journalTitle: string;
}): string {
  const line = p.lineDescription.trim();
  if (line) return line;
  const journalDesc = p.journalDescription.trim();
  if (journalDesc) return journalDesc;
  return p.journalTitle.trim();
}

export function mapJournalLinesToEntryInput(p: {
  lines: JournalEntryPayloadLine[];
  journalDescription: string;
  journalTitle: string;
}): JournalEntryInput[] {
  return p.lines.map((line) => ({
    description: resolveEntryDescription({
      lineDescription: line.description,
      journalDescription: p.journalDescription,
      journalTitle: p.journalTitle,
    }),
    side: line.side,
    amount: line.amount,
    coaId: line.coaId,
    projectId: line.projectId,
  }));
}
