import axios, { type AxiosInstance } from 'axios';
import { ENV } from '../../../config/env.js';
import { logger } from '../../../shared/index.js';
import type {
  MLPredictionRequest,
  MLPredictionResponse,
} from './ml-prediction.types.js';

/**
 * HTTP client for the ML Engine API
 *
 * Handles all communication with the Python ML Engine service
 * for transaction categorization predictions.
 */
export class MLEngineClient {
  private readonly client: AxiosInstance;
  private readonly timeout: number;

  constructor(
    baseURL?: string,
    timeout = Number(process.env.ML_API_TIMEOUT_MS ?? 10000),
  ) {
    const url = baseURL ?? ENV.ML_ENGINE_URL;
    if (!url) {
      throw new Error(
        'ML_ENGINE_URL is not configured. Set ML_ENGINE_URL environment variable.',
      );
    }

    this.timeout = timeout;
    this.client = axios.create({
      baseURL: url,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.info({ baseURL: url, timeout }, 'ML Engine client initialized');
  }

  /**
   * Request transaction categorization predictions from ML Engine
   *
   * @param request - Enriched transaction data and company context
   * @returns ML predictions with confidence scores and explanations
   * @throws Error if API call fails or times out
   */
  async predict(request: MLPredictionRequest): Promise<MLPredictionResponse> {
    const startTime = Date.now();

    try {
      logger.debug(
        {
          companyId: request.companyContext?.companyId,
        },
        'Calling ML Engine /predict endpoint',
      );

      const response = await this.client.post<MLPredictionResponse>(
        '/predict',
        request,
      );

      const latencyMs = Date.now() - startTime;

      logger.info(
        {
          companyId: request.companyContext?.companyId,
          predictionsCount: response.data.predictions?.length ?? 0,
          modelVersion: response.data.modelVersion,
          latencyMs,
        },
        'ML Engine prediction completed',
      );

      return {
        ...response.data,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      logger.error(
        {
          companyId: request.companyContext?.companyId,
          error: error instanceof Error ? error.message : 'Unknown error',
          latencyMs,
        },
        'ML Engine prediction failed',
      );

      // Return error response instead of throwing
      // This allows the worker to handle gracefully
      return {
        success: false,
        predictions: [],
        modelVersion: 'unknown',
        latencyMs,
        error: error instanceof Error ? error.message : 'ML Engine API error',
      };
    }
  }

  /**
   * Health check for ML Engine availability
   *
   * @returns true if ML Engine is reachable and healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/health', { timeout: 5000 });
      return true;
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'ML Engine health check failed',
      );
      return false;
    }
  }
}

// Singleton instance
let mlEngineClient: MLEngineClient | null = null;

/**
 * Get or create the ML Engine client singleton
 *
 * @returns Shared ML Engine client instance
 */
export function getMLEngineClient(): MLEngineClient {
  if (!mlEngineClient) {
    mlEngineClient = new MLEngineClient();
  }
  return mlEngineClient;
}
