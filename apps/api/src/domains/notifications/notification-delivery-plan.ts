import type { Knex } from 'knex';

import { commsChannelSchema } from '../../features/comms/comms.types.js';
import {
  hasNotificationChannelRouteResolver,
  listNotificationChannelRouteResolvers,
  resolveNotificationChannelRoutes,
} from './notification-channel-routes.js';
import { getNotificationEventDefinition } from './notification-event-registry.js';
import { resolveEffectiveNotificationPreference } from './notification-preferences.js';
import {
  NOTIFICATION_CHANNEL,
  notificationDeliveryModeSchema,
} from './notifications.types.js';

import type { CommsChannel } from '../../features/comms/comms.types.js';
import type {
  NotificationEventDefinition,
  NotificationProductDeliveryPolicy,
} from './notification-event-registry.js';
import type {
  NotificationDeliveryChannel,
  NotificationDeliveryMode,
  ParsedNotifyEvent,
} from './notifications.types.js';

type EnabledNotificationDeliveryMode = Exclude<NotificationDeliveryMode, 'off'>;

export interface NotificationCommsRoute {
  channel: CommsChannel;
  address: string;
  deliveryMode: EnabledNotificationDeliveryMode;
}

export interface NotificationDeliveryPlan {
  inApp: {
    enabled: boolean;
    deliveryMode: EnabledNotificationDeliveryMode | null;
  };
  comms: NotificationCommsRoute[];
}

function uniqueChannels(
  channels: NotificationDeliveryChannel[],
): NotificationDeliveryChannel[] {
  return [...new Set(channels)];
}

function isCommsChannel(
  channel: NotificationDeliveryChannel,
): channel is CommsChannel {
  return commsChannelSchema.safeParse(channel).success;
}

function externalRouteChannels(): CommsChannel[] {
  return listNotificationChannelRouteResolvers().map(
    (resolver) => resolver.channel,
  );
}

function defaultCandidateChannels(
  delivery: NotificationProductDeliveryPolicy,
): Array<{
  channel: NotificationDeliveryChannel;
  deliveryMode: NotificationDeliveryMode;
}> {
  const candidates: Array<{
    channel: NotificationDeliveryChannel;
    deliveryMode: NotificationDeliveryMode;
  }> = [];

  if (delivery.inApp.enabled) {
    candidates.push({
      channel: NOTIFICATION_CHANNEL.IN_APP,
      deliveryMode: delivery.inApp.defaultMode,
    });
  }

  if (delivery.external.enabled) {
    for (const channel of externalRouteChannels()) {
      candidates.push({
        channel,
        deliveryMode: delivery.external.defaultMode,
      });
    }
  }

  return candidates;
}

function explicitCandidateForChannel(input: {
  definition: NotificationEventDefinition;
  channel: NotificationDeliveryChannel;
}): {
  channel: NotificationDeliveryChannel;
  deliveryMode: EnabledNotificationDeliveryMode;
} | null {
  if (input.channel === NOTIFICATION_CHANNEL.IN_APP) {
    return input.definition.delivery.inApp.enabled
      ? {
          channel: input.channel,
          deliveryMode: 'immediate',
        }
      : null;
  }

  if (
    isCommsChannel(input.channel) &&
    input.definition.delivery.external.enabled &&
    hasNotificationChannelRouteResolver(input.channel)
  ) {
    return {
      channel: input.channel,
      deliveryMode: 'immediate',
    };
  }

  return null;
}

function resolveCandidateChannels(event: ParsedNotifyEvent): Array<{
  channel: NotificationDeliveryChannel;
  deliveryMode: NotificationDeliveryMode;
}> {
  const definition = getNotificationEventDefinition(event.eventType);
  if (!definition) {
    throw new Error(`Unsupported notification event type: ${event.eventType}`);
  }

  const defaultCandidates = defaultCandidateChannels(definition.delivery);

  if (event.deliveryPolicy.mode === 'default') {
    return defaultCandidates;
  }

  if (event.deliveryPolicy.mode === 'except') {
    const excluded = new Set(event.deliveryPolicy.channels);
    return defaultCandidates.filter(
      (candidate) => !excluded.has(candidate.channel),
    );
  }

  const requestedChannels = uniqueChannels(event.deliveryPolicy.channels);
  const requestedCandidates = requestedChannels.map((channel) =>
    explicitCandidateForChannel({ definition, channel }),
  );
  const unsupported = requestedChannels.filter(
    (_, index) => requestedCandidates[index] == null,
  );

  if (unsupported.length > 0) {
    throw new Error(
      `Notification delivery channel(s) ${unsupported.join(
        ', ',
      )} are not configured for ${event.eventType}`,
    );
  }

  return requestedCandidates.filter(
    (
      candidate,
    ): candidate is {
      channel: NotificationDeliveryChannel;
      deliveryMode: EnabledNotificationDeliveryMode;
    } => candidate != null,
  );
}

async function resolveEnabledDeliveryMode(input: {
  event: ParsedNotifyEvent;
  channel: NotificationDeliveryChannel;
  deliveryMode: NotificationDeliveryMode;
  trx?: Knex.Transaction;
}): Promise<EnabledNotificationDeliveryMode | null> {
  if (
    input.channel === NOTIFICATION_CHANNEL.IN_APP &&
    input.event.priority === 'critical'
  ) {
    return 'immediate';
  }

  const preference = await resolveEffectiveNotificationPreference({
    userId: input.event.recipientUserId,
    policyOwnerCompanyId: input.event.policyOwnerCompanyId ?? null,
    notificationType: input.event.eventType,
    channel: input.channel,
    candidateDeliveryMode: input.deliveryMode,
    trx: input.trx,
  });

  if (preference.deliveryMode === 'off') {
    return null;
  }

  return notificationDeliveryModeSchema
    .exclude(['off'])
    .parse(preference.deliveryMode);
}

export async function resolveNotificationDeliveryPlan(input: {
  event: ParsedNotifyEvent;
  trx?: Knex.Transaction;
}): Promise<NotificationDeliveryPlan> {
  const candidates = resolveCandidateChannels(input.event);
  const comms: NotificationCommsRoute[] = [];
  const inApp: NotificationDeliveryPlan['inApp'] = {
    enabled: false,
    deliveryMode: null,
  };

  for (const candidate of candidates) {
    const deliveryMode = await resolveEnabledDeliveryMode({
      event: input.event,
      channel: candidate.channel,
      deliveryMode: candidate.deliveryMode,
      trx: input.trx,
    });

    if (!deliveryMode) {
      continue;
    }

    if (candidate.channel === NOTIFICATION_CHANNEL.IN_APP) {
      inApp.enabled = true;
      inApp.deliveryMode = deliveryMode;
      continue;
    }

    if (!isCommsChannel(candidate.channel)) {
      continue;
    }

    const routes = await resolveNotificationChannelRoutes({
      channel: candidate.channel,
      event: input.event,
      trx: input.trx,
    });

    for (const route of routes) {
      comms.push({
        channel: route.channel,
        address: route.address,
        deliveryMode,
      });
    }
  }

  return { inApp, comms };
}
