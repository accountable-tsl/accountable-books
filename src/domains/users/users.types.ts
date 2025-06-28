import { z } from "zod";
import { dbBaseFields, zDate, zEmail } from "../../core/types/core";
import { SnakeToCamelCaseObject } from "../../shared/utils/formatting.utils";
import { userOnboardingState } from "../../features/onboarding/onboarding.types";

// user
export const newUser = z.object({
  id: z.string().uuid().optional(),
  firstname: z.string().min(1).max(256),
  lastname: z.string().min(1).max(256).nullish(),

  email: zEmail(),
  password: z.string().min(8).nullable(),

  phone_number: z.string().max(50).nullish(),
  avatar_url: z.string().nullish(),
  avatar_key: z.string().nullish(),

  email_verified_at: zDate.nullish(),

  last_active_company_id: z.string().uuid().nullish(),
  onboarding_state: userOnboardingState,

  // is_demo_user: z.boolean().default(false).optional(),
});

export const newUserDirect = newUser.extend({
  password: z.string().min(8),
});

export const newUserInvite = newUser.omit({ password: true });

export const user = newUser.merge(dbBaseFields);
export type NewUserDirect = z.infer<typeof newUserDirect>;
export type NewUserInvite = z.infer<typeof newUserInvite>;
export type NewUserInput = z.infer<typeof newUser>;
export type User = z.infer<typeof user>;

export type NewUserInputCamel = SnakeToCamelCaseObject<NewUserInput>;
export type UserRecord = z.infer<typeof user> & {
  password?: string; // Only present for local auth
};

export type UserResponseCamel = Omit<SnakeToCamelCaseObject<User>, "password">;

export type UserInfo = Omit<NewUserInput, "password"> & { id: string };
