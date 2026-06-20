import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';

import type { CommsChannel } from '../../features/comms/comms.types.js';
import type { ParsedNotifyEvent } from './notifications.types.js';

export interface NotificationChannelRoute {
  channel: CommsChannel;
  address: string;
}

export interface NotificationChannelRouteResolver<
  C extends CommsChannel = CommsChannel,
> {
  channel: C;
  resolve(input: {
    event: ParsedNotifyEvent;
    trx?: Knex.Transaction;
  }): Promise<Array<NotificationChannelRoute & { channel: C }>>;
}

const routeResolvers = new Map<
  CommsChannel,
  NotificationChannelRouteResolver
>();

async function loadRecipientEmail(
  client: Knex,
  userId: string,
): Promise<string | null> {
  const row = await client<{ email: string }>('app.users')
    .where({ id: userId, is_deleted: false })
    .first('email');
  return row?.email ?? null;
}

export function registerNotificationChannelRouteResolver(
  resolver: NotificationChannelRouteResolver,
): void {
  routeResolvers.set(resolver.channel, resolver);
}

export function listNotificationChannelRouteResolvers(): NotificationChannelRouteResolver[] {
  return [...routeResolvers.values()];
}

export function hasNotificationChannelRouteResolver(
  channel: CommsChannel,
): boolean {
  return routeResolvers.has(channel);
}

export async function resolveNotificationChannelRoutes(input: {
  event: ParsedNotifyEvent;
  channel: CommsChannel;
  trx?: Knex.Transaction;
}): Promise<NotificationChannelRoute[]> {
  const resolver = routeResolvers.get(input.channel);
  if (!resolver) {
    throw new Error(
      `notify() cannot resolve ${input.channel} recipients yet`,
    );
  }

  return resolver.resolve({
    event: input.event,
    trx: input.trx,
  });
}

export const emailNotificationRouteResolver: NotificationChannelRouteResolver<'email'> =
  {
    channel: 'email',
    async resolve(input) {
      const address = await loadRecipientEmail(
        input.trx ?? knexClient,
        input.event.recipientUserId,
      );

      return address ? [{ channel: 'email', address }] : [];
    },
  };

registerNotificationChannelRouteResolver(emailNotificationRouteResolver);
