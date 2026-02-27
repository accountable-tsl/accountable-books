import { z } from 'zod';

import { auditEventBase } from '../common/audit.js';

/**
 * Ledger-specific audit event types (backend: ledger_audit_logs).
 */
export const ledgerAuditEventType = z.enum([
  'ledger_posted_auto',
  'ledger_posted_manual',
  'metadata_updated',
  'ledger_superseded',
  'ledger_split_created',
  'ledger_reversed',
  'ledger_marked_reviewed',
  'ledger_marked_unreviewed',
]);
export type LedgerAuditEventType = z.infer<typeof ledgerAuditEventType>;

export const ledgerAuditEvent = auditEventBase.extend({
  eventType: ledgerAuditEventType,
});
export type LedgerAuditEvent = z.infer<typeof ledgerAuditEvent>;
