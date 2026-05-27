import { z } from 'zod';

export const categorizationTaskSource = z.enum([
  'ingestion',
  'backfill',
  'manual',
]);

export const categorizationTaskStatus = z.enum([
  'enriched',
  'partial',
  'failed',
  'pending',
]);
export const categorizationTaskStatusJson = z.toJSONSchema(
  categorizationTaskStatus,
);
