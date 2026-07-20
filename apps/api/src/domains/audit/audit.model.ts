import type { Knex } from 'knex';
import z from 'zod';

import { knexClient } from '../../db/knexClient.js';
import { getSystemUser } from '../users/users.model.js';
import { writeAuditEventInput } from './audit.types.js';

import type {
  AuditActorInput,
  AuditContextInput,
  AuditEventActorType,
  AuditEventEntityType,
  AuditEventSource,
  WriteAuditEventInputCamel,
  WriteAuditEventInputSnake,
} from './audit.types.js';

const AUDIT_INSERT_CHUNK = 500;

function toAuditEventRow<T>(
  validated: WriteAuditEventInputSnake<T>,
): Record<string, unknown> {
  return {
    company_id: validated.company_id,
    entity_type: validated.entity_type,
    entity_id: validated.entity_id,
    action: validated.action,
    schema_version: validated.schema_version,
    payload: validated.payload,
    actor_type: validated.actor_type,
    actor_id: validated.actor_id,
    user_id: validated.user_id ?? null,
    impersonated_by_user_id: validated.impersonated_by_user_id ?? null,
    event_at: validated.event_at,
    source: validated.source,
    request_id: validated.request_id ?? null,
    correlation_id: validated.correlation_id ?? null,
    ip: validated.ip ?? null,
    user_agent: validated.user_agent ?? null,
    notes: validated.notes ?? null,
  };
}

/**
 * Central function for writing audit events to the database.
 *
 * All domain-specific audit helpers should call this function.
 * This ensures consistent behavior for:
 * - Payload validation (via Zod schema)
 * - Full params validation via writeAuditEventInput schema
 * - Future cross-cutting concerns (metrics, logging, async queue, etc.)
 *
 * @throws If validation fails - caller should let transaction rollback
 */
export async function writeAuditEvent<T extends z.ZodTypeAny>(
  payloadSchema: T,
  input: WriteAuditEventInputCamel<z.infer<T>>,
  trx?: Knex.Transaction,
): Promise<void> {
  const schema = writeAuditEventInput(payloadSchema);
  const validated = schema.parse(input) as WriteAuditEventInputSnake<
    z.infer<T>
  >;

  const db = trx ?? knexClient;
  await db('audit_events').insert(toAuditEventRow(validated));
}

/**
 * Bulk insert audit events with the same validation rules as {@link writeAuditEvent}.
 */
export async function writeAuditEventsBatch<T extends z.ZodTypeAny>(
  payloadSchema: T,
  inputs: WriteAuditEventInputCamel<z.infer<T>>[],
  trx: Knex.Transaction,
): Promise<void> {
  if (inputs.length === 0) return;

  const schema = writeAuditEventInput(payloadSchema);
  const rows = inputs.map((input) =>
    toAuditEventRow(
      schema.parse(input) as WriteAuditEventInputSnake<z.infer<T>>,
    ),
  );

  await trx.batchInsert('audit_events', rows, AUDIT_INSERT_CHUNK);
}

/**
 * Resolve a `users.id` for row attribution (`created_by_id`, `updated_by_id`).
 *
 * Audit events use `actorToAuditFields` and may keep `user_id` null for
 * non-user actors. Operational rows that require a user FK use this helper
 * instead — non-user actors map to the system user.
 */
export async function resolveActorUserId(
  actor: AuditActorInput,
  trx?: Knex.Transaction,
): Promise<string> {
  if (actor.type === 'user') return actor.userId;
  const systemUser = await getSystemUser({ trx });
  return systemUser.id;
}

// =============================================================================
// Domain Helper Factory
// =============================================================================

function actorToAuditFields(actor: AuditActorInput): {
  actorType: AuditEventActorType;
  actorId: string | null;
  userId: string | null;
  impersonatedByUserId?: string | null;
} {
  switch (actor.type) {
    case 'system':
      return { actorType: 'system', actorId: null, userId: null };
    case 'user':
      return {
        actorType: 'user',
        actorId: actor.userId,
        userId: actor.userId,
        impersonatedByUserId: actor.impersonatedByUserId ?? null,
      };
    case 'api_key':
      return { actorType: 'api_key', actorId: actor.apiKeyId, userId: null };
    case 'integration':
      return {
        actorType: 'integration',
        actorId: actor.integrationId,
        userId: null,
      };
    default: {
      // Exhaustiveness guard.

      const _never: never = actor;
      throw new Error('Unsupported actor type');
    }
  }
}

function contextToAuditFields(context?: AuditContextInput): {
  source: AuditEventSource;
  requestId: string | null;
  correlationId: string | null;
  ip: string | null;
  userAgent: string | null;
} {
  return {
    source: context?.source ?? 'api',
    requestId: context?.requestId ?? null,
    correlationId: context?.correlationId ?? null,
    ip: context?.ip ?? null,
    userAgent: context?.userAgent ?? null,
  };
}

/** Shared actor + request context fields for audit event rows. */
export function resolveAuditEventActorContext(
  actor: AuditActorInput,
  context?: AuditContextInput,
): ReturnType<typeof actorToAuditFields> &
  ReturnType<typeof contextToAuditFields> {
  return {
    ...actorToAuditFields(actor),
    ...contextToAuditFields(context),
  };
}

export function createAuditWriter<T extends z.ZodTypeAny>(options: {
  entityType: AuditEventEntityType;
  action: string;
  schemaVersion: string;
  payloadSchema: T;
}) {
  return async function writeDomainAuditEvent(input: {
    companyId: string;
    entityId: string;
    actor: AuditActorInput;
    payload: z.infer<T>;
    trx: Knex.Transaction;
    context?: AuditContextInput;
    notes?: string;
    eventAt?: string;
  }): Promise<void> {
    const fields = resolveAuditEventActorContext(input.actor, input.context);

    await writeAuditEvent(
      options.payloadSchema,
      {
        entityType: options.entityType,
        entityId: input.entityId,
        action: options.action,
        payload: input.payload,
        schemaVersion: options.schemaVersion,
        companyId: input.companyId,
        actorType: fields.actorType,
        actorId: fields.actorId,
        userId: fields.userId,
        impersonatedByUserId: fields.impersonatedByUserId,
        eventAt: input.eventAt ?? new Date().toISOString(),
        source: fields.source,
        requestId: fields.requestId,
        correlationId: fields.correlationId,
        ip: fields.ip,
        userAgent: fields.userAgent,
        notes: input.notes,
      },
      input.trx,
    );
  };
}
