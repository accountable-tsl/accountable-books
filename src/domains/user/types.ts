import { z } from "zod";

export const userStatus = z.enum(["active", "inactive", "invited", "disabled"]);
export type UserStatus = z.infer<typeof userStatus>;

export const userInviteStatus = z.enum(["pending", "accepted", "declined"]);
export type UserInviteStatus = z.infer<typeof userInviteStatus>;

export const userOnboardingStatus = z.enum([
  "not_started",
  "email_verified",
  "creator_vitals_needed",
  "creator_bank_account_needed",
  "onboarding_complete",
]);
export type UserOnboardingStatus = z.infer<typeof userOnboardingStatus>;

export type UserData = {
  id: string;
  email: string;
  firstname: string;
  lastname: string;
  phoneNumber: string | null;
  status: UserStatus;
  onboardingStatus: UserOnboardingStatus;

  avatarUrl?: string | null;
  inviteStatus?: UserInviteStatus | null;
  emailVerified: boolean;
  emailVerificationTokenHash?: string | null;
  emailVerificationExpiry?: Date | string | null;
  emailVerifiedAt?: Date | string | null;
  inviteTokenHash?: string | null;
  invitedById?: string | null;
  invitedAt?: Date | string | null;
  inviteExpiry?: Date | string | null;
  lastActiveCompanyId: null;
  lastLoginAt?: Date | string | null;
  failedLoginAttempts?: string | number;
  lastFailedLoginAt?: Date | string | null;
  authProvider?: string;
  providerUserId?: string | null;
  mfaEnabled?: boolean;
  mfaSecret?: string | null;
  isDemoUser?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  isDeleted?: boolean;
  deletedAt?: Date | String | null;
};
