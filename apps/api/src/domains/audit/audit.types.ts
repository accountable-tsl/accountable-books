import z from 'zod';

import { createCamelCaseSchemaWithExclusions } from '../../shared/index.js';

import type { SnakeToCamelCaseObject } from '../../shared/index.js';

export const auditEventEntityType = z.enum([
  'company',
  'bank_transaction',
  'journal',
  'ai',
  'task_evaluation',
  'support_access',
]);
export type AuditEventEntityType = z.infer<typeof auditEventEntityType>;

export const auditEventActorType = z.enum([
  'user',
  'system',
  'api_key',
  'integration',
]);
export type AuditEventActorType = z.infer<typeof auditEventActorType>;

export const auditEventSource = z.enum([
  'web',
  'api',
  'worker',
  'webhook',
  'import',
]);
export type AuditEventSource = z.infer<typeof auditEventSource>;

const auditEventBase = z
  .object({
    id: z.uuid().optional(),
    company_id: z.uuid(),

    event_at: z.iso.datetime(),

    // Subject
    entity_type: auditEventEntityType,
    entity_id: z.uuid(),

    // Action
    action: z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/), // Namespaced: 'journal.post', 'bank_transaction.import'

    // Actor
    actor_type: auditEventActorType,
    actor_id: z.uuid().nullable(), // nullable for system

    user_id: z.uuid().nullish(), // convenience if actor_type=user
    impersonated_by_user_id: z.uuid().nullish(),

    // Trace / Context
    request_id: z.string().nullish(),
    correlation_id: z.string().nullish(),
    ip: z.union([z.ipv4(), z.ipv6()]).nullish(),
    user_agent: z.string().nullish(),

    source: auditEventSource,

    // Payload
    payload: z.record(z.string(), z.unknown()),
    schema_version: z.string(),

    // Notes
    notes: z.string().nullish(),
  })
  .superRefine((v, ctx) => {
    // Keep validation aligned with DB check constraints to avoid insert-time failures.
    const isSystem = v.actor_type === 'system';
    const isUser = v.actor_type === 'user';

    if (isSystem) {
      if (v.actor_id !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['actor_id'],
          message: 'actor_id must be null when actor_type=system',
        });
      }
    } else {
      if (!v.actor_id) {
        ctx.addIssue({
          code: 'custom',
          path: ['actor_id'],
          message: 'actor_id is required when actor_type is not system',
        });
      }
    }

    if (isUser) {
      if (!v.user_id) {
        ctx.addIssue({
          code: 'custom',
          path: ['user_id'],
          message: 'user_id is required when actor_type=user',
        });
      }
      if (v.user_id && v.actor_id && v.user_id !== v.actor_id) {
        ctx.addIssue({
          code: 'custom',
          path: ['actor_id'],
          message: 'actor_id must equal user_id when actor_type=user',
        });
      }
    } else {
      if (v.user_id != null) {
        ctx.addIssue({
          code: 'custom',
          path: ['user_id'],
          message: 'user_id must be null when actor_type is not user',
        });
      }
    }
  });

export const auditEvent = z.object({
  ...auditEventBase.shape,
  id: z.uuid(),
  event_sequence: z.string(),
  created_at: z.iso.datetime(),
});
export type AuditEvent = z.infer<typeof auditEvent>;

export const writeAuditEventInput = <T extends z.ZodTypeAny>(schema: T) =>
  createCamelCaseSchemaWithExclusions(
    z.object({
      ...auditEventBase.shape,
      payload: schema,
    }),
    { excludeKeys: ['payload'] },
  );

export type WriteAuditEventInputSnake<T> = z.infer<
  ReturnType<typeof writeAuditEventInput<z.ZodType<T>>>
>;

export type WriteAuditEventInput<T> = WriteAuditEventInputSnake<T>;

export type WriteAuditEventInputCamel<T> = SnakeToCamelCaseObject<
  Omit<WriteAuditEventInputSnake<T>, 'payload'>
> & {
  payload: T;
};

// =============================================================================
// Shared Input Shapes (for domain-specific audit wrappers)
// =============================================================================

/**
 * Canonical actor input shape used across domains when writing audit events.
 * Domains should not redefine their own actor/source/context types.
 */
export type AuditActorInput =
  | { type: 'user'; userId: string; impersonatedByUserId?: string | null }
  | { type: 'system' }
  | { type: 'api_key'; apiKeyId: string }
  | { type: 'integration'; integrationId: string };

export interface AuditContextInput {
  source?: AuditEventSource;
  requestId?: string | null;
  correlationId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}
