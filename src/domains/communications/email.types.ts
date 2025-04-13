import { z } from "zod";

export interface BaseEmailPayload {
  to: string;
  subject?: string;
  html?: string;
  text?: string;
  type?: string;
}

export type EmailPayload = BaseEmailPayload &
  (
    | {
        html: string;
        text?: string;
      }
    | {
        html?: string;
        text: string;
      }
  );

export type TokenBasedEmailPayload = BaseEmailPayload & { name: string } & (
    | {
        token: string;
        url?: string;
      }
    | { token?: string; url: string }
  );

export const urlType = z.enum([
  "verify-email",
  "reset-password",
  "accept-invite",
]);
export type UrlType = z.infer<typeof urlType>;

export type UrlParams = {
  token: string;
} & Record<string, string | undefined>;

export type InviteEmailPayload = TokenBasedEmailPayload & {
  invitedByUser: { firstname: string; email: string };
  invitedByOrg: { name: string };
};
