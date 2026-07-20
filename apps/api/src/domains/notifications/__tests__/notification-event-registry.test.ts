import { describe, expect, it } from 'vitest';

import { resolveCommsTemplate } from '../../../features/comms/templates/comms-template-registry.js';
import { listNotificationChannelRouteResolvers } from '../notification-channel-routes.js';
import { listNotificationEventDefinitions } from '../notification-event-registry.js';
import {
  NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE,
} from '../notifications.types.js';

describe('notification event registry', () => {
  it('defines every known notification type', () => {
    const registeredTypes = listNotificationEventDefinitions()
      .map((definition) => definition.eventType)
      .sort();

    expect(registeredTypes).toEqual(Object.values(NOTIFICATION_TYPE).sort());
  });

  it('makes product events company-scoped and user/account events explicitly global', () => {
    const definitions = listNotificationEventDefinitions();

    for (const definition of definitions) {
      if (
        definition.eventType ===
        NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED
      ) {
        expect(definition.scope).toBe('global');
      } else {
        expect(definition.scope).toBe('company');
      }
    }
  });

  it('keeps product delivery policy separate from concrete route channels', () => {
    const definitions = listNotificationEventDefinitions();
    const profilePictureFailed = definitions.find(
      (definition) =>
        definition.eventType ===
        NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED,
    );
    const workAssigned = definitions.find(
      (definition) => definition.eventType === NOTIFICATION_TYPE.WORK_ASSIGNED,
    );

    expect(workAssigned?.delivery).toMatchObject({
      inApp: { enabled: true, defaultMode: 'immediate' },
      external: { enabled: true, defaultMode: 'immediate' },
    });
    expect(profilePictureFailed?.delivery).toMatchObject({
      inApp: { enabled: true, defaultMode: 'immediate' },
      external: { enabled: true, defaultMode: 'off' },
    });
  });

  it('registers email as the only concrete external notification route for now', () => {
    expect(
      listNotificationChannelRouteResolvers().map(
        (resolver) => resolver.channel,
      ),
    ).toEqual([NOTIFICATION_CHANNEL.EMAIL]);
  });

  it('has email templates for every externally routable notification event', () => {
    const externallyRoutable = listNotificationEventDefinitions().filter(
      (definition) => definition.delivery.external.enabled,
    );

    expect(externallyRoutable.length).toBeGreaterThan(0);

    for (const definition of externallyRoutable) {
      expect(() =>
        resolveCommsTemplate({
          eventType: definition.eventType,
          channel: NOTIFICATION_CHANNEL.EMAIL,
        }),
      ).not.toThrow();
    }
  });
});
