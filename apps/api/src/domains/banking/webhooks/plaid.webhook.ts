import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import express, { Router } from 'express';

import { knexClient } from '../../../db/knexClient.js';
import { webhookProviders } from '../../../integrations/banking/utils/webhookVerification.js';
import { logger } from '../../../shared/utils/logger.js';
import { ingestProviderWebhookEvent } from '../bank-provider-webhook-events/bank-provider-webhook-events.model.js';
import { buildWebhookDedupeKey } from '../bank-provider-webhook-events/webhook-dedupe.js';

const router = Router();

interface PlaidWebhookRequest {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  environment?: string;
  [key: string]: unknown;
}

router.post(
  '/webhooks/banking/plaid',
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req: Request, res: Response) => {
    const traceId = randomUUID();
    const startTime = Date.now();

    const log = (phase: string, data: Record<string, unknown> = {}) => {
      logger.info(
        {
          traceId,
          phase,
          duration_ms: Date.now() - startTime,
          ...data,
        },
        `[${traceId}] Plaid webhook: ${phase}`,
      );
    };

    try {
      const rawBody = req.body as Buffer;
      let webhookData: PlaidWebhookRequest;

      try {
        webhookData = JSON.parse(rawBody.toString('utf8'));
      } catch {
        log('invalid_json');
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }

      const plaidConfig = webhookProviders.plaid;
      if (plaidConfig?.verificationEnabled) {
        const isValid = await plaidConfig.verify(req);
        if (!isValid) {
          log('verification_failed', {
            provider: 'plaid',
            hasSignature: !!req.headers['plaid-verification'],
          });
          return res.status(401).json({ error: 'Webhook verification failed' });
        }
        log('verification_success', { provider: 'plaid' });
      } else {
        log('verification_skipped', {
          provider: 'plaid',
          reason: 'Verification disabled for local development',
        });
      }

      const eventType =
        typeof webhookData.webhook_type === 'string'
          ? webhookData.webhook_type
          : 'UNKNOWN';
      const eventCode =
        typeof webhookData.webhook_code === 'string'
          ? webhookData.webhook_code
          : 'UNKNOWN';
      const providerItemId =
        typeof webhookData.item_id === 'string' ? webhookData.item_id : null;

      const dedupeKey = buildWebhookDedupeKey(rawBody);

      log('received', {
        webhook_type: eventType,
        webhook_code: eventCode,
        item_id: providerItemId,
        environment: webhookData.environment,
      });

      const { inserted, eventId } = await knexClient.transaction(async (trx) =>
        ingestProviderWebhookEvent({
          providerKey: 'plaid',
          providerItemId,
          eventType,
          eventCode,
          dedupeKey,
          payload: webhookData as Record<string, unknown>,
          trx,
        }),
      );

      log(inserted ? 'stored' : 'duplicate', {
        event_id: eventId,
        dedupe_key: dedupeKey,
      });

      return res.status(200).json({ received: true });
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          traceId,
        },
        'Plaid webhook ingest failed',
      );

      if (!res.headersSent) {
        return res.status(500).json({ error: 'Webhook ingest failed' });
      }
    }
  },
);

export default router;
