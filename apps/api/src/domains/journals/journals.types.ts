import {
  journalBatchStatus,
  listJournalsCursorQuery as listJournalsCursorQueryContract,
  txnFileBase,
} from '@accountable-books/contracts/schema';
import { z } from 'zod';

import {
  dbStandardFields,
  debitCredit,
  zDateYMD,
} from '../../core/types/core.js';
import { createCamelCaseSchemaWithExclusions } from '../../shared/utils/formatting.utils.js';

import type { SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';
import type {
  GetJournalResponse as ContractGetJournalResponse,
  JournalBatchStatus as ContractJournalBatchStatus,
  JournalDetailEntry as ContractJournalDetailEntry,
  JournalListCursorResponse as ContractJournalListCursorResponse,
  JournalListJournalRow as ContractJournalListJournalRow,
  JournalListRow as ContractJournalListRow,
  JournalTransactionFile as ContractJournalTransactionFile,
  LedgerTotals as ContractLedgerTotals,
  RelatedJournalSummary as ContractRelatedJournalSummary,
} from '@accountable-books/contracts/schema';

export const journalEntryInput = z.object({
  description: z.string(),
  side: debitCredit,
  amount: z.number().refine(
    (n) => {
      const parts = n.toString().split('.');
      return parts.length === 1 || parts[1].length <= 2;
    },
    { message: 'Amount cannot have more than 2 decimal places' },
  ),
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

export type JournalBatchStatus = ContractJournalBatchStatus;

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

  auto_reversal_date: z.iso.date().nullish(),

  is_recurring: z.boolean().nullish(),
  recurring_template_id: z.uuid().nullish(),

  created_by_id: z.uuid().nullish(),
  updated_by_id: z.uuid().nullish(),
  reversed_by_id: z.uuid().nullish(),
  reversed_at: z.iso.date().nullish(),
  reversal_reason: z.string().max(2048).nullish(),

  reversal_journal_id: z.uuid().nullish(),
  original_journal_id: z.uuid().nullish(),

  voided_at: z.iso.date().nullish(),

  note: z.string().max(2048).nullish(),

  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type BaseJournalBatch = z.infer<typeof baseJournalBatch>;

const journalBatchData = z.object({
  ...baseJournalBatch.shape,
  status: journalBatchStatus.exclude(['voided']),
  entries: z.array(journalEntryInput).min(2),
  files: z.array(txnFileBase).optional(),
});

export const journalBatchDataCamel = createCamelCaseSchemaWithExclusions(
  journalBatchData,
  { excludeKeys: ['metadata'] },
);
export type JournalBatchData = SnakeToCamelCaseObject<
  z.infer<typeof journalBatchData>
>;

// Update Draft Journal Input (draft only)
const updateDraftJournalData = z.object({
  ...journalBatchData.shape,
  status: journalBatchStatus.extract(['draft']),
});

export const updateDraftJournalDataCamel = createCamelCaseSchemaWithExclusions(
  updateDraftJournalData,
  { excludeKeys: ['metadata'] },
);
export type UpdateDraftJournalData = SnakeToCamelCaseObject<
  z.infer<typeof updateDraftJournalData>
>;

export const postDraftJournalsBatchBody = z.object({
  journalIds: z.array(z.uuid()).min(1).max(200),
  mode: z.enum(['partial', 'all_or_nothing']).default('partial'),
});
export type PostDraftJournalsBatchBody = z.infer<
  typeof postDraftJournalsBatchBody
>;

export const voidDraftJournalsBatchBody = z.object({
  journalIds: z.array(z.uuid()).min(1).max(200),
  voidReason: z.string().min(1).max(2048).nullable().optional(),
  mode: z.enum(['partial', 'all_or_nothing']).default('partial'),
});
export type VoidDraftJournalsBatchBody = z.infer<
  typeof voidDraftJournalsBatchBody
>;

export const copyJournalBody = z.object({
  includeFiles: z.coerce.boolean().optional().default(false),
});
export type CopyJournalBody = z.infer<typeof copyJournalBody>;

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
    ...listJournalsCursorQueryContract.omit({ limit: true, cursor: true }).shape,
    includeDeleted: z.coerce.boolean().default(false),
    sortBy: z.enum(['created_at', 'date', 'reference']).default('date'),
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
  cursor: z.string().min(1).optional(),
});

export type ListJournalsCursorQuery = z.infer<typeof listJournalsCursorQuery>;
export type JournalListRow = ContractJournalListRow;
export type JournalListJournalRow = ContractJournalListJournalRow;

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
export type JournalListCursorResponse = ContractJournalListCursorResponse;
export type JournalDetailEntry = ContractJournalDetailEntry;
export type RelatedJournalSummary = ContractRelatedJournalSummary;
export type LedgerTotals = ContractLedgerTotals;
export type JournalTransactionFile = ContractJournalTransactionFile;
export type GetJournalResponse = ContractGetJournalResponse;

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

// =============================================================================
// CSV Import (Preflight + Import)
// =============================================================================

const csvString = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? undefined : t;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return v;
}, z.string().optional());

const csvMoney = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return undefined;
    const cleaned = t.replace(/,/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : v;
  }
  return v;
}, z.number().optional());

/**
 * Flat rows matching locked CSV headers.
 * We intentionally keep everything optional at the schema level so the backend
 * can return row-level errors in preflight instead of rejecting the request.
 */
export const journalImportCsvLine = z.object({
  date: csvString,
  title: csvString,
  journal_reference: csvString,
  description: csvString,
  note: csvString,
  currency_code: csvString,
  auto_reversal_date: csvString,
  line_description: csvString,
  account_code: csvString,
  account_name: csvString,
  project_code: csvString,
  project_name: csvString,
  debit: csvMoney,
  credit: csvMoney,
});
export type JournalImportCsvLine = z.infer<typeof journalImportCsvLine>;

export const journalImportPreflightBody = z.object({
  lines: z.array(journalImportCsvLine).max(5000),
  overrides: z
    .object({
      accounts: z
        .array(z.object({ key: z.string().min(1), coaId: z.uuid() }))
        .optional(),
      projects: z
        .array(z.object({ key: z.string().min(1), projectId: z.uuid() }))
        .optional(),
      journals: z
        .array(
          z.object({
            importKey: z.string().min(1),
            contactId: z.uuid().nullish(),
          }),
        )
        .optional(),
    })
    .optional(),
});
export type JournalImportPreflightBody = z.infer<
  typeof journalImportPreflightBody
>;

export const journalImportAction = z.enum(['draft', 'posted']);
export type JournalImportAction = z.infer<typeof journalImportAction>;

const journalImportDataSnake = z
  .object({
    reference: z.string().nullish(),
    date: z.iso.date(),
    title: z.string().min(1).max(512),
    description: z.string().max(2048).optional(),
    note: z.string().max(2048).optional(),

    contact_id: z.uuid().nullish(),
    currency_id: z.uuid().nullish(),
    exchange_rate: z.number().positive().nullish(),
    auto_reversal_date: z.iso.date().nullish(),

    metadata: z.record(z.string(), z.unknown()).optional(),

    entries: z.array(journalEntryInput).min(2),
  })
  .strict();

export const journalImportDataCamel = createCamelCaseSchemaWithExclusions(
  journalImportDataSnake,
  { excludeKeys: ['metadata'] },
);
export type JournalImportData = SnakeToCamelCaseObject<
  z.infer<typeof journalImportDataSnake>
>;

export const journalImportBody = z.object({
  mode: z.enum(['partial', 'all_or_nothing']).default('partial'),
  journals: z.array(
    z.object({
      importKey: z.string().min(1).max(200),
      action: journalImportAction,
      data: journalImportDataCamel,
    }),
  ),
});

export type JournalImportBody = z.infer<typeof journalImportBody>;
