import type { ApiResponse } from '@/shared/types/core';
import type {
  BatchOperationResult,
  CreateJournalResponse,
  GetJournalResponse,
  GetRecurringTemplateResponse,
  JournalBatchInput,
  JournalListCursorResponse,
  ListJournalsCursorQuery,
  PeriodStatusResponse,
  PreviewRecurringTemplateResponse,
  RecurrenceFrequency,
  RecurringTemplateStatus,
  RunRecurringTemplateNowResponse,
  UpdateRecurringTemplateStatusResponse,
} from '@accountable-books/contracts/schema';
import api from '@/lib/axios';

// =============================================================================
// API Input Types
// =============================================================================

export type FetchJournalsCursorInput = {
  companyId: string;
} & ListJournalsCursorQuery;

export type GetJournalInput = {
  companyId: string;
  journalId: string;
  includeLedgerTotals?: boolean;
  includeFiles?: boolean;
  includeDeleted?: boolean;
};

export type CreateJournalInput = {
  companyId: string;
  data: JournalBatchInput;
};

export type UpdateJournalInput = {
  companyId: string;
  journalId: string;
  data: JournalBatchInput;
};

export type PostJournalInput = {
  companyId: string;
  journalId: string;
};

export type VoidJournalInput = {
  companyId: string;
  journalId: string;
  voidReason?: string;
};

export type ReverseJournalInput = {
  companyId: string;
  journalId: string;
  reversalReason?: string;
  reversalDate?: string;
};

export type CopyJournalInput = {
  companyId: string;
  journalId: string;
  includeFiles?: boolean;
};

export type BatchPostJournalsInput = {
  companyId: string;
  journalIds: string[];
  mode?: 'partial' | 'all_or_nothing';
};

export type BatchVoidJournalsInput = {
  companyId: string;
  journalIds: string[];
  voidReason?: string | null;
  mode?: 'partial' | 'all_or_nothing';
};

export type GetPeriodStatusInput = {
  companyId: string;
  date: string;
};

export type GetRecurringTemplateInput = {
  companyId: string;
  templateId: string;
};

export type UpdateRecurringTemplateStatusInput = {
  companyId: string;
  templateId: string;
  status: RecurringTemplateStatus;
};

export type RunRecurringTemplateNowInput = {
  companyId: string;
  templateId: string;
};

export type PreviewRecurringTemplateInput = {
  companyId: string;
  startDateYMD: string;
  frequency: RecurrenceFrequency;
  title?: string | null;
  note?: string | null;
  previewForYMD?: string | null;
  entries?: Array<{
    description: string;
    side: 'debit' | 'credit';
    amount: number;
    coaId: string;
  }>;
};

export type CreateRecurringTemplateInput = {
  companyId: string;
  data: {
    description: string;
    title?: string | null;
    note?: string | null;
    contactId?: string | null;
    currencyId?: string | null;
    frequency: RecurrenceFrequency;
    startDateYMD: string;
    endDateYMD?: string | null;
    autoPost?: boolean;
    entries: Array<{
      description: string;
      side: 'debit' | 'credit';
      amount: number;
      coaId: string;
    }>;
  };
};

export type UpdateRecurringTemplateInput = {
  companyId: string;
  templateId: string;
  data: CreateRecurringTemplateInput['data'];
};

// =============================================================================
// API Functions
// =============================================================================

/**
 * Fetch journals with cursor-based pagination (infinite list)
 */
export async function fetchJournalsByCursor(
  input: FetchJournalsCursorInput,
): Promise<ApiResponse<JournalListCursorResponse>> {
  const { companyId, ...queryData } = input;
  const res = await api.post(
    `/api/${companyId}/journals/query/cursor`,
    queryData,
  );
  return res.data;
}

/**
 * Get a single journal by ID
 */
export async function getJournal(
  input: GetJournalInput,
): Promise<ApiResponse<GetJournalResponse>> {
  const {
    companyId,
    journalId,
    includeLedgerTotals,
    includeFiles,
    includeDeleted,
  } = input;

  const params = new URLSearchParams();
  if (includeLedgerTotals !== undefined) {
    params.append('includeLedgerTotals', String(includeLedgerTotals));
  }
  if (includeFiles !== undefined) {
    params.append('includeFiles', String(includeFiles));
  }
  if (includeDeleted !== undefined) {
    params.append('includeDeleted', String(includeDeleted));
  }

  const queryString = params.toString();
  const url = `/api/${companyId}/journals/${journalId}${
    queryString ? '?' + queryString : ''
  }`;

  const res = await api.get(url);
  return res.data;
}

/**
 * Create a new journal
 */
export async function createJournal(
  input: CreateJournalInput,
): Promise<ApiResponse<CreateJournalResponse>> {
  const { companyId, data } = input;
  const res = await api.post(`/api/${companyId}/journals`, data);
  return res.data;
}

/**
 * Update a draft journal
 */
export async function updateJournal(
  input: UpdateJournalInput,
): Promise<ApiResponse<GetJournalResponse>> {
  const { companyId, journalId, data } = input;
  const res = await api.put(`/api/${companyId}/journals/${journalId}`, data);
  return res.data;
}

/**
 * Post a draft journal (change status from draft to posted)
 */
export async function postJournal(
  input: PostJournalInput,
): Promise<ApiResponse<GetJournalResponse>> {
  const { companyId, journalId } = input;
  const res = await api.patch(`/api/${companyId}/journals/${journalId}/post`);
  return res.data;
}

/**
 * Void a journal
 */
export async function voidJournal(
  input: VoidJournalInput,
): Promise<ApiResponse<GetJournalResponse>> {
  const { companyId, journalId, voidReason } = input;
  const res = await api.patch(`/api/${companyId}/journals/${journalId}/void`, {
    voidReason,
  });
  return res.data;
}

/**
 * Reverse a posted journal (creates a new reversing journal)
 */
export async function reverseJournal(
  input: ReverseJournalInput,
): Promise<ApiResponse<GetJournalResponse>> {
  const { companyId, journalId, reversalReason, reversalDate } = input;
  const res = await api.patch(
    `/api/${companyId}/journals/${journalId}/reverse`,
    {
      reversalReason,
      reversalDate,
    },
  );
  return res.data;
}

/**
 * Copy a journal (creates a new draft journal based on the source)
 */
export async function copyJournal(
  input: CopyJournalInput,
): Promise<ApiResponse<CreateJournalResponse>> {
  const { companyId, journalId, includeFiles } = input;
  const res = await api.post(`/api/${companyId}/journals/${journalId}/copy`, {
    includeFiles: includeFiles ?? false,
  });
  return res.data;
}

/**
 * Batch post multiple draft journals
 */
export async function postJournalsBatch(
  input: BatchPostJournalsInput,
): Promise<ApiResponse<BatchOperationResult>> {
  const { companyId, journalIds, mode = 'partial' } = input;
  const res = await api.patch(`/api/${companyId}/journals/batch/post`, {
    journalIds,
    mode,
  });
  return res.data;
}

/**
 * Batch void multiple journals
 */
export async function voidJournalsBatch(
  input: BatchVoidJournalsInput,
): Promise<ApiResponse<BatchOperationResult>> {
  const { companyId, journalIds, voidReason, mode = 'partial' } = input;
  const res = await api.patch(`/api/${companyId}/journals/batch/void`, {
    journalIds,
    voidReason,
    mode,
  });
  return res.data;
}

/**
 * Get fiscal period status for a specific date
 */
export async function getPeriodStatus(
  input: GetPeriodStatusInput,
): Promise<ApiResponse<PeriodStatusResponse>> {
  const { companyId, date } = input;
  const params = new URLSearchParams({ date });
  const res = await api.get(
    `/api/${companyId}/journals/period-status?${params.toString()}`,
  );
  return res.data;
}

/**
 * Get a recurring journal template by ID
 */
export async function getRecurringTemplate(
  input: GetRecurringTemplateInput,
): Promise<ApiResponse<GetRecurringTemplateResponse>> {
  const { companyId, templateId } = input;
  const res = await api.get(
    `/api/${companyId}/journals/templates/${templateId}`,
  );
  return res.data;
}

export async function updateRecurringTemplateStatus(
  input: UpdateRecurringTemplateStatusInput,
): Promise<ApiResponse<UpdateRecurringTemplateStatusResponse>> {
  const { companyId, templateId, status } = input;
  const res = await api.patch(
    `/api/${companyId}/journals/templates/${templateId}/status`,
    { status },
  );
  return res.data;
}

export async function runRecurringTemplateNow(
  input: RunRecurringTemplateNowInput,
): Promise<ApiResponse<RunRecurringTemplateNowResponse>> {
  const { companyId, templateId } = input;
  const res = await api.post(
    `/api/${companyId}/journals/templates/${templateId}/run`,
  );
  return res.data;
}

export async function previewRecurringTemplate(
  input: PreviewRecurringTemplateInput,
): Promise<ApiResponse<PreviewRecurringTemplateResponse>> {
  const { companyId, ...data } = input;
  const res = await api.post(
    `/api/${companyId}/journals/templates/preview`,
    data,
  );
  return res.data;
}

/**
 * Create a recurring journal template
 */
export async function createRecurringTemplate(
  input: CreateRecurringTemplateInput,
): Promise<ApiResponse<GetRecurringTemplateResponse>> {
  const { companyId, data } = input;
  const res = await api.post(`/api/${companyId}/journals/templates`, data);
  return res.data;
}

/**
 * Update a recurring journal template
 */
export async function updateRecurringTemplate(
  input: UpdateRecurringTemplateInput,
): Promise<ApiResponse<GetRecurringTemplateResponse>> {
  const { companyId, templateId, data } = input;
  const res = await api.put(
    `/api/${companyId}/journals/templates/${templateId}`,
    data,
  );
  return res.data;
}
