import { z } from 'zod';

import { journalBatchStatus } from './journal-batch.js';
import { recurringTemplateStatus } from './recurring-journal.js';

// =============================================================================
// Query Schemas
// =============================================================================

export const journalListRowKind = z.enum(['journal', 'recurring_template']);
export type JournalListRowKindQuery = z.infer<typeof journalListRowKind>;

export const journalSource = z.enum(['one_off', 'generated_from_template']);
export type JournalSourceQuery = z.infer<typeof journalSource>;

export const listJournalsCursorQuery = z.object({
  journalStatuses: z.array(journalBatchStatus).min(1).optional(),
  templateStatuses: z.array(recurringTemplateStatus).min(1).optional(),
  journalSources: z.array(journalSource).min(1).optional(),
  kinds: z.array(journalListRowKind).min(1).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  searchQuery: z.string().optional(),
  contactId: z.string().optional(),
  currencyId: z.string().optional(),
  includeDeleted: z.boolean().optional(),
  sortBy: z.enum(['created_at', 'date', 'system_reference']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  limit: z.number().optional(),
  cursor: z.string().optional(),
});
export type ListJournalsCursorQuery = z.infer<typeof listJournalsCursorQuery>;
