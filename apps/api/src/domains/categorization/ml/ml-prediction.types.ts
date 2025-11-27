import { z } from 'zod';
import { enrichedTransactionSchema } from '../enrichment/enrichment.types.js';

export {
  type MLPredictionRequest,
  type MLPredictedLine,
  type MLPrediction,
  type MLPredictionResponse,
} from '@accountable-books/contracts/schema';

export const mlPredictionJobDataSchema = z.object({
  categorizationTaskId: z.uuid(),
  bankTransactionId: z.uuid(),
  companyId: z.uuid(),
  enrichedTransaction: enrichedTransactionSchema,
});

export type MLPredictionJobData = z.infer<typeof mlPredictionJobDataSchema>;
