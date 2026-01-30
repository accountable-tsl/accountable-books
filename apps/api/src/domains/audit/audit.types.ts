import z from 'zod';

export const auditEventEntityType = z.enum(['bank_transaction', 'journal']);
export type AuditEventEntityType = z.infer<typeof auditEventEntityType>;

export const auditEventActorType = z.enum([
  'user',
  'system',
  'api_key',
  'integration',
]);
export type AuditEventActorType = z.infer<typeof auditEventActorType>;

const auditEventSource = z.enum(['web', 'api', 'worker', 'webhook', 'import']);
export type auditEventSource = z.infer<typeof auditEventSource>;

const auditEventBase = z.object({
  id: z.string(),
  company_id: z.string(),

  event_at: z.iso.datetime(),
  event_sequence: z.number().optional(),

  // Subject
  entity_type: z.string(),
  entity_id: z.string(),

  // Action
  action: z.string(), // Namespaced: 'journal.post', 'bank_transaction.import'

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
});

export const createAuditEvent = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    ...auditEventBase.shape,
    payload: schema,
  });

export type CreateAuditEventInput<T> = z.infer<
  ReturnType<typeof createAuditEvent<z.ZodType<T>>>
>;
