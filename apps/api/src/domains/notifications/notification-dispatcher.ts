import { send as sendComms } from '../../features/comms/index.js';
import {
  notificationAttentionResolvedPayloadSchema,
  notificationCommsRequestedPayloadSchema,
  notificationRequestedPayloadSchema,
} from './notification-intent.js';
import { notify, resolveNotificationAttention } from './notifications.model.js';

export async function dispatchNotificationRequested(
  payload: unknown,
): Promise<{ inserted: boolean; updated: boolean; suppressed: boolean }> {
  const parsed = notificationRequestedPayloadSchema.parse(payload);
  const result = await notify(parsed.event);
  return {
    inserted: result.inserted,
    updated: result.updated,
    suppressed: result.suppressed,
  };
}

export async function dispatchNotificationAttentionResolved(
  payload: unknown,
): Promise<{ resolved: boolean }> {
  const parsed = notificationAttentionResolvedPayloadSchema.parse(payload);
  const result = await resolveNotificationAttention(parsed);
  return { resolved: result.resolved };
}

export async function dispatchNotificationCommsRequested(
  payload: unknown,
): Promise<{ accepted: boolean }> {
  const parsed = notificationCommsRequestedPayloadSchema.parse(payload);
  const result = await sendComms(parsed.payload);
  return { accepted: result.accepted };
}
