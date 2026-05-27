import { healthApi } from './api/health.api.js';
import { predictionApi } from './api/prediction.api.js';
import { createMLHttpClient } from './ml-http.client.js';

export const CURRENT_ML_TYPE: 'ml' | 'ml_heuristic' = 'ml_heuristic';

type PredictionModule = ReturnType<typeof predictionApi>;
type HealthModule = ReturnType<typeof healthApi>;

export interface MLEngineClient {
  prediction: PredictionModule;
  health: HealthModule;
  predict: PredictionModule['predict'];
  healthCheck: HealthModule['check'];
}

/**
 * Build a modular ML Engine client composed of endpoint groups.
 */
export function createMLEngineClient(
  baseURL?: string,
  timeout = Number(process.env.ML_API_TIMEOUT_MS ?? 10000),
): MLEngineClient {
  const http = createMLHttpClient(baseURL, timeout);
  const prediction = predictionApi(http);
  const health = healthApi(http);
  return {
    prediction,
    health,
    predict: prediction.predict,
    healthCheck: health.check,
    // add more endpoint groups here (e.g., training: trainingApi(http))
  };
}

// Singleton instance
let mlEngineClient: MLEngineClient | null = null;

/**
 * Get or create the ML Engine client singleton.
 */
export function getMLEngineClient(): MLEngineClient {
  if (!mlEngineClient) {
    mlEngineClient = createMLEngineClient();
  }
  return mlEngineClient;
}
