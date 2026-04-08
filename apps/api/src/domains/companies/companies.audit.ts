import { z } from 'zod';

import { createAuditWriter } from '../audit/index.js';

const profileFieldDiff = z.object({
  previous: z.unknown().nullable(),
  next: z.unknown().nullable(),
});

const profileUpdatedPayload = z.object({
  changedFields: z.record(z.string(), profileFieldDiff),
  clearedVerification: z.array(z.string()),
});

export const writeCompanyProfileUpdatedAudit = createAuditWriter({
  entityType: 'company',
  action: 'company.profile_updated',
  schemaVersion: '1',
  payloadSchema: profileUpdatedPayload,
});
