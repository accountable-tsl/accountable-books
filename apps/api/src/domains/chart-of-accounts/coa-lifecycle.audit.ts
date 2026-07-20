import { z } from 'zod';

import { createAuditWriter } from '../audit/index.js';
import {
  coaLifecycleOperation,
  coaLifecycleReferenceType,
  coaLifecycleResolution,
} from './coa.types.js';

const lifecycleReferenceCounts = z.object({
  draftJournals: z.number().int().nonnegative(),
  recurringTemplates: z.number().int().nonnegative(),
  categorizationRules: z.number().int().nonnegative(),
  predictions: z.number().int().nonnegative(),
  candidates: z.number().int().nonnegative(),
});

const lifecycleExecutedPayload = z.object({
  operation: coaLifecycleOperation,
  impactFingerprint: z.string().length(64),
  resolutions: z.array(coaLifecycleResolution),
  acknowledgedUnresolvedArchiveReferences: z.boolean(),
  remainingReferences: lifecycleReferenceCounts,
  resolvedReferenceTypes: z.array(coaLifecycleReferenceType),
});

export const writeCoaLifecycleExecutedAudit = createAuditWriter({
  entityType: 'chart_of_account',
  action: 'chart_of_account.lifecycle_executed',
  schemaVersion: '1',
  payloadSchema: lifecycleExecutedPayload,
});
