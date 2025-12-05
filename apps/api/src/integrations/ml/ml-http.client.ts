import axios, { type AxiosInstance } from 'axios';

import { ENV } from '../../config/env.js';
import { logger } from '../../shared/index.js';

export type HttpClient = Pick<AxiosInstance, 'get' | 'post'>;

export function createMLHttpClient(
  baseURL?: string,
  timeout = Number(process.env.ML_API_TIMEOUT_MS ?? 10000),
): AxiosInstance {
  const url = baseURL ?? ENV.ML_ENGINE_URL;
  if (!url) {
    throw new Error(
      'ML_ENGINE_URL is not configured. Set ML_ENGINE_URL environment variable.',
    );
  }

  const client = axios.create({
    baseURL: url,
    timeout,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  logger.info({ baseURL: url, timeout }, 'ML Engine client initialized');

  return client;
}
