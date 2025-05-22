import { UserOnboardingStatus } from "@/domains/user/types";
import api from "@/lib/axios";

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
