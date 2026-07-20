import { ServerClient as PostmarkServerClient } from 'postmark';

import { ENV } from '../../../config/env.js';

import type { CommsProvider } from './provider.types.js';

let client: PostmarkServerClient | null = null;

function getPostmarkConfig(): { apiKey: string; emailFrom: string } {
  const apiKey = ENV.POSTMARK_API_KEY;
  const emailFrom = ENV.EMAIL_FROM;

  if (!apiKey) {
    throw new Error('POSTMARK_API_KEY is required for postmark email delivery');
  }
  if (!emailFrom) {
    throw new Error('EMAIL_FROM is required for postmark email delivery');
  }

  return { apiKey, emailFrom };
}

function getPostmarkClient(): PostmarkServerClient {
  const config = getPostmarkConfig();

  client ??= new PostmarkServerClient(config.apiKey);
  return client;
}

function validatePostmarkConfig(): void {
  getPostmarkConfig();
}

export const postmarkEmailProvider: CommsProvider<'email'> = {
  key: 'postmark',
  channel: 'email',
  supports: {
    html: true,
    text: true,
  },
  validateConfig: validatePostmarkConfig,
  async send(message) {
    const config = getPostmarkConfig();
    const result = await getPostmarkClient().sendEmail({
      From: config.emailFrom,
      To: message.to,
      Subject: message.subject ?? 'Notification from Accountable',
      HtmlBody: message.html,
      TextBody: message.text,
    });

    return {
      providerMessageId: result.MessageID,
      raw: {
        messageId: result.MessageID,
        submittedAt: result.SubmittedAt,
        to: result.To,
        errorCode: result.ErrorCode,
        message: result.Message,
      },
    };
  },
};
