import { z } from 'zod';

import { createAuditWriter } from '../audit/index.js';

export const RECURRING_TEMPLATE_AUDIT_SCHEMA_VERSION = '1.0.0';

const recurringTemplateEntrySnapshotV1 = z.object({
  lineNumber: z.number().int().positive(),
  description: z.string(),
  side: z.enum(['debit', 'credit']),
  amount: z.number(),
  coaId: z.uuid(),
});

const recurringTemplateSnapshotV1 = z.object({
  description: z.string(),
  title: z.string().nullable(),
  note: z.string().nullable(),
  status: z.enum(['draft', 'active', 'paused', 'closed']),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  startDateYMD: z.string(),
  endDateYMD: z.string().nullable(),
  nextRunDateYMD: z.string().nullable(),
  autoPost: z.boolean(),
  autoReversalDays: z.number().int().positive().nullable(),
  currencyId: z.uuid(),
  contactId: z.uuid().nullable(),
  entries: z.array(recurringTemplateEntrySnapshotV1).min(2),
});

export type RecurringTemplateSnapshot = z.infer<
  typeof recurringTemplateSnapshotV1
>;

export const recurringTemplateCreatePayloadV1 = z.object({
  template: recurringTemplateSnapshotV1,
});

export const recurringTemplateUpdatePayloadV1 = z.object({
  previous: recurringTemplateSnapshotV1,
  next: recurringTemplateSnapshotV1,
});

export const recurringTemplateStatusPayloadV1 = z.object({
  previousStatus: z.enum(['draft', 'active', 'paused', 'closed']),
  nextStatus: z.enum(['draft', 'active', 'paused', 'closed']),
  previousNextRunDateYMD: z.string().nullable(),
  nextRunDateYMD: z.string().nullable(),
});

export const recurringTemplateDeletePayloadV1 = z.object({
  previousStatus: z.literal('draft'),
  generatedJournalCount: z.literal(0),
  title: z.string().nullable(),
  description: z.string(),
});

export const writeRecurringTemplateCreateAudit = createAuditWriter({
  entityType: 'recurring_journal_template',
  action: 'recurring_journal_template.create',
  schemaVersion: RECURRING_TEMPLATE_AUDIT_SCHEMA_VERSION,
  payloadSchema: recurringTemplateCreatePayloadV1,
});

export const writeRecurringTemplateUpdateAudit = createAuditWriter({
  entityType: 'recurring_journal_template',
  action: 'recurring_journal_template.update',
  schemaVersion: RECURRING_TEMPLATE_AUDIT_SCHEMA_VERSION,
  payloadSchema: recurringTemplateUpdatePayloadV1,
});

export const writeRecurringTemplateStatusAudit = createAuditWriter({
  entityType: 'recurring_journal_template',
  action: 'recurring_journal_template.status',
  schemaVersion: RECURRING_TEMPLATE_AUDIT_SCHEMA_VERSION,
  payloadSchema: recurringTemplateStatusPayloadV1,
});

export const writeRecurringTemplateDeleteAudit = createAuditWriter({
  entityType: 'recurring_journal_template',
  action: 'recurring_journal_template.delete',
  schemaVersion: RECURRING_TEMPLATE_AUDIT_SCHEMA_VERSION,
  payloadSchema: recurringTemplateDeletePayloadV1,
});
