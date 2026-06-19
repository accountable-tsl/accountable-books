import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';

import { writeOutboxIntent } from '../work/outbox.model.js';
import { resolveFirmCompanyId } from '../work/work-ownership.js';
import { OUTBOX_INTENT } from '../work/work.types.js';
import { activityEventSchema } from './activity.types.js';

import type { ActivityEvent } from './activity.types.js';

type ActivityEventIntentInput = Omit<
  ActivityEvent,
  'firmCompanyId' | 'idempotencyKey'
> & {
  firmCompanyId?: string;
  idempotencyKey?: string;
};

function sourceIdentity(input: ActivityEvent['sourceEntity']): string {
  return input.id ?? input.key ?? 'unknown';
}

function defaultIdempotencyKey(input: ActivityEventIntentInput): string {
  return [
    'activity',
    input.eventType,
    input.sourceEntity.type,
    sourceIdentity(input.sourceEntity),
    randomUUID(),
  ].join(':');
}

export function buildActivityEventScopeKey(idempotencyKey: string): string {
  return `${OUTBOX_INTENT.ACTIVITY_EVENT_REQUESTED}:${idempotencyKey}`;
}

export async function writeActivityEventIntent(
  trx: Knex.Transaction,
  input: ActivityEventIntentInput,
): Promise<{ idempotencyKey: string; scopeKey: string }> {
  const firmCompanyId =
    input.firmCompanyId ??
    (await resolveFirmCompanyId(trx, input.clientCompanyId));
  const idempotencyKey =
    input.idempotencyKey ?? defaultIdempotencyKey(input);

  const event = activityEventSchema.parse({
    ...input,
    firmCompanyId,
    idempotencyKey,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });
  const scopeKey = buildActivityEventScopeKey(event.idempotencyKey);

  await writeOutboxIntent(trx, {
    intentType: OUTBOX_INTENT.ACTIVITY_EVENT_REQUESTED,
    scopeKey,
    payload: { event },
  });

  return { idempotencyKey: event.idempotencyKey, scopeKey };
}
