import type {
  GetJournalResponse,
  GetRecurringTemplateResponse,
  JournalListCursorResponse,
  ListJournalsCursorQuery,
  PeriodStatusResponse,
} from '@accountable-books/contracts/schema';
import type { QueryClient } from '@tanstack/react-query';
import { invalidateReporting } from '@/modules/accounting/reporting';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  copyJournal,
  createJournal,
  createRecurringTemplate,
  deleteRecurringTemplate,
  fetchJournalsByCursor,
  getJournal,
  getPeriodStatus,
  getRecurringTemplate,
  postJournal,
  postJournalsBatch,
  previewRecurringTemplate,
  reverseJournal,
  runRecurringTemplateNow,
  updateJournal,
  updateRecurringTemplate,
  updateRecurringTemplateStatus,
  voidJournal,
  voidJournalsBatch,
} from '../api';

import type {
  BatchPostJournalsInput,
  BatchVoidJournalsInput,
  CopyJournalInput,
  CreateJournalInput,
  CreateRecurringTemplateInput,
  DeleteRecurringTemplateInput,
  GetJournalInput,
  GetRecurringTemplateInput,
  PostJournalInput,
  PreviewRecurringTemplateInput,
  ReverseJournalInput,
  RunRecurringTemplateNowInput,
  UpdateJournalInput,
  UpdateRecurringTemplateInput,
  UpdateRecurringTemplateStatusInput,
  VoidJournalInput,
} from '../api';

// =============================================================================
// Cache Configuration
// =============================================================================

const CACHE_TIMES = {
  STALE: 1000 * 60 * 30, // 30 minutes
  GC: 1000 * 60 * 60 * 3, // 3 hours
} as const;

const PERIOD_STATUS_CACHE_TIMES = {
  STALE: 1000 * 60 * 5, // 5 minutes
  GC: 1000 * 60 * 30, // 30 minutes
} as const;

// =============================================================================
// Query Key Helpers
// =============================================================================

type JournalsInfiniteQueryFilters = Omit<
  ListJournalsCursorQuery,
  'cursor' | 'limit'
>;

const getJournalsInfiniteKey = (
  companyId: string,
  filters: JournalsInfiniteQueryFilters,
  limit: number,
) => {
  const normalizedFilters = Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return ['journals', companyId, 'infinite', { ...normalizedFilters, limit }];
};

const getJournalKey = (
  companyId: string,
  journalId: string,
  options: Omit<GetJournalInput, 'companyId' | 'journalId'>,
) => {
  const normalizedOptions = Object.fromEntries(
    Object.entries(options)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return ['journals', companyId, journalId, normalizedOptions] as const;
};

const getRecurringTemplateKey = (companyId: string, templateId: string) =>
  ['journals', companyId, 'recurring-templates', templateId] as const;

// =============================================================================
// Utility Functions
// =============================================================================

export const invalidateJournals = (
  queryClient: QueryClient,
  companyId: string,
) => {
  queryClient.invalidateQueries({
    queryKey: ['journals', companyId],
    exact: false,
  });
};

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Infinite query for journal list with cursor-based pagination
 */
export function useJournalsInfinite(
  params: {
    companyId: string;
    limit?: number;
    enabled?: boolean;
  } & JournalsInfiniteQueryFilters,
) {
  const { companyId, limit = 50, enabled = true, ...filters } = params;

  return useInfiniteQuery<JournalListCursorResponse>({
    queryKey: getJournalsInfiniteKey(companyId, filters, limit),
    queryFn: async ({ pageParam }) => {
      const res = await fetchJournalsByCursor({
        companyId,
        limit,
        cursor: pageParam as string | undefined,
        ...filters,
      });
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Failed to fetch journals');
      }
      return res.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!companyId && enabled,
    staleTime: CACHE_TIMES.STALE,
    gcTime: CACHE_TIMES.GC,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Query for a single journal by ID
 */
export function useJournal(params: GetJournalInput & { enabled?: boolean }) {
  const { companyId, journalId, enabled = true, ...options } = params;

  return useQuery<GetJournalResponse>({
    queryKey: getJournalKey(companyId, journalId, options),
    queryFn: async () => {
      const res = await getJournal({ companyId, journalId, ...options });
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Failed to fetch journal');
      }
      return res.data;
    },
    enabled: !!companyId && !!journalId && enabled,
    staleTime: CACHE_TIMES.STALE,
    gcTime: CACHE_TIMES.GC,
  });
}

/**
 * Query for a recurring journal template by ID
 */
export function useRecurringTemplate(
  params: GetRecurringTemplateInput & { enabled?: boolean },
) {
  const { companyId, templateId, enabled = true } = params;

  return useQuery<GetRecurringTemplateResponse>({
    queryKey: getRecurringTemplateKey(companyId, templateId),
    queryFn: async () => {
      const res = await getRecurringTemplate({ companyId, templateId });
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Failed to fetch recurring template');
      }
      return res.data;
    },
    enabled: !!companyId && !!templateId && enabled,
    staleTime: CACHE_TIMES.STALE,
    gcTime: CACHE_TIMES.GC,
  });
}

export function useUpdateRecurringTemplateStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateRecurringTemplateStatusInput) =>
      updateRecurringTemplateStatus(input),
    onSuccess: (_, variables) => {
      invalidateJournals(queryClient, variables.companyId);
      queryClient.invalidateQueries({
        queryKey: getRecurringTemplateKey(
          variables.companyId,
          variables.templateId,
        ),
      });
    },
  });
}

export function useDeleteRecurringTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeleteRecurringTemplateInput) =>
      deleteRecurringTemplate(input),
    onSuccess: (_, variables) => {
      invalidateJournals(queryClient, variables.companyId);
      queryClient.invalidateQueries({
        queryKey: getRecurringTemplateKey(
          variables.companyId,
          variables.templateId,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: ['journals', variables.companyId, 'recurring-templates'],
      });
    },
  });
}

export function useRunRecurringTemplateNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RunRecurringTemplateNowInput) =>
      runRecurringTemplateNow(input),
    onSuccess: (_, variables) => {
      invalidateJournals(queryClient, variables.companyId);
      queryClient.invalidateQueries({
        queryKey: getRecurringTemplateKey(
          variables.companyId,
          variables.templateId,
        ),
      });
    },
  });
}

export function usePreviewRecurringTemplate() {
  return useMutation({
    mutationFn: (input: PreviewRecurringTemplateInput) =>
      previewRecurringTemplate(input),
  });
}

/**
 * Create a recurring journal template
 */
export function useCreateRecurringTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRecurringTemplateInput) =>
      createRecurringTemplate(input),
    onSuccess: (_, variables) => {
      invalidateJournals(queryClient, variables.companyId);
      queryClient.invalidateQueries({
        queryKey: ['journals', variables.companyId, 'recurring-templates'],
      });
    },
  });
}

export function useUpdateRecurringTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateRecurringTemplateInput) =>
      updateRecurringTemplate(input),
    onSuccess: (_, variables) => {
      invalidateJournals(queryClient, variables.companyId);
      queryClient.invalidateQueries({
        queryKey: getRecurringTemplateKey(
          variables.companyId,
          variables.templateId,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: ['journals', variables.companyId, 'recurring-templates'],
      });
    },
  });
}

/**
 * Query for fiscal period status for a specific date
 */
export function usePeriodStatus(params: { companyId: string; date: string }) {
  const { companyId, date } = params;

  return useQuery<PeriodStatusResponse>({
    queryKey: ['journals', companyId, 'period-status', date],
    queryFn: async () => {
      const res = await getPeriodStatus({ companyId, date });
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Failed to fetch period status');
      }
      return res.data;
    },
    enabled: !!companyId && !!date,
    staleTime: PERIOD_STATUS_CACHE_TIMES.STALE,
    gcTime: PERIOD_STATUS_CACHE_TIMES.GC,
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Create a new journal
 */
export function useCreateJournal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateJournalInput) => createJournal(input),
    onSuccess: (_, variables) => {
      invalidateJournals(queryClient, variables.companyId);
      invalidateReporting(queryClient, variables.companyId);
    },
  });
}

/**
 * Update a draft journal
 */
export function useUpdateJournal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateJournalInput) => updateJournal(input),
    onSuccess: (_, variables) => {
      invalidateJournals(queryClient, variables.companyId);
      invalidateReporting(queryClient, variables.companyId);
    },
  });
}

/**
 * Post a draft journal (change status from draft to posted)
 */
export function usePostJournal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PostJournalInput) => postJournal(input),
    onSuccess: (_, variables) => {
      invalidateJournals(queryClient, variables.companyId);
      invalidateReporting(queryClient, variables.companyId);
    },
  });
}

/**
 * Void a journal
 */
export function useVoidJournal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: VoidJournalInput) => voidJournal(input),
    onSuccess: (_, variables) => {
      invalidateJournals(queryClient, variables.companyId);
      invalidateReporting(queryClient, variables.companyId);
    },
  });
}

/**
 * Reverse a posted journal (creates a new reversing journal)
 */
export function useReverseJournal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReverseJournalInput) => reverseJournal(input),
    onSuccess: (_, variables) => {
      invalidateJournals(queryClient, variables.companyId);
      invalidateReporting(queryClient, variables.companyId);
    },
  });
}

/**
 * Copy a journal (creates a new draft journal based on the source)
 */
export function useCopyJournal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CopyJournalInput) => copyJournal(input),
    onSuccess: (_, variables) => {
      invalidateJournals(queryClient, variables.companyId);
      invalidateReporting(queryClient, variables.companyId);
    },
  });
}

/**
 * Batch post multiple draft journals
 */
export function usePostJournalsBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BatchPostJournalsInput) => postJournalsBatch(input),
    onSuccess: (_, variables) => {
      invalidateJournals(queryClient, variables.companyId);
      invalidateReporting(queryClient, variables.companyId);
    },
  });
}

/**
 * Batch void multiple journals
 */
export function useVoidJournalsBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BatchVoidJournalsInput) => voidJournalsBatch(input),
    onSuccess: (_, variables) => {
      invalidateJournals(queryClient, variables.companyId);
      invalidateReporting(queryClient, variables.companyId);
    },
  });
}
