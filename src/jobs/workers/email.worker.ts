import { Worker } from "bullmq";
import { ENV } from "../../config/env";
import {
  InviteEmailPayload,
  TokenBasedEmailPayload,
} from "../../domains/communications/email.types";
import { redis } from "../../lib/redis";
import { sendEmail } from "../../domains/communications/email.service";
import { getUserInviteTemplate, getVerifyEmailTemplate } from "../../domains/communications/emailTemplates/emailTemplates";

const baseUrl = ENV.BASE_URL;

export const emailWorker = new Worker(
  "email",
  async (job) => {
    switch (job.name) {
      case "send_verification_email": {
        const payload: TokenBasedEmailPayload & { url: string } = job.data;

        if (!payload.url)
          throw new Error("Missing url @ send_verification_email");

        const url =
          payload.url ?? `${baseUrl}/verify-email?token=${payload.token}`;

        const { subject, html, text } = getVerifyEmailTemplate(
          payload.name,
          url
        );

        await sendEmail({
          to: payload.to,
          subject,
          html,
          text,
        });

        break;
      }

      case "send_user_invite_email": {
        const payload: InviteEmailPayload = job.data;

        if (!payload.url) throw new Error("Missing url");

        const { subject, html } = getUserInviteTemplate(
          payload.url,
          payload.invitedByUser,
          payload.invitedByOrg
        );

        await sendEmail({
          to: payload.to,
          subject,
          html,
        });

        break;
      }

      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  },
  { connection: redis, concurrency: 5 }
);

// Logging for observability
emailWorker.on("completed", (job) => {
  console.log(`Email job ${job.id} completed`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`Email job ${job?.id} failed: ${err.message}`);
});
