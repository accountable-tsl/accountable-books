import './providers/index.js';

import type { Job } from 'bullmq';
import type { Knex } from 'knex';
import { Worker } from 'bullmq';

import { ENV } from '../../config/env.js';
import { knexClient } from '../../db/knexClient.js';
import { redis } from '../../lib/redis.js';
import { runWithJobContext } from '../../shared/telemetry/request-context.js';
import { getLogger } from '../../shared/utils/logger.js';
import {
  commsDispatchJobSchema,
  commsDispatchQueue,
  enqueueCommsDelivery,
  scheduleCommsDeliveryPurge,
  scheduleCommsDueDeliveryScan,
} from './comms.queue.js';
import { purgeTerminalCommsDeliveries } from './comms.service.js';
import { commsCorrelationSchema } from './comms.types.js';
import { getCommsProvider, resolveCommsProvider } from './providers/index.js';
import { resolveCommsTemplate } from './templates/comms-template-registry.js';

import type { CommsDeliveryRow, CommsPriority } from './comms.types.js';
import type { CommsProvider } from './providers/index.js';

const DELIVERIES_TABLE = 'app.comms_deliveries';
const COMMS_MAX_DELIVERY_ATTEMPTS = 3;

const logger = getLogger({
  component: 'comms-worker',
  processSource: 'worker',
});

const COMMS_WORKER_OPTIONS = {
  connection: redis,
  concurrency: Number(ENV.COMMS_DISPATCH_CONCURRENCY) || 5,
  drainDelay: 300,
  stalledInterval: 300000,
  maxStalledCount: 1,
  lockDuration: 30000,
  lockRenewTime: 15000,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function jsonObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (value == null) {
    return null;
  }
  return { value };
}

async function claimDelivery(
  deliveryId: string,
  client: Knex,
): Promise<{
  row: CommsDeliveryRow;
  provider: CommsProvider;
} | null> {
  return client.transaction(async (trx) => {
    const row = await trx<CommsDeliveryRow>(DELIVERIES_TABLE)
      .where({ id: deliveryId })
      .forUpdate()
      .first('*');

    if (!row) {
      throw new Error(`Comms delivery not found: ${deliveryId}`);
    }

    if (['sent', 'delivered', 'dead', 'suppressed'].includes(row.status)) {
      return null;
    }

    if (!['queued', 'failed'].includes(row.status)) {
      return null;
    }

    const provider = row.provider_key
      ? getCommsProvider(row.provider_key)
      : resolveCommsProvider(row.channel);

    if (provider.channel !== row.channel) {
      throw new Error(
        `Provider ${provider.key} cannot send channel ${row.channel}`,
      );
    }

    const [claimed] = await trx<CommsDeliveryRow>(DELIVERIES_TABLE)
      .where({ id: deliveryId })
      .update({
        status: 'sending',
        provider_key: provider.key,
        attempt_count: trx.raw('attempt_count + 1'),
        last_error: null,
        updated_at: trx.fn.now(),
      })
      .returning('*');

    return claimed ? { row: claimed, provider } : null;
  });
}

async function markDeliverySent(input: {
  deliveryId: string;
  providerMessageId?: string;
  providerResponse?: unknown;
  client: Knex;
}): Promise<void> {
  await input
    .client(DELIVERIES_TABLE)
    .where({ id: input.deliveryId })
    .update({
      status: 'sent',
      provider_message_id: input.providerMessageId ?? null,
      provider_response: jsonObjectOrNull(input.providerResponse),
      sent_at: input.client.fn.now(),
      failed_at: null,
      next_attempt_at: null,
      last_error: null,
      updated_at: input.client.fn.now(),
    });
}

async function markDeliveryFailed(input: {
  delivery: CommsDeliveryRow;
  error: unknown;
  client: Knex;
}): Promise<'failed' | 'dead'> {
  const exhausted =
    Number(input.delivery.attempt_count) >= COMMS_MAX_DELIVERY_ATTEMPTS;
  const backoffSeconds = Math.min(
    300,
    2 ** Math.min(Number(input.delivery.attempt_count), 8),
  );
  const status = exhausted ? 'dead' : 'failed';

  await input
    .client(DELIVERIES_TABLE)
    .where({ id: input.delivery.id })
    .update({
      status,
      last_error: errorMessage(input.error).slice(0, 2000),
      failed_at: input.client.fn.now(),
      next_attempt_at: exhausted
        ? null
        : input.client.raw(`now() + (interval '1 second' * ?)`, [
            backoffSeconds,
          ]),
      updated_at: input.client.fn.now(),
    });

  return status;
}

export async function processCommsDelivery(
  deliveryId: string,
  client: Knex = knexClient,
): Promise<{ status: 'sent' | 'failed' | 'dead' | 'skipped' }> {
  const claimed = await claimDelivery(deliveryId, client);
  if (!claimed) {
    return { status: 'skipped' };
  }

  const { row, provider } = claimed;

  try {
    const correlation = commsCorrelationSchema.parse(row.correlation);
    const template = resolveCommsTemplate({
      eventType: row.template_key,
      channel: row.channel,
    });
    const payloadData =
      row.payload_data &&
      typeof row.payload_data === 'object' &&
      !Array.isArray(row.payload_data)
        ? (row.payload_data as Record<string, unknown>)
        : {};
    const message = template.render({
      data: payloadData,
      to: row.recipient_address,
    });
    const result = await provider.send(message);

    await markDeliverySent({
      deliveryId,
      providerMessageId: result.providerMessageId,
      providerResponse: result.raw,
      client,
    });

    logger.info(
      { deliveryId, providerKey: provider.key, correlation },
      'Comms delivery sent',
    );
    return { status: 'sent' };
  } catch (error) {
    const status = await markDeliveryFailed({
      delivery: row,
      error,
      client,
    });
    logger.error(
      {
        deliveryId,
        status,
        error: errorMessage(error),
      },
      'Comms delivery failed',
    );

    if (status === 'failed') {
      throw error;
    }

    return { status };
  }
}

export async function enqueueDueCommsDeliveries(
  limit = 100,
  client: Knex = knexClient,
): Promise<{ scanned: number; enqueued: number }> {
  const rows = await client<CommsDeliveryRow>(DELIVERIES_TABLE)
    .whereIn('status', ['queued', 'failed'])
    .andWhere((query) => {
      query
        .where('next_attempt_at', '<=', client.fn.now())
        .orWhereNull('next_attempt_at');
    })
    .orderBy('next_attempt_at', 'asc', 'first')
    .orderBy('created_at', 'asc')
    .limit(limit)
    .select('id', 'priority');

  for (const row of rows) {
    await enqueueCommsDelivery(row.id, {
      priority: priorityForCommsPriority(row.priority),
    });
  }

  return { scanned: rows.length, enqueued: rows.length };
}

async function processCommsJob(job: Job<unknown>): Promise<void> {
  const data = commsDispatchJobSchema.parse(job.data);

  if (data.type === 'delivery') {
    await processCommsDelivery(data.deliveryId);
    return;
  }

  if (data.type === 'scan_due_deliveries') {
    const result = await enqueueDueCommsDeliveries(data.limit);
    if (result.enqueued > 0) {
      logger.info({ jobId: job.id, ...result }, 'Comms due delivery scan completed');
    }
    return;
  }

  const result = await purgeTerminalCommsDeliveries({
    retentionDays: data.retentionDays,
  });
  if (result.deleted > 0) {
    logger.info(
      { jobId: job.id, ...result },
      'Comms delivery purge completed',
    );
  }
}

export function startCommsDispatchWorker(concurrency?: number): Worker {
  scheduleCommsDueDeliveryScan().catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to register comms due delivery scanner',
    );
  });
  scheduleCommsDeliveryPurge().catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to register comms delivery purge scheduler',
    );
  });

  const worker = new Worker(
    'comms-dispatch',
    (job) => runWithJobContext(job, () => processCommsJob(job)),
    {
      ...COMMS_WORKER_OPTIONS,
      ...(concurrency ? { concurrency } : {}),
    },
  );

  worker.on('completed', (job) => {
    logger.info(
      { jobId: job.id, jobName: job.name },
      'Comms dispatch job completed',
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, jobName: job?.name, error: err.message },
      'Comms dispatch job failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Comms dispatch worker error');
  });

  return worker;
}

function priorityForCommsPriority(priority: CommsPriority): number {
  switch (priority) {
    case 'critical':
      return 1;
    case 'high':
      return 3;
    case 'normal':
      return 5;
    case 'low':
      return 8;
  }
}

export async function closeCommsSchedulers(): Promise<void> {
  if (typeof commsDispatchQueue.removeJobScheduler !== 'function') {
    return;
  }

  for (const schedulerId of [
    'comms-due-delivery-scan',
    'comms-delivery-purge',
  ]) {
    try {
      await commsDispatchQueue.removeJobScheduler(schedulerId);
    } catch (error) {
      logger.warn(
        {
          schedulerId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to remove comms scheduler',
      );
    }
  }
}
