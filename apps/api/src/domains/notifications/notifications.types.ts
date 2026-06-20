import { z } from 'zod';

import { commsChannelSchema } from '../../features/comms/comms.types.js';

export const NOTIFICATION_TYPE = {
  WORK_ASSIGNED: 'work.assigned',
  WORK_REASSIGNED: 'work.reassigned',
  WORK_OVERDUE: 'work.overdue',
  BANK_RECONNECT_REQUIRED: 'bank.reconnect_required',
  CLIENT_QUERY_REQUIRES_RESPONSE: 'client_query.requires_response',
  CLOSE_APPROVAL_REQUESTED: 'close.approval_requested',
  CLOSE_APPROVAL_REJECTED: 'close.approval_rejected',
  CLOSE_PACKAGE_STALE: 'close.package_stale',
  REPORT_DELIVERY_FAILED: 'report.delivery_failed',
  SYNC_FAILURE_REQUIRES_ACTION: 'sync.failure_requires_action',
  USER_PROFILE_PICTURE_UPDATE_FAILED: 'user.profile_picture_update_failed',
} as const;
export type NotificationType =
  (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export const NOTIFICATION_CHANNEL = {
  IN_APP: 'in_app',
  EMAIL: 'email',
} as const;

export const notificationDeliveryChannelSchema = z.union([
  z.literal(NOTIFICATION_CHANNEL.IN_APP),
  commsChannelSchema,
]);
export type NotificationDeliveryChannel = z.infer<
  typeof notificationDeliveryChannelSchema
>;

export const notificationDeliveryPolicySchema = z
  .discriminatedUnion('mode', [
    z
      .object({
        mode: z.literal('default'),
      })
      .strict(),
    z
      .object({
        mode: z.literal('only'),
        channels: z.array(notificationDeliveryChannelSchema).min(1).max(10),
      })
      .strict(),
    z
      .object({
        mode: z.literal('except'),
        channels: z.array(notificationDeliveryChannelSchema).min(1).max(10),
      })
      .strict(),
  ])
  .default({ mode: 'default' });
export type NotificationDeliveryPolicy = z.input<
  typeof notificationDeliveryPolicySchema
>;
export type ParsedNotificationDeliveryPolicy = z.output<
  typeof notificationDeliveryPolicySchema
>;

export const notificationPrioritySchema = z.enum([
  'low',
  'normal',
  'high',
  'critical',
]);
export type NotificationPriority = z.infer<typeof notificationPrioritySchema>;

export const notificationEventScopeSchema = z.enum(['company', 'global']);
export type NotificationEventScope = z.infer<
  typeof notificationEventScopeSchema
>;

export const notificationReadPolicySchema = z.enum([
  'auto_on_view',
  'explicit',
]);
export type NotificationReadPolicy = z.infer<
  typeof notificationReadPolicySchema
>;

export const notificationDeliveryModeSchema = z.enum(['off', 'immediate']);
export type NotificationDeliveryMode = z.infer<
  typeof notificationDeliveryModeSchema
>;

export type NotificationChannel = NotificationDeliveryChannel | (string & {});

const notificationTypeValues = Object.values(NOTIFICATION_TYPE) as [
  NotificationType,
  ...NotificationType[],
];
export const notificationTypeSchema = z.enum(notificationTypeValues);

export const notificationDestinationSchema = z.record(z.string(), z.unknown());

export const notificationSourceEntitySchema = z
  .object({
    type: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9_.-]*$/),
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

export const notifyEventSchema = z.object({
  recipientUserId: z.uuid(),
  firmCompanyId: z.uuid().nullish(),
  clientCompanyId: z.uuid().nullish(),
  eventType: notificationTypeSchema,
  priority: notificationPrioritySchema.default('normal'),
  readPolicy: notificationReadPolicySchema.optional(),
  title: z.string().trim().min(1),
  body: z.string().trim().min(1).nullish(),
  destination: notificationDestinationSchema.default({}),
  sourceEntity: notificationSourceEntitySchema.nullish(),
  activityEventId: z.uuid().nullish(),
  workItemId: z.uuid().nullish(),
  workItemSubjectId: z.uuid().nullish(),
  idempotencyKey: z.string().trim().min(1),
  occurredAt: z.iso.datetime().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
  deliveryPolicy: notificationDeliveryPolicySchema,
});
export type NotifyEvent = z.input<typeof notifyEventSchema>;
export type ParsedNotifyEvent = z.output<typeof notifyEventSchema>;

export interface NotificationRow {
  id: string;
  recipient_user_id: string;
  firm_company_id: string | null;
  client_company_id: string | null;
  event_type: string;
  priority: NotificationPriority;
  read_policy: NotificationReadPolicy;
  title: string;
  body: string | null;
  destination: unknown;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_entity_key: string | null;
  activity_event_id: string | null;
  work_item_id: string | null;
  work_item_subject_id: string | null;
  idempotency_key: string;
  seen_at: Date | string | null;
  read_at: Date | string | null;
  archived_at: Date | string | null;
  occurred_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface Notification {
  id: string;
  recipientUserId: string;
  firmCompanyId: string | null;
  clientCompanyId: string | null;
  eventType: string;
  priority: NotificationPriority;
  readPolicy: NotificationReadPolicy;
  title: string;
  body: string | null;
  destination: Record<string, unknown>;
  sourceEntity: {
    type: string;
    id: string | null;
    key: string | null;
  } | null;
  activityEventId: string | null;
  workItemId: string | null;
  workItemSubjectId: string | null;
  idempotencyKey: string;
  seenAt: string | null;
  readAt: string | null;
  archivedAt: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationCounter {
  unreadCount: number;
  lastUnreadAt: string | null;
}

export interface NotificationFeedResult {
  items: Notification[];
  nextCursor: string | null;
}

export interface NotifyResult {
  notification: Notification | null;
  inserted: boolean;
  suppressed: boolean;
  commsRequested: number;
}

export interface NotificationPreference {
  userId: string;
  notificationType: string;
  channel: NotificationChannel;
  deliveryMode: NotificationDeliveryMode;
  source: 'user' | 'default';
}
