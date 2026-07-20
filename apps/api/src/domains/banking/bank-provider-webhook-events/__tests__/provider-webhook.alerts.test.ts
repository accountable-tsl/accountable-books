import { beforeEach, describe, expect, it, vi } from 'vitest';

import { alertAdmins } from '../../../../features/comms/index.js';
import { alertProviderWebhookQuarantined } from '../provider-webhook.alerts.js';

vi.mock('../../../../features/comms/index.js', () => ({
  alertAdmins: vi.fn(),
}));

const alertAdminsMock = vi.mocked(alertAdmins);

describe('provider webhook alerts', () => {
  beforeEach(() => {
    alertAdminsMock.mockReset();
    alertAdminsMock.mockResolvedValue({ accepted: true, deliveries: [] });
  });

  it('alerts once per quarantined event, keyed by event id', async () => {
    await alertProviderWebhookQuarantined({
      eventId: 'evt-1',
      reason: 'unhandled_webhook',
      lastError: 'Unhandled Plaid webhook X:Y',
    });

    expect(alertAdminsMock).toHaveBeenCalledTimes(1);
    expect(alertAdminsMock.mock.calls[0][0]).toMatchObject({
      idempotencyKey: 'provider-webhook-quarantined:evt-1',
      eventType: 'banking.provider_webhook_quarantined',
    });
  });

  it('never throws when the alert send fails', async () => {
    alertAdminsMock.mockRejectedValue(new Error('comms down'));

    await expect(
      alertProviderWebhookQuarantined({
        eventId: 'evt-2',
        reason: 'outbox_dead_lettered',
      }),
    ).resolves.toBeUndefined();
  });
});
