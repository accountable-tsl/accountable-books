import type { CommsChannel } from '../comms.types.js';
import type { RenderedCommsMessage } from '../providers/provider.types.js';

export interface CommsTemplate<C extends CommsChannel = CommsChannel> {
  eventType: string;
  channel: C;
  version: number;
  render(input: {
    data: Record<string, unknown>;
    to: string;
  }): RenderedCommsMessage<C>;
}

const templates = new Map<string, CommsTemplate>();

function registryKey(eventType: string, channel: CommsChannel): string {
  return `${eventType}:${channel}`;
}

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function renderGenericAttentionEmail(input: {
  data: Record<string, unknown>;
  to: string;
}): RenderedCommsMessage<'email'> {
  const title = stringValue(input.data.title) ?? 'Accountable notification';
  const body = stringValue(input.data.body);
  const escapedTitle = htmlEscape(title);
  const escapedBody = body ? htmlEscape(body) : null;

  return {
    channel: 'email',
    to: input.to,
    subject: title,
    text: body ? `${title}\n\n${body}` : title,
    html: escapedBody
      ? `<h1>${escapedTitle}</h1><p>${escapedBody}</p>`
      : `<h1>${escapedTitle}</h1>`,
  };
}

function renderAdminAlertEmail(input: {
  data: Record<string, unknown>;
  to: string;
}): RenderedCommsMessage<'email'> {
  const title = stringValue(input.data.title) ?? 'Accountable admin alert';
  const body = stringValue(input.data.body);
  const alertEventType = stringValue(input.data.alertEventType);
  const text = [
    title,
    alertEventType ? `Event: ${alertEventType}` : null,
    body,
  ]
    .filter(Boolean)
    .join('\n\n');

  const htmlParts = [
    `<h1>${htmlEscape(title)}</h1>`,
    alertEventType ? `<p><strong>Event:</strong> ${htmlEscape(alertEventType)}</p>` : null,
    body ? `<p>${htmlEscape(body)}</p>` : null,
  ].filter(Boolean);

  return {
    channel: 'email',
    to: input.to,
    subject: title,
    text,
    html: htmlParts.join(''),
  };
}

export function registerCommsTemplate(template: CommsTemplate): void {
  templates.set(registryKey(template.eventType, template.channel), template);
}

export function resolveCommsTemplate(input: {
  eventType: string;
  channel: CommsChannel;
}): CommsTemplate {
  const template = templates.get(registryKey(input.eventType, input.channel));
  if (!template) {
    throw new Error(
      `No comms template registered for ${input.eventType}/${input.channel}`,
    );
  }
  return template;
}

[
  'work.assigned',
  'work.reassigned',
  'work.overdue',
  'bank.reconnect_required',
  'client_query.requires_response',
  'close.approval_requested',
  'close.approval_rejected',
  'close.package_stale',
  'report.delivery_failed',
  'sync.failure_requires_action',
  'user.profile_picture_update_failed',
].forEach((eventType) => {
  registerCommsTemplate({
    eventType,
    channel: 'email',
    version: 1,
    render: renderGenericAttentionEmail,
  });
});

registerCommsTemplate({
  eventType: 'admin.alert',
  channel: 'email',
  version: 1,
  render: renderAdminAlertEmail,
});
