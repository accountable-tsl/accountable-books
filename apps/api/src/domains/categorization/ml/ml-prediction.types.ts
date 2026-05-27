import { enrichedTransaction } from '@accountable-books/contracts/schema';
import { z } from 'zod';

export {
  type EnrichedTransaction,
  type MLPredictionOutput,
} from '@accountable-books/contracts/schema';

export const mlPredictionJobDataSchema = z.object({
  categorizationTaskId: z.uuid(),
  bankTransactionId: z.uuid(),
  companyId: z.uuid(),
  enrichedTransaction: enrichedTransaction,
  runId: z.string(),
});

export type MLPredictionJobData = z.infer<typeof mlPredictionJobDataSchema>;
