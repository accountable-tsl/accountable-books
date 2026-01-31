import { z } from 'zod';

import { createAuditWriter } from '../audit/index.js';

// =============================================================================
// Schema Versioning
// =============================================================================

export const JOURNAL_AUDIT_SCHEMA_VERSION = '1.0.0';

// =============================================================================
// Payload Schemas (domain-specific; everything else is centralized)
// =============================================================================

export const journalCreatePayloadV1 = z.object({
  status: z.enum(['draft', 'posted']),
  reference: z.string().nullable(),
  currencyId: z.uuid(),
  isFx: z.boolean(),
  exchangeRate: z.number().nullable(),
  entryCount: z.number().int().positive(),
  totalDebits: z.number(),
  totalCredits: z.number(),
  contactId: z.uuid().nullable(),
  isRecurring: z.boolean(),
  ledgerTransactionId: z.uuid().nullable(),
});
export type JournalCreatePayload = z.infer<typeof journalCreatePayloadV1>;

export const journalVoidPayloadV1 = z.object({
  previousStatus: z.literal('draft'),
  reference: z.string().nullable(),
  voidReason: z.string().nullable(),
});
export type JournalVoidPayload = z.infer<typeof journalVoidPayloadV1>;

export const journalReversePayloadV1 = z.object({
  previousStatus: z.literal('posted'),
  reference: z.string().nullable(),
  ledgerTransactionId: z.uuid(),
  reversalJournalId: z.uuid(),
  reversalReference: z.string().nullable(),
  reversalDate: z.iso.date(),
  reversalReason: z.string().nullable(),
});
export type JournalReversePayload = z.infer<typeof journalReversePayloadV1>;

// =============================================================================
// Writers (factory-generated)
// =============================================================================

export const writeJournalCreateAudit = createAuditWriter({
  entityType: 'journal',
  action: 'journal.create',
  schemaVersion: JOURNAL_AUDIT_SCHEMA_VERSION,
  payloadSchema: journalCreatePayloadV1,
});

export const writeJournalVoidAudit = createAuditWriter({
  entityType: 'journal',
  action: 'journal.void',
  schemaVersion: JOURNAL_AUDIT_SCHEMA_VERSION,
  payloadSchema: journalVoidPayloadV1,
});

export const writeJournalReverseAudit = createAuditWriter({
  entityType: 'journal',
  action: 'journal.reverse',
  schemaVersion: JOURNAL_AUDIT_SCHEMA_VERSION,
  payloadSchema: journalReversePayloadV1,
});
