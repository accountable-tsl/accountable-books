import type { Knex } from 'knex';
import { z } from 'zod';

import { knexClient } from '../../../db/knexClient.js';
import { transactionSyncService } from '../../../integrations/banking/services/transaction-sync.service.js';
import { requestBankSyncForConnection } from '../../../integrations/banking/transaction-sync.outbox.js';
import { getLogger } from '../../../shared/utils/logger.js';
import { revokeConnectionAndDestroySecret } from '../connection-lifecycle/lifecycle.commands.js';
import {
  attachBankConnectionToWebhookEvent,
  getProviderWebhookEvent,
  markProviderWebhookEventCompleted,
  markProviderWebhookEventQuarantined,
  setProviderWebhookEventLastError,
} from './bank-provider-webhook-events.model.js';

const logger = getLogger({ component: 'provider-webhook-processor' });

export const providerWebhookReceivedPayloadSchema = z.object({
  eventId: z.uuid(),
  providerKey: z.string().trim().min(1),
});

export class ProviderWebhookConnectionNotFoundError extends Error {
  constructor(public readonly eventId: string) {
    super(`Provider webhook connection not found for event ${eventId}`);
    this.name = 'ProviderWebhookConnectionNotFoundError';
  }
}

const PLAID_NOOP_CODES: ReadonlySet<string> = new Set([
  'TRANSACTIONS:INITIAL_UPDATE',
  'TRANSACTIONS:HISTORICAL_UPDATE',
  'TRANSACTIONS:DEFAULT_UPDATE',
  'TRANSACTIONS:TRANSACTIONS_REMOVED',
  'ITEM:ERROR',
  'ITEM:PENDING_EXPIRATION',
  'ITEM:WEBHOOK_UPDATE_ACKNOWLEDGED',
]);

type QuarantineAlert = {
  eventId: string;
  reason: string;
  lastError?: string | null;
};

type ProcessResult = {
  status: 'done';
  quarantineAlert?: QuarantineAlert;
};

async function quarantineInline({
  eventId,
  reason,
  lastError,
  trx,
}: {
  eventId: string;
  reason: string;
  lastError?: string | null;
  trx: Knex.Transaction;
}): Promise<ProcessResult> {
  const didQuarantine = await markProviderWebhookEventQuarantined({
    eventId,
    reason,
    lastError,
    trx,
  });
  return {
    status: 'done',
    quarantineAlert: didQuarantine ? { eventId, reason, lastError } : undefined,
  };
}

export async function processProviderWebhookReceived(
  payload: unknown,
  trx: Knex.Transaction,
): Promise<ProcessResult> {
  const { eventId, providerKey } =
    providerWebhookReceivedPayloadSchema.parse(payload);

  const event = await getProviderWebhookEvent({ eventId, trx });
  if (!event) {
    logger.error({ eventId }, 'Webhook event row missing; completing outbox');
    return { status: 'done' };
  }

  if (event.status === 'completed' || event.status === 'quarantined') {
    return { status: 'done' };
  }

  if (event.provider_key !== providerKey) {
    return quarantineInline({
      eventId,
      reason: 'provider_key_mismatch',
      lastError: `Expected ${event.provider_key}, got ${providerKey}`,
      trx,
    });
  }

  if (providerKey === 'plaid') {
    return processPlaidWebhookEvent(eventId, event, trx);
  }

  return quarantineInline({
    eventId,
    reason: 'unsupported_provider',
    lastError: `No processor for provider_key=${providerKey}`,
    trx,
  });
}

async function processPlaidWebhookEvent(
  eventId: string,
  event: {
    event_type: string;
    event_code: string;
    provider_item_id: string | null;
  },
  trx: Knex.Transaction,
): Promise<ProcessResult> {
  const typeCode = `${event.event_type}:${event.event_code}`;

  if (PLAID_NOOP_CODES.has(typeCode)) {
    logger.info({ eventId, typeCode }, 'Plaid webhook no-op completed');
    await markProviderWebhookEventCompleted({ eventId, trx });
    return { status: 'done' };
  }

  if (
    event.event_type === 'TRANSACTIONS' &&
    event.event_code === 'SYNC_UPDATES_AVAILABLE'
  ) {
    const connection = await resolveConnection(eventId, event.provider_item_id);
    await attachBankConnectionToWebhookEvent({
      eventId,
      bankConnectionId: connection.id,
      trx,
    });
    await requestBankSyncForConnection({
      connectionId: connection.id,
      trigger: 'webhook',
    });
    await markProviderWebhookEventCompleted({ eventId, trx });
    return { status: 'done' };
  }

  if (
    event.event_type === 'ITEM' &&
    event.event_code === 'USER_PERMISSION_REVOKED'
  ) {
    const connection = await resolveConnection(eventId, event.provider_item_id);
    await attachBankConnectionToWebhookEvent({
      eventId,
      bankConnectionId: connection.id,
      trx,
    });
    const result = await revokeConnectionAndDestroySecret({
      connectionId: connection.id,
      companyId: connection.company_id,
      revocationOrigin: 'provider',
      revocationReason: 'Plaid USER_PERMISSION_REVOKED',
      trx,
    });
    if (!result.success) {
      throw new Error(
        result.message ?? 'Failed to revoke connection from webhook',
      );
    }
    await markProviderWebhookEventCompleted({ eventId, trx });
    return { status: 'done' };
  }

  return quarantineInline({
    eventId,
    reason: 'unhandled_webhook',
    lastError: `Unhandled Plaid webhook ${typeCode}`,
    trx,
  });
}

async function resolveConnection(
  eventId: string,
  providerItemId: string | null,
): Promise<{ id: string; company_id: string }> {
  if (!providerItemId) {
    throw new ProviderWebhookConnectionNotFoundError(eventId);
  }

  const connection = await transactionSyncService.findConnectionByItemId({
    providerKey: 'plaid',
    itemId: providerItemId,
  });

  if (!connection) {
    await setProviderWebhookEventLastError({
      eventId,
      lastError: `Connection not found for item_id=${providerItemId}`,
    });
    throw new ProviderWebhookConnectionNotFoundError(eventId);
  }

  return connection;
}

export async function quarantineProviderWebhookAfterDeadLetter(
  payload: unknown,
  lastError: string,
  trx?: Knex | Knex.Transaction,
): Promise<void> {
  const parsed = providerWebhookReceivedPayloadSchema.safeParse(payload);
  if (!parsed.success) return;

  // Outbox dead-letter alert already covers this path — no quarantine alert.
  await markProviderWebhookEventQuarantined({
    eventId: parsed.data.eventId,
    reason: 'outbox_dead_lettered',
    lastError,
    trx: trx ?? knexClient,
  });
}
