import { z } from 'zod';

export const ACTIVITY_EVENT_TYPE = {
  BANK_TRANSACTIONS_IMPORTED: 'bank_transactions_imported',
  BANK_TRANSACTIONS_SYNCED: 'bank_transactions_synced',
  CATEGORIZATION_SUGGESTION_CREATED: 'categorization_suggestion_created',
  CATEGORIZATION_SUGGESTION_REPLACED: 'categorization_suggestion_replaced',
  CATEGORIZATION_CANDIDATE_REJECTED: 'categorization_candidate_rejected',
  MANUAL_CATEGORIZATION_POSTED: 'manual_categorization_posted',
  CATEGORIZATION_CANDIDATE_AUTOPOSTED: 'categorization_candidate_autoposted',
  JOURNAL_CREATED: 'journal_created',
  JOURNAL_UPDATED: 'journal_updated',
  JOURNAL_VOIDED: 'journal_voided',
  JOURNAL_POSTED: 'journal_posted',
  CLOSE_DECISION_RECORDED: 'close_decision_recorded',
} as const;

export type ActivityEventType =
  (typeof ACTIVITY_EVENT_TYPE)[keyof typeof ACTIVITY_EVENT_TYPE];

export const activityEventTypeSchema = z.enum([
  ACTIVITY_EVENT_TYPE.BANK_TRANSACTIONS_IMPORTED,
  ACTIVITY_EVENT_TYPE.BANK_TRANSACTIONS_SYNCED,
  ACTIVITY_EVENT_TYPE.CATEGORIZATION_SUGGESTION_CREATED,
  ACTIVITY_EVENT_TYPE.CATEGORIZATION_SUGGESTION_REPLACED,
  ACTIVITY_EVENT_TYPE.CATEGORIZATION_CANDIDATE_REJECTED,
  ACTIVITY_EVENT_TYPE.MANUAL_CATEGORIZATION_POSTED,
  ACTIVITY_EVENT_TYPE.CATEGORIZATION_CANDIDATE_AUTOPOSTED,
  ACTIVITY_EVENT_TYPE.JOURNAL_CREATED,
  ACTIVITY_EVENT_TYPE.JOURNAL_UPDATED,
  ACTIVITY_EVENT_TYPE.JOURNAL_VOIDED,
  ACTIVITY_EVENT_TYPE.JOURNAL_POSTED,
  ACTIVITY_EVENT_TYPE.CLOSE_DECISION_RECORDED,
]);

export const activityActorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), userId: z.uuid() }),
  z.object({ type: z.literal('system') }),
]);
export type ActivityActor = z.infer<typeof activityActorSchema>;

export const activitySourceEntitySchema = z
  .object({
    type: z.string().regex(/^[a-z0-9_]+$/),
    id: z.uuid().optional(),
    key: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasId = value.id != null;
    const hasKey = value.key != null;
    if (hasId === hasKey) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: 'Provide exactly one source entity id or key',
      });
    }
  });
export type ActivitySourceEntity = z.infer<typeof activitySourceEntitySchema>;

export const activityEventSchema = z
  .object({
    firmCompanyId: z.uuid(),
    clientCompanyId: z.uuid(),
    actor: activityActorSchema,
    sourceEntity: activitySourceEntitySchema,
    ledgerTransactionId: z.uuid().nullish(),
    fiscalCalendarId: z.uuid().nullish(),
    workType: z.string().trim().min(1).nullish(),
    workItemId: z.uuid().nullish(),
    workItemSubjectId: z.uuid().nullish(),
    eventType: activityEventTypeSchema,
    itemCount: z.number().int().positive().nullish(),
    amount: z.union([z.number(), z.string()]).nullish(),
    currencyId: z.uuid().nullish(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    idempotencyKey: z.string().trim().min(1),
    occurredAt: z.iso.datetime().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.amount != null && value.currencyId == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['currencyId'],
        message: 'currencyId is required when amount is provided',
      });
    }
  });
export type ActivityEvent = z.infer<typeof activityEventSchema>;

export const activityEventRequestedPayloadSchema = z.object({
  event: activityEventSchema,
});
export type ActivityEventRequestedPayload = z.infer<
  typeof activityEventRequestedPayloadSchema
>;
