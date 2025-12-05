import nodemailer from 'nodemailer';
import { type Transporter } from 'nodemailer';
import postmark from 'postmark';

import { ENV } from '../../../config/env.js';
import { type ApiResponse } from '../../../core/types/api.types.js';
import {
  AppError,
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import {
  enqueueUserInviteEmail,
  enqueueVerificationEmail,
} from './email.queue.js';
import {
  type EmailPayload,
  type InviteEmailPayload,
  type TokenBasedEmailPayload,
} from './email.types.js';

// Union type for email sender - can be either nodemailer Transporter or Postmark ServerClient
type EmailSender = Transporter | postmark.ServerClient;

let emailSender: EmailSender | null = null;

async function createEmailSender(): Promise<EmailSender> {
  const provider = ENV.EMAIL_PROVIDER;
  console.log('📧 Email provider:', provider);

  switch (provider) {
    case 'dev': {
      if (!ENV.ETHEREAL_EMAIL || !ENV.ETHEREAL_PASSWORD) {
        throw new Error('Ethereal credentials missing in development');
      }

      console.log('🧪 Using ethereal:', process.env.ETHEREAL_EMAIL);

      return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: ENV.ETHEREAL_EMAIL,
          pass: ENV.ETHEREAL_PASSWORD,
        },
      });
    }

    case 'postmark': {
      if (!ENV.POSTMARK_API_KEY) {
        throw new Error('Postmark API key missing');
      }
      console.log('📮 Using Postmark API client');

      return new postmark.ServerClient(ENV.POSTMARK_API_KEY);
    }

    case 'ses':
      if (!ENV.AWS_SES_SMTP_USERNAME || !ENV.AWS_SES_SMTP_PASSWORD) {
        throw new Error('AWS SES SMPT credentials missing');
      }
      console.log('📤 Using AWS SES');
      return nodemailer.createTransport({
        host: `email-smtp.${ENV.AWS_REGION}.amazonaws.com`,
        port: 587,
        auth: {
          user: ENV.AWS_SES_SMTP_USERNAME,
          pass: ENV.AWS_SES_SMTP_PASSWORD,
        },
      });

    default:
      throw new Error(`Invalid EMAIL_PROVIDER: ${provider}`);
  }
}

async function getEmailSender() {
  if (!emailSender) {
    emailSender = await createEmailSender();
  }
  return emailSender;
}

// Helper function to check if sender is Postmark client
function isPostmarkClient(
  sender: EmailSender,
): sender is postmark.ServerClient {
  return sender instanceof postmark.ServerClient;
}

export async function sendEmail(payload: EmailPayload) {
  const sender = await getEmailSender();

  console.log('📧 Sending email via', ENV.EMAIL_PROVIDER);

  if (!ENV.EMAIL_FROM) {
    throw new Error('EMAIL_FROM is not set');
  }

  try {
    let result;

    if (isPostmarkClient(sender)) {
      // Use Postmark API
      result = await sender.sendEmail({
        From: ENV.EMAIL_FROM,
        To: payload.to,
        Subject: payload.subject || 'Notification from Accountable',
        HtmlBody: payload.html || undefined,
        TextBody: payload.text || undefined,
      });

      console.log('✅ Email sent via Postmark:', result.MessageID);
      return {
        messageId: result.MessageID,
        provider: 'postmark',
      };
    } else {
      // Use nodemailer (for Ethereal, SES, etc.)
      const info = await sender.sendMail({
        from: ENV.EMAIL_FROM,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });

      console.log('✅ Email sent via nodemailer:', info.messageId);

      if (ENV.NODE_ENV === 'local' || ENV.NODE_ENV === 'docker') {
        console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
      }

      return {
        messageId: info.messageId,
        provider: ENV.EMAIL_PROVIDER,
        previewUrl: nodemailer.getTestMessageUrl(info),
      };
    }
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    errorResponse('Failed to send email', error);
  }
}

export async function sendVerificationEmail(
  payload: TokenBasedEmailPayload,
): Promise<ApiResponse> {
  const url = payload.url;

  if (!url) {
    throw new AppError('Missing token and url...', payload, true);
  }

  await enqueueVerificationEmail({ ...payload, url });
  return successResponse('Verification email sent', payload.to);
}

export async function sendUserInviteEmail(payload: InviteEmailPayload) {
  const url = payload.url;

  if (!url) {
    throw new Error('Missing token and url... ');
  }

  await enqueueUserInviteEmail({ ...payload, url });
}
