import { z } from "zod";

export const tokenType = z.enum([
  "email_verification",
  "user_invite",
  "password_reset",
]);
export type TokenType = z.infer<typeof tokenType>;

export const baseToken = z.object({
  token_type: tokenType,
  token_hash: z.string(),
  user_id: z.string().uuid().nullish(),
  invitation_id: z.string().uuid().nullish(),
  company_id: z.string().uuid().nullish(),
  expires_at: z.date(),
  consumed_at: z.date().nullish(),
  updated_at: z.date().nullish(),
});

export const newToken = baseToken.refine(
  (data) => data.user_id || data.invitation_id,
  {
    message: "Either user_id or invitation_id must be provided",
  }
);
export type NewToken = z.infer<typeof newToken>;

export const token = baseToken.extend({
  id: z.string().uuid(),
  created_at: z.date(),
});
export type Token = z.infer<typeof token>;
