import { txnFileBase } from '@accountable-books/contracts/schema';
import { z } from 'zod';

import {
  dbStandardFields,
  debitCredit,
  zDateYMD,
} from '../../core/types/core.js';
import { createCamelCaseSchema } from '../../shared/utils/formatting.utils.js';

import type { SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';

export const journalEntryInput = z.object({
  description: z.string(),
  side: debitCredit,
  amount: z.number(),
  coa_id: z.uuid(),
  project_id: z.uuid().nullish(),
});
export type JournalEntriesBase = z.infer<typeof journalEntryInput>;

const newJournalEntry = z.object({
  ...journalEntryInput.shape,
  ...dbStandardFields.shape,
  journal_batch_id: z.uuid(),
  ledger_entry_id: z.uuid().nullish(),
  ledger_entry_fs_date: zDateYMD.nullish(),
});
export type NewJournalEntry = z.infer<typeof newJournalEntry>;

export const journalEntry = z.object({
  ...newJournalEntry.shape,
  id: z.uuid(),
});
export type JournalEntry = z.infer<typeof journalEntry>;

const journalBatchStatus = z.enum(['draft', 'posted', 'voided']);
export type JournalBatchStatus = z.infer<typeof journalBatchStatus>;

const baseJournalBatch = z.object({
  id: z.uuid().optional(),
  reference: z.string().nullish(),

  date: z.iso.date(),

  title: z.string().min(1).max(512),
  description: z.string().max(2048).optional(),

  contact_id: z.uuid().nullish(),

  currency_id: z.uuid().nullish(),
  exchange_rate: z.number().positive().nullish(),

  status: journalBatchStatus.optional(),

  ledger_transaction_id: z.uuid().nullish(),
  company_id: z.uuid().nullish(),

  auto_reversal_date: z.date().nullish(),

  is_recurring: z.boolean().nullish(),
  recurring_template_id: z.uuid().nullish(),

  created_by_id: z.uuid().nullish(),
  updated_by_id: z.uuid().nullish(),
  reversed_by_id: z.uuid().nullish(),
  reversed_at: z.iso.date().nullish(),

  reversal_journal_id: z.uuid().nullish(),
  original_journal_id: z.uuid().nullish(),

  voided_at: z.iso.date().nullish(),

  note: z.string().max(2048).nullish(),

  metadata: z.record(z.string(), z.unknown()).optional(),
});

const journalBatchData = z.object({
  ...baseJournalBatch.shape,
  status: journalBatchStatus.exclude(['voided']),
  entries: z.array(journalEntryInput).min(2),
  files: z.array(txnFileBase).optional(),
});

export const journalBatchDataCamel = createCamelCaseSchema(journalBatchData);
export type JournalBatchData = SnakeToCamelCaseObject<
  z.infer<typeof journalBatchData>
>;

const newJournalBatch = z.object({
  ...baseJournalBatch.shape,
  ...dbStandardFields.shape,
  sequence_month: z.iso.date().nullable(), // Always first of month
  sequence_number: z.number().positive().nullable(),
  company_id: z.uuid(),
  currency_id: z.uuid(), // Reporting currency for now
  exchange_rate: z.number().positive().default(1).optional(),
  created_by_id: z.uuid(),
});
export type NewJournalBatch = z.infer<typeof newJournalBatch>;

export const journalBatch = z.object({
  ...newJournalBatch.shape,
  id: z.uuid(),
});
export type JournalBatch = z.infer<typeof journalBatch>;

// List Journals Query
export const listJournalsFilters = z
  .object({
    companyId: z.uuid().optional(), // required (or remove and inject from auth context)

    status: journalBatchStatus.optional(),

    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),

    searchQuery: z.string().trim().min(1).max(200).optional(),

    isRecurring: z.coerce.boolean().optional(),
    contactId: z.uuid().optional(),
    currencyId: z.uuid().optional(),

    includeDeleted: z.coerce.boolean().default(false),

    sortBy: z.enum(['created_at', 'date', 'reference']).default('created_at'),

    sortDir: z.enum(['asc', 'desc']).default('desc'),
  })
  .superRefine((v, ctx) => {
    if (v.dateFrom && v.dateTo && v.dateFrom > v.dateTo) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFrom'],
        message: 'dateFrom must be <= dateTo',
      });
    }
  });

export type ListJournalsFilters = z.infer<typeof listJournalsFilters>;

export const listJournalsPageQuery = listJournalsFilters.extend({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
export type ListJournalsPageQuery = z.infer<typeof listJournalsPageQuery>;

export const listJournalsCursorQuery = listJournalsFilters.extend({
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().min(1),
});

export type ListJournalsCursorQuery = z.infer<typeof listJournalsCursorQuery>;
export type JournalListRow = {
  id: string;
  companyId: string;
  reference: string | null;
  sequenceMonth: string | null;
  sequenceNumber: number | null;
  date: string;
  title: string;
  description: string | null;
  status: string;
  note: string | null;

  // Contact details
  contactId: string | null;
  contactName: string | null;

  // Currency details
  currencyId: string;
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
  exchangeRate: string;

  ledgerTransactionId: string | null;
  isRecurring: boolean;
  recurringTemplateId: string | null;
  autoReversalDate: string | null;
  reversalJournalId: string | null;
  originalJournalId: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  reversedById: string | null;
  voidedAt: string | null;
  metadata: unknown | null;
  createdAt: string;
  createdById: string;
  updatedAt: string;
  updatedById: string | null;
  isDeleted: boolean;
  deletedAt: string | null;

  // Computed totals
  totalDebit: string;
  totalCredit: string;
};

export type JournalListPageResponse = {
  journals: JournalListRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

/**
 * Cursor payload (opaque to clients)
 * - value: last row's primary sort value
 * - id: last row's id (tie-breaker)
 * - sortBy/sortDir: prevents misuse of cursor across different sorts
 * - v: cursor version for future compatibility
 */
export const journalsCursor = z.object({
  v: z.literal(1),
  sortBy: z.enum(['created_at', 'date', 'reference']),
  sortDir: z.enum(['asc', 'desc']),
  value: z.string().min(1),
  id: z.uuid(),
});
export type JournalsCursor = z.infer<typeof journalsCursor>;

export type JournalListCursorResponse = {
  journals: JournalListRow[];
  nextCursor: string | null;
  hasMore: boolean;
};

// Get single journal detail types
export type JournalDetailEntry = {
  id: string;
  description: string;
  side: 'debit' | 'credit';
  amount: number;
  coaId: string;
  coaCode: string;
  coaName: string;
  projectId: string | null;
  projectName: string | null;
  ledgerEntryId: string | null;
  ledgerEntryFsDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RelatedJournalSummary = {
  id: string;
  reference: string | null;
  date: string;
  title: string;
};

export type LedgerTotals = {
  totalDebit: number;
  totalCredit: number;
};

export type GetJournalResponse = {
  journal: JournalListRow;
  entries: JournalDetailEntry[];
  ledgerTotals?: LedgerTotals | null;
  relatedJournals: {
    reversalJournal?: RelatedJournalSummary | null;
    originalJournal?: RelatedJournalSummary | null;
  };
};

export const genJournalRefInput = z.object({
  companyId: z.uuid(),
  journalDate: z.union([z.string(), z.iso.date()]),
});

export type GenJournalReferenceInput = z.infer<typeof genJournalRefInput>;

export type GenJournalReferenceResult = {
  sequenceMonth: string; // "YYYY-MM-01"
  sequenceNumber: number; // 1..N
  reference: string; // "JE-YYYYMM-NNNN"
};
