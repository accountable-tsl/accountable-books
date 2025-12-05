import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

import { ENV, isDev, isProd } from '../../../config/env.js';
import { logger } from '../../../shared/utils/logger.js';

/**
 * Simplified webhook verification for Plaid
 * Only verifies if PLAID_WEBHOOK_SECRET is set and not in development mode
 */
export function verifyPlaidWebhook(
  rawBody: Buffer,
  signature: string | undefined,
  timestamp: string | undefined,
): boolean {
  // Skip verification in development unless explicitly enabled
  if (isDev && !ENV.ENABLE_WEBHOOK_VERIFICATION) {
    return true;
  }

  const webhookSecret = ENV.PLAID_WEBHOOK_SECRET;

  // Skip verification if no secret configured
  if (!webhookSecret) {
    if (isProd) {
      logger.warn(
        'PLAID_WEBHOOK_SECRET not configured - webhook verification disabled',
      );
    }
    return true;
  }

  // Missing required headers
  if (!signature || !timestamp) {
    logger.warn('Missing Plaid webhook verification headers');
    return false;
  }

  try {
    // Create expected signature
    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    // Timing-safe comparison
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Webhook verification error',
    );
    return false;
  }
}

/**
 * Provider-specific webhook configuration
 */
export interface WebhookProviderConfig {
  verificationEnabled: boolean;
  verificationMethod: 'hmac' | 'token' | 'none';
  verify?: (req: Request) => boolean;
}

/**
 * Registry of webhook configurations per provider
 * Easy to extend for new providers
 */
export const webhookProviders: Record<string, WebhookProviderConfig> = {
  plaid: {
    verificationEnabled: !!ENV.PLAID_WEBHOOK_SECRET,
    verificationMethod: 'hmac',
    verify: (req: Request) => {
      const signature = req.headers['plaid-verification'] as string;
      const timestamp = req.headers['plaid-verification-timestamp'] as string;
      return verifyPlaidWebhook(req.body, signature, timestamp);
    },
  },
  // Future providers can be added here
  // yodlee: {
  //   verificationEnabled: true,
  //   verificationMethod: 'token',
  //   verify: (req) => req.headers['x-api-key'] === ENV.YODLEE_WEBHOOK_KEY,
  // },
};
