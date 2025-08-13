import nodemailer from "nodemailer";
import { Transporter } from "nodemailer";
import { ENV, NODE_ENV } from "../../../config/env";
import {
  EmailPayload,
  InviteEmailPayload,
  TokenBasedEmailPayload,
} from "./email.types";
import {
  AppError,
  errorResponse,
  successResponse,
} from "../../../shared/utils/response.utils";
import { emailQueue } from "../../../jobs/queues/email.queue";
import { ApiResponse } from "../../../core/types/api.types";
import { buildEmailServiceUrl } from "./email.utils";

let transporter: Transporter | null = null;

async function createTransporter(): Promise<Transporter> {
  const provider = ENV.EMAIL_PROVIDER;
  console.log("provider", provider);

  switch (provider) {
    case "dev": {
      if (!ENV.ETHEREAL_EMAIL || !ENV.ETHEREAL_PASSWORD) {
        throw new Error("Ethereal credentials missing in development");
      }

      console.log("🧪 Using ethereal:", process.env.ETHEREAL_EMAIL);

      return nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        auth: {
          user: ENV.ETHEREAL_EMAIL,
          pass: ENV.ETHEREAL_PASSWORD,
        },
      });
    }

    case "postmark":
      if (!ENV.POSTMARK_API_KEY) {
        throw new Error("Postmark API key missing");
      }
      console.log("Postmark's being hit");

      return nodemailer.createTransport({
        host: "smtp.postmarkapp.com",
        port: 587,
        auth: {
          user: ENV.POSTMARK_API_KEY,
          pass: ENV.POSTMARK_API_KEY,
        },
      });

    case "ses":
      if (!ENV.AWS_SES_SMTP_USERNAME || !ENV.AWS_SES_SMTP_PASSWORD) {
        throw new Error("AWS SES SMPT credentials missing");
      }
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

async function getTransporter() {
  if (!transporter) {
    transporter = await createTransporter();
  }
  return transporter;
}

export async function sendEmail(payload: EmailPayload) {
  const transporter = await getTransporter();

  console.log("I'm being hit (SendEmail)");

  if (!ENV.EMAIL_FROM) {
    throw new Error("EMAIL_FROM is not set");
  }

  try {
    const info = await transporter.sendMail({
      from: ENV.EMAIL_FROM,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });

    console.log("✅ Email sent:", info.messageId);

    if (ENV.NODE_ENV === "local" || ENV.NODE_ENV === "docker") {
      console.log("Email preview URL:", nodemailer.getTestMessageUrl(info));
    }

    return info;
  } catch (error) {
    errorResponse("Failed to send email", error);
  }
}

export async function sendVerificationEmail(
  payload: TokenBasedEmailPayload
): Promise<ApiResponse> {
  console.log(payload);

  const url =
    payload.url ??
    buildEmailServiceUrl("verify-email", { token: payload.token! });

  if (!url) {
    throw new AppError("Missing token and url...", payload, true);
  }

  await emailQueue.add("send_verification_email", { ...payload, url });
  return successResponse("Verification email sent", payload.to);
}

export async function sendUserInviteEmail(payload: InviteEmailPayload) {
  const url =
    payload.url ??
    buildEmailServiceUrl("verify-email", { token: payload.token! });

  if (!url) {
    throw new Error("Missing token and url... ");
  }

  emailQueue.add("send_user_invite_email", { ...payload, url });
}
