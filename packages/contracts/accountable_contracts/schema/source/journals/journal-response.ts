import type { DebitCredit } from '../common/enums.js';
import type { JournalBatchStatus } from './journal-batch.js';
import type {
  RecurrenceFrequency,
  RecurringTemplateStatus,
} from './recurring-journal.js';

// =============================================================================
// Journal Classification & Recurring Types
// =============================================================================

export type JournalListKind = 'journal' | 'recurring_template';

export type JournalBatchSource = 'one_off' | 'generated_from_template';

export type JournalRecurringTemplateInfo = {
  templateId: string;
  frequency: RecurrenceFrequency;
  nextRunDate: string | null;
  autoPost: boolean;
  templateStatus: RecurringTemplateStatus;
};

export type JournalGeneratedFromInfo = {
  templateId: string;
  generatedAt: string | null;
  scheduledForDate: string | null;
};

// =============================================================================
// List Response Types
// =============================================================================

export type JournalListRowBase = {
  id: string;
  companyId: string;
  date: string;
  title: string;
  description: string | null;
  note: string | null;
  contactId: string | null;
  contactName: string | null;
  currencyId: string;
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
  exchangeRate: string;
  metadata: unknown | null;
  createdAt: string;
  createdById: string;
  updatedAt: string;
  updatedById: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  totalDebit: string;
  totalCredit: string;
  entriesCount: number;
};

export type JournalListJournalRow = JournalListRowBase & {
  kind: 'journal';
  journalSource: JournalBatchSource;
  status: JournalBatchStatus;
  reference: string | null;
  sequenceMonth: string | null;
  sequenceNumber: number | null;
  ledgerTransactionId: string | null;
  autoReversalDate: string | null;
  reversalJournalId: string | null;
  originalJournalId: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  reversedById: string | null;
  voidedAt: string | null;
  generatedFromTemplateId: string | null;
  generatedAt: string | null;
  generatedScheduledForDate: string | null;
};

export type JournalListRecurringTemplateRow = JournalListRowBase & {
  kind: 'recurring_template';
  templateId: string;
  templateStatus: RecurringTemplateStatus;
  frequency: RecurrenceFrequency;
  nextRunDate: string | null;
  autoPost: boolean;
  reference: null;
  sequenceMonth: null;
  sequenceNumber: null;
  ledgerTransactionId: null;
  autoReversalDate: null;
  reversalJournalId: null;
  originalJournalId: null;
  reversedAt: null;
  reversalReason: null;
  reversedById: null;
  voidedAt: null;
};

export type JournalListRow =
  | JournalListJournalRow
  | JournalListRecurringTemplateRow;

export type JournalListCursorResponse = {
  rows: JournalListRow[];
  nextCursor: string | null;
  hasMore: boolean;
  facets: {
    allCount: number;
    journalStatusCounts: {
      draft: number;
      posted: number;
      voided: number;
    };
    kindCounts: {
      journals: number;
      recurringTemplates: number;
    };
    journalSourceCounts: {
      oneOff: number;
      generatedFromTemplate: number;
    };
    recurringTemplateStatusCounts: {
      draft: number;
      active: number;
      paused: number;
      closed: number;
    };
  };
  appliedFilters: {
    dateFrom: string | null;
    dateTo: string | null;
    kinds: JournalListKind[] | null;
    journalStatuses: JournalBatchStatus[] | null;
    templateStatuses: RecurringTemplateStatus[] | null;
    journalSources: JournalBatchSource[] | null;
  };
};

// =============================================================================
// Detail Response Types
// =============================================================================

export type JournalDetailEntry = {
  id: string;
  description: string;
  side: DebitCredit;
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

export type JournalTransactionFile = {
  id: string;
  name: string;
  key: string;
  url: string;
  type: string;
  bucket_name: string;
  size_bytes: string;
  checksum: string | null;
  provider: string | null;
  region: string | null;
  endpoint: string | null;
  transaction_id: string;
  entry_id: string | null;
};

export type GetJournalResponse = {
  journal: JournalListJournalRow;
  entries: JournalDetailEntry[];
  files?: JournalTransactionFile[];
  ledgerTotals?: LedgerTotals | null;
  relatedJournals: {
    reversalJournal?: RelatedJournalSummary | null;
    originalJournal?: RelatedJournalSummary | null;
  };
};

// =============================================================================
// Operation Response Types
// =============================================================================

export type BatchOperationResult = {
  success: string[];
  failed: Array<{ id: string; error: string }>;
};

export type CreateJournalResponse = {
  id: string;
  reference: string;
};
