// import axios, { type AxiosInstance } from 'axios';
// import { ENV } from '../../../config/env.js';
// import { logger } from '../../../shared/index.js';
// import type { MLPredictionOutput } from './ml-prediction.types.js';
// import type { EnrichedTransaction } from '../enrichment/enrichment.types.js';

// /**
//  * HTTP client for the ML Engine API
//  *
//  * Handles all communication with the Python ML Engine service
//  * for transaction categorization predictions.
//  */
// export class MLEngineClient {
//   private readonly client: AxiosInstance;
//   private readonly timeout: number;

//   constructor(
//     baseURL?: string,
//     timeout = Number(ENV.ML_API_TIMEOUT_MS ?? 10000),
//   ) {
//     const url = baseURL ?? ENV.ML_ENGINE_URL;
//     if (!url) {
//       throw new Error(
//         'ML_ENGINE_URL is not configured. Set ML_ENGINE_URL environment variable.',
//       );
//     }

//     this.timeout = timeout;
//     this.client = axios.create({
//       baseURL: url,
//       timeout: this.timeout,
//       headers: {
//         'Content-Type': 'application/json',
//       },
//     });

//     logger.info({ baseURL: url, timeout }, 'ML Engine client initialized');
//   }

//   /**
//    * Request transaction categorization predictions from ML Engine
//    *
//    * @param request - Enriched transaction data and company context
//    * @returns ML prediction output with model results
//    * @throws Error if API call fails or times out
//    */
//   async predict(request: EnrichedTransaction): Promise<MLPredictionOutput> {
//     const startTime = Date.now();

//     try {
//       logger.debug(
//         {
//           companyId: request.context.company_uuid,
//         },
//         'Calling ML Engine /api/v1/predict endpoint',
//       );

//       const response = await this.client.post<MLPredictionOutput>(
//         '/api/v1/predict',
//         request,
//       );

//       const latencyMs = Date.now() - startTime;

//       logger.info(
//         {
//           companyId: request.context.company_uuid,
//           accountId: response.data.final_posting.account_id,
//           modelVersion: response.data.global_intent_classifier.model_version,
//           latencyMs,
//         },
//         'ML Engine prediction completed',
//       );

//       return response.data;
//     } catch (error) {
//       const latencyMs = Date.now() - startTime;

//       logger.error(
//         {
//           companyId: request.context.company_uuid,
//           error: error instanceof Error ? error.message : 'Unknown error',
//           latencyMs,
//         },
//         'ML Engine prediction failed',
//       );

//       // Re-throw error to let the worker handle it
//       throw error;
//     }
//   }

//   /**
//    * Health check for ML Engine availability
//    *
//    * @returns true if ML Engine is reachable and healthy
//    */
//   async healthCheck(): Promise<boolean> {
//     try {
//       await this.client.get('/health', { timeout: 5000 });
//       return true;
//     } catch (error) {
//       logger.warn(
//         {
//           error: error instanceof Error ? error.message : 'Unknown error',
//         },
//         'ML Engine health check failed',
//       );
//       return false;
//     }
//   }
// }

// // Singleton instance
// let mlEngineClient: MLEngineClient | null = null;

// /**
//  * Get or create the ML Engine client singleton
//  *
//  * @returns Shared ML Engine client instance
//  */
// export function getMLEngineClient(): MLEngineClient {
//   if (!mlEngineClient) {
//     mlEngineClient = new MLEngineClient();
//   }
//   return mlEngineClient;
// }
