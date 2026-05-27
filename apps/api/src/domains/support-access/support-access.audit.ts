import { z } from 'zod';

import { createAuditWriter } from '../audit/index.js';
import { supportAccessLevel } from './support-access.types.js';

const grantCreatedPayload = z.object({
  supportUserId: z.uuid(),
  supportAccessLevel,
  expiresAt: z.iso.datetime(),
  reason: z.string(),
});

const grantRevokedPayload = z.object({
  supportUserId: z.uuid(),
  supportAccessLevel,
  revokedAt: z.iso.datetime(),
  revokeReason: z.string().nullable(),
});

const breakGlassOpenedPayload = z.object({
  superAdminUserId: z.uuid(),
  expiresAt: z.iso.datetime(),
  reason: z.string(),
});

const breakGlassClosedPayload = z.object({
  superAdminUserId: z.uuid(),
  closedAt: z.iso.datetime(),
  closeReason: z.string().nullable(),
});

export const writeSupportGrantCreatedAudit = createAuditWriter({
  entityType: 'support_access',
  action: 'support_access.grant_created',
  schemaVersion: '1',
  payloadSchema: grantCreatedPayload,
});

export const writeSupportGrantRevokedAudit = createAuditWriter({
  entityType: 'support_access',
  action: 'support_access.grant_revoked',
  schemaVersion: '1',
  payloadSchema: grantRevokedPayload,
});

export const writeBreakGlassOpenedAudit = createAuditWriter({
  entityType: 'support_access',
  action: 'support_access.break_glass_opened',
  schemaVersion: '1',
  payloadSchema: breakGlassOpenedPayload,
});

export const writeBreakGlassClosedAudit = createAuditWriter({
  entityType: 'support_access',
  action: 'support_access.break_glass_closed',
  schemaVersion: '1',
  payloadSchema: breakGlassClosedPayload,
});
