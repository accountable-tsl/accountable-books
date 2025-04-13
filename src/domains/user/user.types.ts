import { z } from "zod";
import { dbBaseFields, zDate, zEmail } from "../../core/validation/schemas";

// user
export const userStatus = z.enum(["active", "inactive", "invited", "disabled"]);
export const userInviteStatus = z.enum(["pending", "accepted", "declined"]);
export const authProvider = z.enum(["local"]);
export const newUser = z.object({
  firstname: z.string().min(1).max(256),
  lastname: z.string().min(1).max(256).nullish(),
  email: zEmail(),
  password_hash: z.string().min(8).optional(),
  phone_number: z.string().max(50).nullish(),
  avatar_url: z.string().nullish(),
  status: userStatus,

  email_verified: z.boolean().default(false),
  email_verification_expiry: zDate.nullish(),
  email_verified_at: zDate.nullish(),
  email_verification_token_hash: z.string().nullish(),

  invite_status: userInviteStatus.nullish(),
  invited_by_id: z.string().uuid().nullish(),
  invited_at: zDate.nullish(),
  invite_expiry: zDate.nullish(),

  failed_login_attempts: z.number().default(0),
  last_login_at: zDate.nullish(),
  last_failed_login_at: zDate.nullish(),

  auth_provider: authProvider.default("local").nullish(),
  provider_user_id: z.string().nullish(),
});

export const newUserDirect = newUser.extend({
  password: z.string().min(8),
  status: z.literal("active"),
});

export const newUserInvite = newUser.extend({
  password: z.undefined(),
  status: z.literal("invited"),
});

export const user = newUser.merge(dbBaseFields);
export type NewUserDirect = z.infer<typeof newUserDirect>;
export type NewUserInvite = z.infer<typeof newUserInvite>;
export type UserStatus = z.infer<typeof userStatus>;
export type UserInviteStatus = z.infer<typeof userInviteStatus>;
export type NewUserInput = z.infer<typeof newUser>;
export type User = z.infer<typeof user>;
