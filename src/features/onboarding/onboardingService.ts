import { UserOnboardingStatus } from "@/domains/user/types";
import api from "@/lib/axios";
import { ResendVerEmailService } from "./types";

// export const resendVerificationEmail = async (token) => {
//   await api.get(`"/auth/verify-email`);
// };

export const updateOnboardingStatus = async (data: {
  userId: string;
  onboardingStatus: UserOnboardingStatus;
}) => {
  const res = await api.post(`/api/onboarding/status`, data);
  return res.data;
};

export const resendVerificationEmail = async (data: ResendVerEmailService) => {
  const res = await api.post(`/auth/resend-verification`, data);
  return res.data;
};
