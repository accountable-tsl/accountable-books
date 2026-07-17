import { z } from 'zod';

import {
  NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE,
} from './notifications.types.js';

import type {
  NotificationDeliveryChannel,
  NotificationDeliveryMode,
  NotificationEventScope,
  NotificationPriority,
  NotificationReadPolicy,
  NotificationType,
  ParsedNotifyEvent,
} from './notifications.types.js';

export interface NotificationDeliverySurfacePolicy {
  enabled: boolean;
  defaultMode: NotificationDeliveryMode;
}

export interface NotificationProductDeliveryPolicy {
  inApp: NotificationDeliverySurfacePolicy;
  external: NotificationDeliverySurfacePolicy;
}

export interface NotificationEventDefinition {
  eventType: NotificationType;
  scope: NotificationEventScope;
  defaultPriority: NotificationPriority;
  defaultReadPolicy: NotificationReadPolicy;
  delivery: NotificationProductDeliveryPolicy;
  dataSchema: z.ZodType<unknown>;
}

const genericNotificationDataSchema = z.record(z.string(), z.unknown());

const workAssignedDataSchema = z
  .object({
    workType: z.string().trim().min(1).optional(),
    activeSubjectCount: z.number().int().nonnegative().optional(),
  })
  .passthrough();

/**
 * Notification scope policy:
 * - Product, domain, and work events are company-scoped by default.
 * - User/account events must explicitly opt into global scope.
 * - Ops alerts are not notifications; they must use alertAdmins().
 *
 * Do not attach fake company IDs to global events just to simplify counters or
 * feed queries. The event type owns its scope.
 */
function companyAttentionDefinition(
  eventType: NotificationType,
  overrides: Partial<NotificationProductDeliveryPolicy> = {},
): NotificationEventDefinition {
  return {
    eventType,
    scope: 'company',
    defaultPriority: 'normal',
    defaultReadPolicy: 'auto_on_view',
    delivery: {
      inApp: {
        enabled: true,
        defaultMode: 'immediate',
        ...overrides.inApp,
      },
      external: {
        enabled: true,
        defaultMode: 'off',
        ...overrides.external,
      },
    },
    dataSchema: genericNotificationDataSchema,
  };
}

function globalAttentionDefinition(
  eventType: NotificationType,
): NotificationEventDefinition {
  return {
    ...companyAttentionDefinition(eventType),
    scope: 'global',
  };
}

export const NOTIFICATION_EVENT_REGISTRY = {
  [NOTIFICATION_TYPE.WORK_ASSIGNED]: {
    ...companyAttentionDefinition(NOTIFICATION_TYPE.WORK_ASSIGNED, {
      external: { enabled: true, defaultMode: 'immediate' },
    }),
    dataSchema: workAssignedDataSchema,
  },
  [NOTIFICATION_TYPE.WORK_REASSIGNED]: companyAttentionDefinition(
    NOTIFICATION_TYPE.WORK_REASSIGNED,
    {
      external: { enabled: true, defaultMode: 'immediate' },
    },
  ),
  [NOTIFICATION_TYPE.WORK_OVERDUE]: {
    ...companyAttentionDefinition(NOTIFICATION_TYPE.WORK_OVERDUE, {
      external: { enabled: true, defaultMode: 'immediate' },
    }),
    defaultPriority: 'high',
    defaultReadPolicy: 'explicit',
  },
  [NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED]: companyAttentionDefinition(
    NOTIFICATION_TYPE.BANK_RECONNECT_REQUIRED,
    {
      external: { enabled: true, defaultMode: 'immediate' },
    },
  ),
  [NOTIFICATION_TYPE.CLIENT_QUERY_REQUIRES_RESPONSE]:
    companyAttentionDefinition(
      NOTIFICATION_TYPE.CLIENT_QUERY_REQUIRES_RESPONSE,
    ),
  [NOTIFICATION_TYPE.CLOSE_APPROVAL_REQUESTED]: companyAttentionDefinition(
    NOTIFICATION_TYPE.CLOSE_APPROVAL_REQUESTED,
    {
      external: { enabled: true, defaultMode: 'immediate' },
    },
  ),
  [NOTIFICATION_TYPE.CLOSE_APPROVAL_REJECTED]: companyAttentionDefinition(
    NOTIFICATION_TYPE.CLOSE_APPROVAL_REJECTED,
    {
      external: { enabled: true, defaultMode: 'immediate' },
    },
  ),
  [NOTIFICATION_TYPE.CLOSE_PACKAGE_STALE]: companyAttentionDefinition(
    NOTIFICATION_TYPE.CLOSE_PACKAGE_STALE,
    {
      external: { enabled: true, defaultMode: 'immediate' },
    },
  ),
  [NOTIFICATION_TYPE.REPORT_DELIVERY_FAILED]: {
    ...companyAttentionDefinition(NOTIFICATION_TYPE.REPORT_DELIVERY_FAILED, {
      external: { enabled: true, defaultMode: 'immediate' },
    }),
    defaultPriority: 'high',
    defaultReadPolicy: 'explicit',
  },
  [NOTIFICATION_TYPE.SYNC_FAILURE_REQUIRES_ACTION]: {
    ...companyAttentionDefinition(
      NOTIFICATION_TYPE.SYNC_FAILURE_REQUIRES_ACTION,
      {
        external: { enabled: true, defaultMode: 'immediate' },
      },
    ),
    defaultPriority: 'high',
    defaultReadPolicy: 'explicit',
  },
  [NOTIFICATION_TYPE.BANK_TRANSACTION_SUPERSEDED_REVIEW]: {
    ...companyAttentionDefinition(
      NOTIFICATION_TYPE.BANK_TRANSACTION_SUPERSEDED_REVIEW,
      {
        external: { enabled: true, defaultMode: 'immediate' },
      },
    ),
    defaultPriority: 'high',
    defaultReadPolicy: 'explicit',
  },
  [NOTIFICATION_TYPE.BANK_TRANSACTION_REMOVED_REVIEW]: {
    ...companyAttentionDefinition(
      NOTIFICATION_TYPE.BANK_TRANSACTION_REMOVED_REVIEW,
      {
        external: { enabled: true, defaultMode: 'immediate' },
      },
    ),
    defaultPriority: 'high',
    defaultReadPolicy: 'explicit',
  },
  [NOTIFICATION_TYPE.BANK_REPLACEMENT_UNMATCHED_REVIEW]: {
    ...companyAttentionDefinition(
      NOTIFICATION_TYPE.BANK_REPLACEMENT_UNMATCHED_REVIEW,
      {
        external: { enabled: true, defaultMode: 'immediate' },
      },
    ),
    defaultPriority: 'high',
    defaultReadPolicy: 'explicit',
  },
  [NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_AVAILABLE]: {
    ...companyAttentionDefinition(
      NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_AVAILABLE,
      {
        external: { enabled: true, defaultMode: 'immediate' },
      },
    ),
    defaultPriority: 'normal',
    defaultReadPolicy: 'explicit',
  },
  [NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_EXPIRING_SOON]: {
    ...companyAttentionDefinition(
      NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_EXPIRING_SOON,
      {
        external: { enabled: true, defaultMode: 'immediate' },
      },
    ),
    defaultPriority: 'high',
    defaultReadPolicy: 'explicit',
  },
  [NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_EXPIRED]: {
    ...companyAttentionDefinition(
      NOTIFICATION_TYPE.BANK_HISTORY_IMPORT_EXPIRED,
      {
        external: { enabled: true, defaultMode: 'immediate' },
      },
    ),
    defaultPriority: 'normal',
    defaultReadPolicy: 'auto_on_view',
  },
  [NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED]:
    globalAttentionDefinition(
      NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED,
    ),
} satisfies Record<NotificationType, NotificationEventDefinition>;

export function listNotificationEventDefinitions(): NotificationEventDefinition[] {
  return Object.values(NOTIFICATION_EVENT_REGISTRY);
}

export function isNotificationEventType(
  eventType: string,
): eventType is NotificationType {
  return eventType in NOTIFICATION_EVENT_REGISTRY;
}

export function getNotificationEventDefinition(
  eventType: NotificationType,
): NotificationEventDefinition;
export function getNotificationEventDefinition(
  eventType: string,
): NotificationEventDefinition | null;
export function getNotificationEventDefinition(
  eventType: string,
): NotificationEventDefinition | null {
  if (!isNotificationEventType(eventType)) {
    return null;
  }

  return NOTIFICATION_EVENT_REGISTRY[eventType];
}

export function getDefaultNotificationDeliveryMode(
  notificationType: string,
  channel: NotificationDeliveryChannel | string,
): NotificationDeliveryMode {
  const definition = getNotificationEventDefinition(notificationType);
  if (!definition) {
    return 'off';
  }

  if (channel === NOTIFICATION_CHANNEL.IN_APP) {
    return definition.delivery.inApp.enabled
      ? definition.delivery.inApp.defaultMode
      : 'off';
  }

  if (channel === NOTIFICATION_CHANNEL.EMAIL) {
    return definition.delivery.external.enabled
      ? definition.delivery.external.defaultMode
      : 'off';
  }

  return 'off';
}

export function getDefaultNotificationDeliveryModes(
  notificationType: NotificationType,
): Map<NotificationDeliveryChannel, NotificationDeliveryMode>;
export function getDefaultNotificationDeliveryModes(
  notificationType: string,
): Map<NotificationDeliveryChannel, NotificationDeliveryMode>;
export function getDefaultNotificationDeliveryModes(
  notificationType: string,
): Map<NotificationDeliveryChannel, NotificationDeliveryMode> {
  const definition = getNotificationEventDefinition(notificationType);
  if (!definition) {
    return new Map();
  }

  return new Map([
    [
      NOTIFICATION_CHANNEL.IN_APP,
      getDefaultNotificationDeliveryMode(
        definition.eventType,
        NOTIFICATION_CHANNEL.IN_APP,
      ),
    ],
    [
      NOTIFICATION_CHANNEL.EMAIL,
      getDefaultNotificationDeliveryMode(
        definition.eventType,
        NOTIFICATION_CHANNEL.EMAIL,
      ),
    ],
  ]);
}

export function parseNotificationEventData(
  event: ParsedNotifyEvent,
): Record<string, unknown> {
  const definition = getNotificationEventDefinition(event.eventType);
  const parsed = definition.dataSchema.parse(event.data);

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  return {};
}
