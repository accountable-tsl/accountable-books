import { z } from 'zod';

import { auditActorType } from './enums.js';

/**
 * Base audit event shape shared across domains.
 * Use domain-specific extensions (e.g. ledgerAuditEvent) for strict eventType typing.
 */
export const auditEventBase = z.object({
  id: z.string(),
  eventType: z.string(),
  actorName: z.string(),
  actorType: auditActorType,
  timestamp: z.string(),
  comment: z.string().optional(),
});
export type AuditEventBase = z.infer<typeof auditEventBase>;
