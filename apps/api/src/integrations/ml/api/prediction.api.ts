import type {
  EnrichedTransaction,
  MLPredictionOutput,
} from '@accountable-books/contracts/schema';

import { logger } from '../../../shared/index.js';
import type { HttpClient } from '../ml-http.client.js';
import { ML_ROUTES } from '../ml-routes.js';

export function predictionApi(http: HttpClient) {
  return {
    async predict(request: EnrichedTransaction): Promise<MLPredictionOutput> {
      const startTime = Date.now();

      try {
        logger.debug(
          {
            companyId: request.context.company_uuid,
          },
          'Calling ML Engine predict endpoint',
        );

        const response = await http.post<MLPredictionOutput>(
          ML_ROUTES.predict.path,
          request,
        );

        const latencyMs = Date.now() - startTime;

        logger.info(
          {
            companyId: request.context.company_uuid,
            accountId: response.data.final_posting.account_id,
            modelVersion: response.data.global_intent_classifier.model_version,
            latencyMs,
          },
          'ML Engine prediction completed',
        );

        return response.data;
      } catch (error) {
        const latencyMs = Date.now() - startTime;

        logger.error(
          {
            companyId: request.context.company_uuid,
            error: error instanceof Error ? error.message : 'Unknown error',
            latencyMs,
          },
          'ML Engine prediction failed',
        );

        throw error;
      }
    },
  };
}
