import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { knexClient } from '../../../db/knexClient.js';
import { alertAdmins } from '../admin-alerts.js';
import { purgeTerminalCommsDeliveries, send } from '../comms.service.js';
import {
  enqueueDueCommsDeliveries,
  processCommsDelivery,
} from '../comms.worker.js';
import {
  devEmailProvider,
  registerCommsProvider,
  resetCommsProvidersForTest,
} from '../providers/index.js';

import type { CommsSendPayload } from '../comms.types.js';
import type { CommsProvider } from '../providers/index.js';

describe('comms service', () => {
  const deliveryIds: string[] = [];
  let providerSend: ReturnType<typeof vi.fn<CommsProvider<'email'>['send']>>;
  let previousEmailProvider: string | undefined;
  let previousAdminAlertEmails: string | undefined;

  beforeEach(() => {
    previousEmailProvider = process.env.EMAIL_PROVIDER;
    previousAdminAlertEmails = process.env.ADMIN_ALERT_EMAILS;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.ADMIN_ALERT_EMAILS;

    resetCommsProvidersForTest();
    providerSend = vi.fn<CommsProvider<'email'>['send']>(async () => ({
      providerMessageId: `provider-${randomUUID()}`,
      raw: { accepted: true },
    }));
    registerCommsProvider({
      key: 'test-email',
      channel: 'email',
      supports: { html: true, text: true },
      validateConfig: () => {},
      send: providerSend,
    } satisfies CommsProvider<'email'>);
    process.env.EMAIL_PROVIDER = 'test-email';
  });

  afterEach(async () => {
    if (deliveryIds.length > 0) {
      await knexClient('app.comms_deliveries')
        .whereIn('id', [...deliveryIds])
        .del();
      deliveryIds.length = 0;
    }
    resetCommsProvidersForTest();
    vi.restoreAllMocks();

    if (previousEmailProvider === undefined) {
      delete process.env.EMAIL_PROVIDER;
    } else {
      process.env.EMAIL_PROVIDER = previousEmailProvider;
    }

    if (previousAdminAlertEmails === undefined) {
      delete process.env.ADMIN_ALERT_EMAILS;
    } else {
      process.env.ADMIN_ALERT_EMAILS = previousAdminAlertEmails;
    }
  });

  function makePayload(
    overrides: Partial<CommsSendPayload> = {},
  ): CommsSendPayload {
    const id = randomUUID();
    return {
      correlation: { source: 'notification', id },
      recipients: [
        {
          channel: 'email',
          address: `user-${id}@example.com`,
        },
      ],
      eventType: 'work.assigned',
      priority: 'normal',
      deliveryMode: 'immediate',
      data: {
        title: 'Assigned work',
        body: 'A work item needs attention.',
      },
      ...overrides,
    };
  }

  async function sendAndTrack(payload: CommsSendPayload) {
    const result = await send(payload);
    deliveryIds.push(...result.deliveries.map((delivery) => delivery.id));
    return result;
  }

  async function insertDeliveryForRetentionTest(input: {
    status: 'queued' | 'sent' | 'delivered' | 'dead' | 'suppressed';
    daysOld: number;
  }): Promise<string> {
    const id = randomUUID();
    const timestamp = knexClient.raw(`now() - (interval '1 day' * ?)`, [
      input.daysOld,
    ]);
    const [row] = await knexClient('app.comms_deliveries')
      .insert({
        id,
        idempotency_key: `retention:${id}`,
        channel: 'email',
        provider_key: 'dev',
        recipient_address: `retention-${id}@example.com`,
        template_key: 'work.assigned',
        template_version: 1,
        priority: 'normal',
        delivery_mode: 'immediate',
        status: input.status,
        attempt_count: input.status === 'queued' ? 0 : 1,
        provider_message_id:
          input.status === 'queued' ? null : `retention-provider:${id}`,
        correlation: { source: 'notification', id },
        payload_data: { title: 'Retention fixture' },
        queued_at: timestamp,
        sent_at: input.status === 'queued' ? null : timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .returning('id');
    deliveryIds.push(row.id);
    return row.id;
  }

  it('deduplicates comms.send and does not call the provider twice', async () => {
    const payload = makePayload();

    const first = await sendAndTrack(payload);
    const duplicate = await sendAndTrack(payload);

    expect(first.deliveries).toHaveLength(1);
    expect(duplicate.deliveries).toHaveLength(1);
    expect(duplicate.deliveries[0].id).toBe(first.deliveries[0].id);

    await expect(processCommsDelivery(first.deliveries[0].id)).resolves.toEqual(
      { status: 'sent' },
    );
    await expect(
      processCommsDelivery(duplicate.deliveries[0].id),
    ).resolves.toEqual({ status: 'skipped' });

    expect(providerSend).toHaveBeenCalledTimes(1);
  });

  it('records retryable provider failure', async () => {
    providerSend.mockRejectedValueOnce(new Error('provider unavailable'));
    const result = await sendAndTrack(makePayload());
    const deliveryId = result.deliveries[0].id;

    await expect(processCommsDelivery(deliveryId)).rejects.toThrow(
      'provider unavailable',
    );

    const row = await knexClient('app.comms_deliveries')
      .where({ id: deliveryId })
      .first('status', 'attempt_count', 'last_error', 'failed_at');

    expect(row?.status).toBe('failed');
    expect(Number(row?.attempt_count)).toBe(1);
    expect(row?.last_error).toContain('provider unavailable');
    expect(row?.failed_at).toBeTruthy();
  });

  it('dead-letters after exhausting provider attempts', async () => {
    providerSend.mockRejectedValue(new Error('still down'));
    const result = await sendAndTrack(makePayload());
    const deliveryId = result.deliveries[0].id;

    await expect(processCommsDelivery(deliveryId)).rejects.toThrow(
      'still down',
    );
    await expect(processCommsDelivery(deliveryId)).rejects.toThrow(
      'still down',
    );
    await expect(processCommsDelivery(deliveryId)).resolves.toEqual({
      status: 'dead',
    });

    const row = await knexClient('app.comms_deliveries')
      .where({ id: deliveryId })
      .first('status', 'attempt_count', 'last_error', 'failed_at');

    expect(row?.status).toBe('dead');
    expect(Number(row?.attempt_count)).toBe(3);
    expect(row?.last_error).toContain('still down');
    expect(row?.failed_at).toBeTruthy();
  });

  it('routes email through a configured second provider', async () => {
    const sesProviderSend = vi.fn<CommsProvider<'email'>['send']>(async () => ({
      providerMessageId: `ses-${randomUUID()}`,
      raw: { accepted: true, provider: 'ses' },
    }));
    registerCommsProvider({
      key: 'ses',
      channel: 'email',
      supports: { html: true, text: true },
      validateConfig: () => {},
      send: sesProviderSend,
    } satisfies CommsProvider<'email'>);
    process.env.EMAIL_PROVIDER = 'ses';

    const result = await sendAndTrack(makePayload());
    const deliveryId = result.deliveries[0].id;

    expect(result.deliveries[0].providerKey).toBe('ses');

    await expect(processCommsDelivery(deliveryId)).resolves.toEqual({
      status: 'sent',
    });

    expect(sesProviderSend).toHaveBeenCalledTimes(1);
    expect(providerSend).not.toHaveBeenCalled();

    const row = await knexClient('app.comms_deliveries')
      .where({ id: deliveryId })
      .first('status', 'provider_key', 'provider_message_id');

    expect(row?.status).toBe('sent');
    expect(row?.provider_key).toBe('ses');
    expect(row?.provider_message_id).toContain('ses-');
  });

  it('does not fall back when the configured email provider is unusable', async () => {
    resetCommsProvidersForTest();
    process.env.EMAIL_PROVIDER = 'postmark';

    const sesProviderSend = vi.fn<CommsProvider<'email'>['send']>(async () => ({
      providerMessageId: `ses-${randomUUID()}`,
      raw: { accepted: true, provider: 'ses' },
    }));
    registerCommsProvider({
      key: 'postmark',
      channel: 'email',
      supports: { html: true, text: true },
      validateConfig: () => {
        throw new Error('POSTMARK_API_KEY is required');
      },
      send: providerSend,
    } satisfies CommsProvider<'email'>);
    registerCommsProvider({
      key: 'ses',
      channel: 'email',
      supports: { html: true, text: true },
      validateConfig: () => {},
      send: sesProviderSend,
    } satisfies CommsProvider<'email'>);

    const payload = makePayload();
    await expect(send(payload)).rejects.toThrow('POSTMARK_API_KEY is required');

    const rows = await knexClient('app.comms_deliveries').where({
      recipient_address: payload.recipients[0].address,
    });
    expect(rows).toHaveLength(0);
    expect(sesProviderSend).not.toHaveBeenCalled();
  });

  it('uses the explicit dev email provider as a no-op in test/local', async () => {
    resetCommsProvidersForTest();
    registerCommsProvider(devEmailProvider);
    process.env.EMAIL_PROVIDER = 'dev';

    const result = await sendAndTrack(makePayload());
    const deliveryId = result.deliveries[0].id;

    expect(result.deliveries[0].providerKey).toBe('dev');
    await expect(processCommsDelivery(deliveryId)).resolves.toEqual({
      status: 'sent',
    });

    const row = await knexClient('app.comms_deliveries')
      .where({ id: deliveryId })
      .first('status', 'provider_key', 'provider_message_id');

    expect(row?.status).toBe('sent');
    expect(row?.provider_key).toBe('dev');
    expect(row?.provider_message_id).toContain('dev-email:');
  });

  it('rejects unknown configured email providers before inserting delivery', async () => {
    process.env.EMAIL_PROVIDER = 'missing-provider';
    const payload = makePayload();

    await expect(send(payload)).rejects.toThrow(
      'Configured comms provider missing-provider is not registered for channel email',
    );

    const rows = await knexClient('app.comms_deliveries').where({
      recipient_address: payload.recipients[0].address,
    });
    expect(rows).toHaveLength(0);
  });

  it('rejects configured provider with invalid config before inserting delivery', async () => {
    registerCommsProvider({
      key: 'broken-email',
      channel: 'email',
      supports: { html: true, text: true },
      validateConfig: () => {
        throw new Error('BROKEN_EMAIL_KEY is required');
      },
      send: providerSend,
    } satisfies CommsProvider<'email'>);
    process.env.EMAIL_PROVIDER = 'broken-email';
    const payload = makePayload();

    await expect(send(payload)).rejects.toThrow('BROKEN_EMAIL_KEY is required');

    const rows = await knexClient('app.comms_deliveries').where({
      recipient_address: payload.recipients[0].address,
    });
    expect(rows).toHaveLength(0);
  });

  it('scanner re-enqueues due queued or failed deliveries', async () => {
    const result = await sendAndTrack(makePayload());
    const deliveryId = result.deliveries[0].id;

    await knexClient('app.comms_deliveries').where({ id: deliveryId }).update({
      status: 'failed',
      next_attempt_at: knexClient.raw(`now() - interval '1 minute'`),
      updated_at: knexClient.fn.now(),
    });

    await expect(enqueueDueCommsDeliveries(10)).resolves.toEqual({
      scanned: 1,
      enqueued: 1,
    });
  });

  it('purges only terminal deliveries older than retention', async () => {
    const oldSent = await insertDeliveryForRetentionTest({
      status: 'sent',
      daysOld: 30,
    });
    const oldDead = await insertDeliveryForRetentionTest({
      status: 'dead',
      daysOld: 30,
    });
    const oldQueued = await insertDeliveryForRetentionTest({
      status: 'queued',
      daysOld: 30,
    });
    const recentSent = await insertDeliveryForRetentionTest({
      status: 'sent',
      daysOld: 1,
    });

    await expect(
      purgeTerminalCommsDeliveries({ retentionDays: 7 }),
    ).resolves.toEqual({
      deleted: 2,
      retentionDays: 7,
    });

    const remaining = await knexClient('app.comms_deliveries')
      .whereIn('id', [oldSent, oldDead, oldQueued, recentSent])
      .orderBy('id')
      .pluck('id');

    expect(remaining.sort()).toEqual([oldQueued, recentSent].sort());
    deliveryIds.splice(
      0,
      deliveryIds.length,
      ...deliveryIds.filter((id) => remaining.includes(id)),
    );
  });

  it('sends admin alerts through comms without notification data', async () => {
    process.env.ADMIN_ALERT_EMAILS = 'ops@example.com, founder@example.com';

    const result = await alertAdmins({
      idempotencyKey: `admin-alert:${randomUUID()}`,
      eventType: 'ledger.validation_failed',
      title: 'Ledger validation failed',
      body: 'A ledger entry failed validation.',
      data: { ledgerEntryId: randomUUID() },
    });
    deliveryIds.push(...result.deliveries.map((delivery) => delivery.id));

    expect(result.deliveries).toHaveLength(2);
    expect(result.deliveries.map((delivery) => delivery.channel)).toEqual([
      'email',
      'email',
    ]);
    expect(result.deliveries[0].correlation.source).toBe('admin_alert');
    expect(result.deliveries[0].templateKey).toBe('admin.alert');
  });

  it('rejects notification-shaped correlation payloads', async () => {
    const payload = makePayload({
      correlation: {
        source: 'notification',
        id: randomUUID(),
        recipientUserId: randomUUID(),
      } as unknown as CommsSendPayload['correlation'],
    });

    await expect(send(payload)).rejects.toThrow();
  });

  it('rejects digest delivery mode and batch keys', async () => {
    await expect(
      send({
        ...makePayload(),
        deliveryMode: 'digest',
      } as unknown as CommsSendPayload),
    ).rejects.toThrow();

    await expect(
      send({
        ...makePayload(),
        batchKey: `digest:${randomUUID()}`,
      } as unknown as CommsSendPayload),
    ).rejects.toThrow();
  });
});
