import z from 'zod';

export const categorizationTaskSource = z.enum([
  'ingestion',
  'backfill',
  'manual',
]);
const categorizationTaskSourceJson = z.toJSONSchema(categorizationTaskSource);
export type CategorizationTaskSource = z.infer<typeof categorizationTaskSource>;

export const categorizationTaskStatus = z.enum([
  'enriched',
  'partial',
  'failed',
  'pending',
]);
export const categorizationTaskStatusJson = z.toJSONSchema(categorizationTaskStatus);
export type CategorizationTaskStatus = z.infer<typeof categorizationTaskStatus>;
