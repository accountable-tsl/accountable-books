import type { NotificationEventDefinition } from './notification-event-registry.js';
import type { ParsedNotifyEvent } from './notifications.types.js';

export function resolveNotificationPolicyOwner(input: {
  event: ParsedNotifyEvent;
  definition: NotificationEventDefinition;
}): string | null {
  const { event, definition } = input;
  const companyIds = [
    event.firmCompanyId ?? null,
    event.clientCompanyId ?? null,
  ].filter((companyId): companyId is string => companyId != null);

  if (definition.scope === 'global') {
    if (event.policyOwnerCompanyId != null) {
      throw new Error(
        `Notification event ${event.eventType} is global and must not include policyOwnerCompanyId`,
      );
    }
    return null;
  }

  const policyOwnerCompanyId =
    event.policyOwnerCompanyId ?? event.firmCompanyId ?? event.clientCompanyId;

  if (!policyOwnerCompanyId) {
    throw new Error(
      `Notification event ${event.eventType} is company-scoped and requires a policy owner company`,
    );
  }

  if (!companyIds.includes(policyOwnerCompanyId)) {
    throw new Error(
      `Notification event ${event.eventType} policyOwnerCompanyId must match firmCompanyId or clientCompanyId`,
    );
  }

  return policyOwnerCompanyId;
}
