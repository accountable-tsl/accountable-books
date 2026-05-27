import z from 'zod';

// export const categorizationTaskStatus = z.enum([
//   'enriched',
//   'partial',
//   'failed',
//   'pending',
// ]);
// export type CategorizationTaskStatus = z.infer<typeof categorizationTaskStatus>;

export const categorizationTaskSource = z.enum([
  'ingestion',
  'backfill',
  'manual',
]);
export type CategorizationTaskSource = z.infer<typeof categorizationTaskSource>;
