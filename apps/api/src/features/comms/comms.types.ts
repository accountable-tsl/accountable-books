import { z } from 'zod';

export const commsCorrelationSchema = z.discriminatedUnion('source', [
  z
    .object({
      source: z.literal('notification'),
      id: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      source: z.literal('admin_alert'),
      id: z.string().trim().min(1),
    })
    .strict(),
]);
export type CommsCorrelation = z.infer<typeof commsCorrelationSchema>;

export const commsChannelSchema = z.enum([
  'email',
  'sms',
  'slack',
  'google_chat',
  'whatsapp',
]);
export type CommsChannel = z.infer<typeof commsChannelSchema>;

export const commsPrioritySchema = z.enum([
  'low',
  'normal',
  'high',
  'critical',
]);
export type CommsPriority = z.infer<typeof commsPrioritySchema>;

export const commsDeliveryModeSchema = z.literal('immediate');
export type CommsDeliveryMode = z.infer<typeof commsDeliveryModeSchema>;

export const commsRecipientSchema = z
  .object({
    channel: commsChannelSchema,
    address: z.string().trim().min(1),
  })
  .strict();
export type CommsRecipient = z.infer<typeof commsRecipientSchema>;

export const commsSendPayloadSchema = z
  .object({
    correlation: commsCorrelationSchema,
    recipients: z.array(commsRecipientSchema).min(1).max(100),
    eventType: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9_.-]*$/),
    priority: commsPrioritySchema,
    deliveryMode: commsDeliveryModeSchema,
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type CommsSendPayload = z.input<typeof commsSendPayloadSchema>;
export type ParsedCommsSendPayload = z.output<typeof commsSendPayloadSchema>;

export type CommsDeliveryStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'dead'
  | 'suppressed';

export interface CommsDelivery {
  id: string;
  idempotencyKey: string;
  channel: CommsChannel;
  providerKey: string | null;
  recipientAddress: string;
  templateKey: string;
  templateVersion: number;
  priority: CommsPriority;
  deliveryMode: CommsDeliveryMode;
  status: CommsDeliveryStatus;
  attemptCount: number;
  providerMessageId: string | null;
  lastError: string | null;
  correlation: CommsCorrelation;
  queuedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommsDeliveryRow {
  id: string;
  idempotency_key: string;
  channel: CommsChannel;
  provider_key: string | null;
  recipient_address: string;
  template_key: string;
  template_version: number;
  priority: CommsPriority;
  delivery_mode: CommsDeliveryMode;
  status: CommsDeliveryStatus;
  attempt_count: number;
  provider_message_id: string | null;
  provider_response: unknown;
  last_error: string | null;
  correlation: unknown;
  payload_data: unknown;
  queued_at: Date | string;
  sent_at: Date | string | null;
  delivered_at: Date | string | null;
  failed_at: Date | string | null;
  next_attempt_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CommsSendResult {
  accepted: boolean;
  deliveries: CommsDelivery[];
}
