import z from 'zod';

export const txnCategorizationSource = z.enum([
  'rule',
  'ml',
  'ml_heuristic',
  'manual',
  'enrichment',
]);
export type TxnCategorizationSource = z.infer<typeof txnCategorizationSource>;
