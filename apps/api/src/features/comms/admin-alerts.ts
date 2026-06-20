import { z } from 'zod';

import { ENV } from '../../config/env.js';
import { send } from './comms.service.js';
import { commsPrioritySchema } from './comms.types.js';

import type { CommsSendResult } from './comms.types.js';

export const ADMIN_ALERT_COMMS_EVENT_TYPE = 'admin.alert';

const adminAlertEventTypeSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9_.-]*$/);

export const adminAlertEventSchema = z
  .object({
    idempotencyKey: z.string().trim().min(1),
    eventType: adminAlertEventTypeSchema,
    priority: commsPrioritySchema.default('critical'),
    title: z.string().trim().min(1),
    body: z.string().trim().min(1).nullish(),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type AdminAlertEvent = z.input<typeof adminAlertEventSchema>;

function adminAlertRecipients(): Array<{ channel: 'email'; address: string }> {
  const recipients = (ENV.ADMIN_ALERT_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (recipients.length === 0) {
    throw new Error('ADMIN_ALERT_EMAILS must include at least one email address');
  }

  return recipients.map((address) => {
    const parsed = z.email().parse(address);
    return { channel: 'email', address: parsed };
  });
}

export async function alertAdmins(
  rawEvent: AdminAlertEvent,
): Promise<CommsSendResult> {
  const event = adminAlertEventSchema.parse(rawEvent);

  return send({
    correlation: { source: 'admin_alert', id: event.idempotencyKey },
    recipients: adminAlertRecipients(),
    eventType: ADMIN_ALERT_COMMS_EVENT_TYPE,
    priority: event.priority,
    deliveryMode: 'immediate',
    data: {
      ...event.data,
      alertEventType: event.eventType,
      title: event.title,
      body: event.body ?? null,
    },
  });
}
