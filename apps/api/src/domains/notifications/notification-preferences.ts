import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import {
  getDefaultNotificationDeliveryMode,
  getNotificationEventDefinition,
  listNotificationEventDefinitions,
} from './notification-event-registry.js';
import { NOTIFICATION_CHANNEL } from './notifications.types.js';

import type {
  NotificationChannel,
  NotificationDeliveryMode,
  NotificationPreference,
} from './notifications.types.js';

const PREFERENCES_TABLE = 'app.notification_preferences';
export const SUPPORTED_NOTIFICATION_PREFERENCE_CHANNELS = [
  NOTIFICATION_CHANNEL.IN_APP,
  NOTIFICATION_CHANNEL.EMAIL,
] as const;
export const SUPPORTED_NOTIFICATION_PREFERENCE_DELIVERY_MODES = [
  'off',
  'immediate',
] as const satisfies NotificationDeliveryMode[];

type SupportedPreferenceChannel =
  (typeof SUPPORTED_NOTIFICATION_PREFERENCE_CHANNELS)[number];

function isSupportedPreferenceChannel(
  channel: NotificationChannel,
): channel is SupportedPreferenceChannel {
  return SUPPORTED_NOTIFICATION_PREFERENCE_CHANNELS.some(
    (supportedChannel) => supportedChannel === channel,
  );
}

function isSupportedPreferenceDeliveryMode(
  deliveryMode: NotificationDeliveryMode,
): boolean {
  return SUPPORTED_NOTIFICATION_PREFERENCE_DELIVERY_MODES.some(
    (supportedMode) => supportedMode === deliveryMode,
  );
}

function codeDefaultFor(
  notificationType: string,
  channel: NotificationChannel,
): NotificationDeliveryMode {
  return getDefaultNotificationDeliveryMode(notificationType, channel);
}

function assertSupportedPreference(input: {
  notificationType: string;
  channel: NotificationChannel;
  deliveryMode?: NotificationDeliveryMode;
}): void {
  if (!getNotificationEventDefinition(input.notificationType)) {
    throw new Error(
      `Unsupported notification preference type: ${input.notificationType}`,
    );
  }

  if (!isSupportedPreferenceChannel(input.channel)) {
    throw new Error(
      `Unsupported notification preference channel: ${input.channel}`,
    );
  }

  if (
    input.deliveryMode &&
    !isSupportedPreferenceDeliveryMode(input.deliveryMode)
  ) {
    throw new Error(
      `Unsupported notification preference delivery mode: ${input.deliveryMode}`,
    );
  }
}

export async function resolveNotificationPreference(input: {
  userId: string;
  notificationType: string;
  channel: NotificationChannel;
  trx?: Knex.Transaction;
}): Promise<NotificationPreference> {
  const client = input.trx ?? knexClient;

  const row = await client<{
    delivery_mode: NotificationDeliveryMode;
  }>(PREFERENCES_TABLE)
    .where({
      user_id: input.userId,
      notification_type: input.notificationType,
      channel: input.channel,
    })
    .first('delivery_mode');

  if (row) {
    return {
      userId: input.userId,
      notificationType: input.notificationType,
      channel: input.channel,
      deliveryMode: row.delivery_mode,
      source: 'user',
    };
  }

  return {
    userId: input.userId,
    notificationType: input.notificationType,
    channel: input.channel,
    deliveryMode: codeDefaultFor(input.notificationType, input.channel),
    source: 'default',
  };
}

export async function listNotificationPreferences(input: {
  userId: string;
  trx?: Knex.Transaction;
}): Promise<NotificationPreference[]> {
  const client = input.trx ?? knexClient;
  const definitions = listNotificationEventDefinitions();
  const notificationTypes = definitions.map((definition) => definition.eventType);
  const channels = [...SUPPORTED_NOTIFICATION_PREFERENCE_CHANNELS];
  const rows = await client<{
    notification_type: string;
    channel: NotificationChannel;
    delivery_mode: NotificationDeliveryMode;
  }>(PREFERENCES_TABLE)
    .where({ user_id: input.userId })
    .whereIn('notification_type', notificationTypes)
    .whereIn('channel', channels)
    .select('notification_type', 'channel', 'delivery_mode');
  const userPreferences = new Map(
    rows.map((row) => [`${row.notification_type}:${row.channel}`, row]),
  );

  return definitions.flatMap((definition) =>
    channels.map((channel) => {
      const row = userPreferences.get(`${definition.eventType}:${channel}`);
      return {
        userId: input.userId,
        notificationType: definition.eventType,
        channel,
        deliveryMode:
          row?.delivery_mode ?? codeDefaultFor(definition.eventType, channel),
        source: row ? 'user' : 'default',
      } satisfies NotificationPreference;
    }),
  );
}

export async function setNotificationPreference(input: {
  userId: string;
  notificationType: string;
  channel: NotificationChannel;
  deliveryMode: NotificationDeliveryMode;
  trx?: Knex.Transaction;
}): Promise<NotificationPreference> {
  assertSupportedPreference(input);
  const client = input.trx ?? knexClient;

  await client(PREFERENCES_TABLE)
    .insert({
      user_id: input.userId,
      notification_type: input.notificationType,
      channel: input.channel,
      delivery_mode: input.deliveryMode,
    })
    .onConflict(['user_id', 'notification_type', 'channel'])
    .merge({
      delivery_mode: input.deliveryMode,
      updated_at: client.fn.now(),
    });

  return {
    userId: input.userId,
    notificationType: input.notificationType,
    channel: input.channel,
    deliveryMode: input.deliveryMode,
    source: 'user',
  };
}
