import { z } from 'zod';

export const recurrenceFrequency = z.enum([
  'daily',
  'weekly',
  'monthly',
  'yearly',
]);
export type RecurrenceFrequency = z.infer<typeof recurrenceFrequency>;

export const recurringTemplateStatus = z.enum([
  'draft',
  'active',
  'paused',
  'closed',
]);
export type RecurringTemplateStatus = z.infer<typeof recurringTemplateStatus>;

// =============================================================================
// Recurring Template DTOs
// =============================================================================

export type RecurringTemplateDetailEntry = {
  id: string;
  description: string;
  side: 'debit' | 'credit';
  amount: number;
  coaId: string;
  coaCode?: string | null;
  coaName?: string | null;
  templateId: string;
};

export type RecurringTemplateDetail = {
  id: string;
  description: string;
  title: string | null;
  note: string | null;
  status: RecurringTemplateStatus;
  companyId: string;
  autoPost: boolean;
  templateTimezone: string;
  frequency: RecurrenceFrequency;
  startDateYMD: string | null;
  endDateYMD: string | null;
  nextRunDateYMD: string | null;
  placeholderVars: unknown | null;
  currencyId: string | null;
  currencyCode?: string | null;
  currencyName?: string | null;
  currencySymbol?: string | null;
  contactId: string | null;
  contactName?: string | null;
  autoReversalDays: number | null;
  lastRunAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
};

export type GetRecurringTemplateResponse = {
  template: RecurringTemplateDetail;
  entries: RecurringTemplateDetailEntry[];
};

export type UpdateRecurringTemplateStatusResponse = {
  template: RecurringTemplateDetail;
};

export type RunRecurringTemplateNowResponse = {
  template: RecurringTemplateDetail;
  journalId?: string;
};

export type PreviewRecurringTemplateResponse = {
  runDateYMD: string;
  rendered: {
    title: string | null;
    note: string | null;
    entries: Array<{
      description: string;
      side: 'debit' | 'credit';
      amount: number;
      coaId: string;
    }>;
  };
};
