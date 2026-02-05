import { z } from 'zod';

import { debitCredit, zDateYMD } from '../../core/types/core.js';
import { createCamelCaseSchema } from '../../shared/utils/formatting.utils.js';

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

const amountSchema = z.number().refine(
  (n) => {
    const parts = n.toString().split('.');
    return parts.length === 1 || parts[1].length <= 2;
  },
  { message: 'Amount cannot have more than 2 decimal places' },
);

export const recurringTemplateEntryInput = z.object({
  description: z.string().min(1).max(512),
  side: debitCredit,
  amount: amountSchema,
  coa_id: z.uuid(),
});

export type RecurringTemplateEntryInput = z.infer<
  typeof recurringTemplateEntryInput
>;

const recurringTemplateBase = z
  .object({
    description: z.string().min(1).max(512),
    title: z.string().max(512).nullish(),
    note: z.string().max(1000).nullish(),
    contact_id: z.uuid().nullish(),
    currency_id: z.uuid().nullish(),
    frequency: recurrenceFrequency,
    start_date_ymd: zDateYMD,
    end_date_ymd: zDateYMD.nullish(),
    auto_post: z.boolean().default(false),
    auto_reversal_days: z.number().int().min(1).nullish(),
    entries: z.array(recurringTemplateEntryInput).min(2),
  })
  .superRefine((val, ctx) => {
    if (val.end_date_ymd && val.start_date_ymd > val.end_date_ymd) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date_ymd'],
        message: 'endDateYMD must be >= startDateYMD',
      });
    }
  });

export const recurringTemplateInput = createCamelCaseSchema(
  recurringTemplateBase,
);
export type RecurringTemplateInput = z.infer<typeof recurringTemplateInput>;

export const recurringTemplateUpdateInput = createCamelCaseSchema(
  recurringTemplateBase,
);
export type RecurringTemplateUpdateInput = z.infer<
  typeof recurringTemplateUpdateInput
>;

export const recurringTemplateStatusInput = z.object({
  status: recurringTemplateStatus,
});
export type RecurringTemplateStatusInput = z.infer<
  typeof recurringTemplateStatusInput
>;

const recurringTemplatePreviewBase = z.object({
  start_date_ymd: zDateYMD,
  frequency: recurrenceFrequency,
  title: z.string().max(512).nullish(),
  note: z.string().max(1000).nullish(),
  entries: z.array(recurringTemplateEntryInput).min(1).optional(),
  preview_for_ymd: zDateYMD.nullish(),
});

export const recurringTemplatePreviewInput = createCamelCaseSchema(
  recurringTemplatePreviewBase,
);
export type RecurringTemplatePreviewInput = z.infer<
  typeof recurringTemplatePreviewInput
>;

export const listRecurringTemplatesQuery = z.object({
  status: recurringTemplateStatus.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export type ListRecurringTemplatesQuery = z.infer<
  typeof listRecurringTemplatesQuery
>;
