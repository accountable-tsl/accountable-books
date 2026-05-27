import { sendEmail } from '../../features/communications/email/email.service.js';
import { logger } from '../../shared/utils/logger.js';

type BreakGlassNotificationInput = {
  recipients: string[];
  companyName: string;
  companyShortCode: string;
  actorEmail: string;
  reason: string;
  expiresAt?: string;
  closedAt?: string;
  closeReason?: string | null;
};

async function sendBulkEmails(
  recipients: string[],
  build: (to: string) => Promise<void>,
) {
  const results = await Promise.allSettled(recipients.map((to) => build(to)));
  const rejected = results.filter((result) => result.status === 'rejected');
  if (rejected.length > 0) {
    logger.warn(
      { rejectedCount: rejected.length, recipientCount: recipients.length },
      'Some support-access notification emails failed',
    );
  }
}

export async function sendBreakGlassOpenedNotifications(
  input: BreakGlassNotificationInput,
) {
  if (input.recipients.length === 0) return;

  const subject = `[Accountable] Emergency support access opened for ${input.companyName}`;
  const html = `
    <p>Emergency support access was opened for <strong>${input.companyName}</strong> (${input.companyShortCode}).</p>
    <p>Opened by: ${input.actorEmail}</p>
    <p>Reason: ${input.reason}</p>
    <p>Expires at: ${input.expiresAt ?? 'n/a'}</p>
  `;
  const text = [
    `Emergency support access was opened for ${input.companyName} (${input.companyShortCode}).`,
    `Opened by: ${input.actorEmail}`,
    `Reason: ${input.reason}`,
    `Expires at: ${input.expiresAt ?? 'n/a'}`,
  ].join('\n');

  await sendBulkEmails(input.recipients, async (to) => {
    await sendEmail({ to, subject, html, text });
  });
}

export async function sendBreakGlassClosedNotifications(
  input: BreakGlassNotificationInput,
) {
  if (input.recipients.length === 0) return;

  const subject = `[Accountable] Emergency support access closed for ${input.companyName}`;
  const html = `
    <p>Emergency support access was closed for <strong>${input.companyName}</strong> (${input.companyShortCode}).</p>
    <p>Closed by: ${input.actorEmail}</p>
    <p>Original reason: ${input.reason}</p>
    <p>Closed at: ${input.closedAt ?? 'n/a'}</p>
    <p>Close reason: ${input.closeReason ?? 'Not provided'}</p>
  `;
  const text = [
    `Emergency support access was closed for ${input.companyName} (${input.companyShortCode}).`,
    `Closed by: ${input.actorEmail}`,
    `Original reason: ${input.reason}`,
    `Closed at: ${input.closedAt ?? 'n/a'}`,
    `Close reason: ${input.closeReason ?? 'Not provided'}`,
  ].join('\n');

  await sendBulkEmails(input.recipients, async (to) => {
    await sendEmail({ to, subject, html, text });
  });
}
