import { alertAdmins } from '../../../features/comms/index.js';
import { getLogger } from '../../../shared/utils/logger.js';

const logger = getLogger({ component: 'provider-webhook-alerts' });

async function sendBestEffort(
  event: Parameters<typeof alertAdmins>[0],
): Promise<void> {
  try {
    await alertAdmins(event);
  } catch (error) {
    logger.error(
      {
        eventType: event.eventType,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to send provider webhook admin alert',
    );
  }
}

export async function alertProviderWebhookQuarantined({
  eventId,
  reason,
  lastError,
}: {
  eventId: string;
  reason: string;
  lastError?: string | null;
}): Promise<void> {
  await sendBestEffort({
    idempotencyKey: `provider-webhook-quarantined:${eventId}`,
    eventType: 'banking.provider_webhook_quarantined',
    priority: 'critical',
    title: `Provider webhook quarantined: ${reason}`,
    body: `Webhook event ${eventId} was quarantined and needs attention.`,
    data: {
      eventId,
      reason,
      lastError: lastError?.slice(0, 500) ?? null,
    },
  });
}
