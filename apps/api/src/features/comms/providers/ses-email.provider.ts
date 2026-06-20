import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';

import { ENV } from '../../../config/env.js';

import type { CommsProvider } from './provider.types.js';

let transporter: Transporter | null = null;

function requiredEnv(name: string): string {
  const value = ENV[name];
  if (!value) {
    throw new Error(`${name} is required for SES email delivery`);
  }
  return value;
}

function getSesTransporter(): Transporter {
  validateSesConfig();

  transporter ??= nodemailer.createTransport({
    host: `email-smtp.${requiredEnv('AWS_REGION')}.amazonaws.com`,
    port: 587,
    secure: false,
    auth: {
      user: requiredEnv('AWS_SES_SMTP_USERNAME'),
      pass: requiredEnv('AWS_SES_SMTP_PASSWORD'),
    },
  });
  return transporter;
}

function validateSesConfig(): void {
  requiredEnv('AWS_REGION');
  requiredEnv('AWS_SES_SMTP_USERNAME');
  requiredEnv('AWS_SES_SMTP_PASSWORD');
  requiredEnv('EMAIL_FROM');
}

export const sesEmailProvider: CommsProvider<'email'> = {
  key: 'ses',
  channel: 'email',
  supports: {
    html: true,
    text: true,
  },
  validateConfig: validateSesConfig,
  async send(message) {
    const result = await getSesTransporter().sendMail({
      from: requiredEnv('EMAIL_FROM'),
      to: message.to,
      subject: message.subject ?? 'Notification from Accountable',
      html: message.html,
      text: message.text,
    });

    return {
      providerMessageId: result.messageId,
      raw: {
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
        response: result.response,
      },
    };
  },
};
