import { send as sendComms } from '../../features/comms/index.js';
import {
  notificationCommsRequestedPayloadSchema,
  notificationRequestedPayloadSchema,
} from './notification-intent.js';
import { notify } from './notifications.model.js';

export async function dispatchNotificationRequested(
  payload: unknown,
): Promise<{ inserted: boolean; suppressed: boolean }> {
  const parsed = notificationRequestedPayloadSchema.parse(payload);
  const result = await notify(parsed.event);
  return { inserted: result.inserted, suppressed: result.suppressed };
}

export async function dispatchNotificationCommsRequested(
  payload: unknown,
): Promise<{ accepted: boolean }> {
  const parsed = notificationCommsRequestedPayloadSchema.parse(payload);
  const result = await sendComms(parsed.payload);
  return { accepted: result.accepted };
}
