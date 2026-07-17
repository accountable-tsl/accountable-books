import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import express, { Router } from 'express';

import { knexClient } from '../../../db/knexClient.js';
import { transactionSyncService } from '../../../integrations/banking/services/transaction-sync.service.js';
import { requestBankSyncForConnection } from '../../../integrations/banking/transaction-sync.outbox.js';
import { webhookProviders } from '../../../integrations/banking/utils/webhookVerification.js';
import { logger } from '../../../shared/utils/logger.js';
import { revokeConnectionAndDestroySecret } from '../connection-lifecycle/lifecycle.commands.js';

const router = Router();

interface PlaidWebhookRequest {
  webhook_type: string;
  webhook_code: string;
  item_id: string;
  environment: string;
  new_transactions?: number;
  removed_transactions?: string[];
  error?: {
    error_code: string;
    error_message: string;
    error_type: string;
    display_message: string;
  };
}

/**
 * Handle Plaid webhooks
 * Endpoint: POST /webhooks/banking/plaid
 *
 * Uses express.raw() middleware to capture raw body for signature verification
 * Verification is optional and controlled by environment configuration
 */
router.post(
  '/webhooks/banking/plaid',
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req: Request, res: Response) => {
    const traceId = randomUUID();
    const startTime = Date.now();

    const log = (phase: string, data: Record<string, unknown>) => {
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
      // Parse raw body to JSON
      const rawBody = req.body as Buffer;
      let webhookData: PlaidWebhookRequest;

      try {
        webhookData = JSON.parse(rawBody.toString('utf8'));
      } catch (parseError) {
        log('invalid_json', { error: 'Failed to parse webhook body' });
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }

      // Optional webhook verification based on configuration
      const plaidConfig = webhookProviders.plaid;
      if (plaidConfig?.verificationEnabled && plaidConfig.verify) {
        const isValid = plaidConfig.verify(req);

        if (!isValid) {
          log('verification_failed', {
            provider: 'plaid',
            hasSignature: !!req.headers['plaid-verification'],
            hasTimestamp: !!req.headers['plaid-verification-timestamp'],
          });
          // Return 401 for invalid signatures
          return res.status(401).json({ error: 'Webhook verification failed' });
        }

        log('verification_success', { provider: 'plaid' });
      } else {
        log('verification_skipped', {
          provider: 'plaid',
          reason: plaidConfig?.verificationEnabled
            ? 'No verify function'
            : 'Verification disabled',
        });
      }

      log('received', {
        webhook_type: webhookData.webhook_type,
        webhook_code: webhookData.webhook_code,
        item_id: webhookData.item_id,
        environment: webhookData.environment,
      });

      // Handle different webhook types
      switch (webhookData.webhook_type) {
        case 'TRANSACTIONS':
          await handleTransactionWebhook(webhookData, traceId);
          break;

        case 'ITEM':
          await handleItemWebhook(webhookData, traceId);
          break;

        default:
          log('ignored', {
            reason: 'Unhandled webhook type',
            webhook_type: webhookData.webhook_type,
          });
      }

      // Always respond quickly to webhooks
      log('completed', {});
      return res.status(200).json({ received: true });
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          traceId,
        },
        'Plaid webhook processing failed',
      );

      if (!res.headersSent) {
        return res.status(200).json({ received: true, error: true });
      }
    }
  },
);

/**
 * Handle transaction-related webhooks
 */
async function handleTransactionWebhook(
  data: PlaidWebhookRequest,
  traceId: string,
): Promise<void> {
  const log = (message: string, extra?: Record<string, unknown>) => {
    logger.info(
      {
        traceId,
        item_id: data.item_id,
        webhook_code: data.webhook_code,
        ...extra,
      },
      `Transaction webhook: ${message}`,
    );
  };

  switch (data.webhook_code) {
    case 'SYNC_UPDATES_AVAILABLE': {
      // New transactions are available
      log('Sync updates available', {
        new_transactions: data.new_transactions,
      });

      // Find the provider connection by item ID.
      const connection = await transactionSyncService.findConnectionByItemId({
        providerKey: 'plaid',
        itemId: data.item_id,
      });

      if (!connection) {
        log('Connection not found for item', {
          item_id: data.item_id,
        });
        return;
      }

      const intentCount = await requestBankSyncForConnection({
        connectionId: connection.id,
        trigger: 'webhook',
      });

      log('Bank sync intents written', {
        connection_id: connection.id,
        intent_count: intentCount,
      });
      break;
    }

    case 'INITIAL_UPDATE':
      // Initial transaction pull has completed
      log('Initial update completed');
      break;

    case 'HISTORICAL_UPDATE':
      // Historical transaction pull has completed
      log('Historical update completed');
      break;

    case 'DEFAULT_UPDATE':
      // Regular transaction update
      log('Default update received');
      break;

    case 'TRANSACTIONS_REMOVED':
      // Transactions were removed
      log('Transactions removed', {
        removed_count: data.removed_transactions?.length,
      });
      break;

    default:
      log('Unhandled transaction webhook code');
  }
}

/**
 * Handle item-related webhooks
 */
async function handleItemWebhook(
  data: PlaidWebhookRequest,
  traceId: string,
): Promise<void> {
  const log = (message: string, extra?: Record<string, unknown>) => {
    logger.info(
      {
        traceId,
        item_id: data.item_id,
        webhook_code: data.webhook_code,
        ...extra,
      },
      `Item webhook: ${message}`,
    );
  };

  switch (data.webhook_code) {
    case 'ERROR':
      // Item has an error that needs to be resolved
      log('Item error', {
        error_code: data.error?.error_code,
        error_message: data.error?.error_message,
      });

      // TODO: Update credential status to 'error'
      // TODO: Notify user about the error
      break;

    case 'PENDING_EXPIRATION':
      // Access token will expire soon
      log('Item pending expiration');
      // TODO: Notify user to re-authenticate
      break;

    case 'USER_PERMISSION_REVOKED': {
      log('User permission revoked');
      const connection = await transactionSyncService.findConnectionByItemId({
        providerKey: 'plaid',
        itemId: data.item_id,
      });
      if (!connection) {
        log('Connection not found for revoked item', { item_id: data.item_id });
        break;
      }
      await knexClient.transaction(async (trx) => {
        await revokeConnectionAndDestroySecret({
          connectionId: connection.id,
          companyId: connection.company_id,
          revocationOrigin: 'provider',
          revocationReason: 'Plaid USER_PERMISSION_REVOKED',
          trx,
        });
      });
      log('Connection revoked from webhook', {
        connection_id: connection.id,
      });
      break;
    }

    case 'WEBHOOK_UPDATE_ACKNOWLEDGED':
      // Webhook URL was successfully updated
      log('Webhook update acknowledged');
      break;

    default:
      log('Unhandled item webhook code');
  }
}

export default router;
