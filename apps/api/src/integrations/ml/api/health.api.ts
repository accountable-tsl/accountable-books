import { logger } from '../../../shared/index.js';
import { ML_ROUTES } from '../ml-routes.js';

import type { HttpClient } from '../ml-http.client.js';

export function healthApi(http: HttpClient) {
  return {
    async check(): Promise<boolean> {
      try {
        await http.get(ML_ROUTES.health.path, { timeout: 5000 });
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
    },
  };
}
