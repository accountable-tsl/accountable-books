import api from "@/lib/axios";
import { ResendVerEmailService } from "./types";
import { ApiResponse } from "@/shared/types/core";
import { CompanyData } from "@/domains/company/types";
import { UserData } from "@/domains/user/types";

export const updateCompanyOnboardingStatus = async (data: {
  userId: string;
  companyId: string;
}): Promise<ApiResponse<{ user: UserData; company: CompanyData }>> => {
  const res = await api.post(`/api/onboarding/advance`, data);
  return res.data;
};

export const resendVerificationEmail = async (data: ResendVerEmailService) => {
  const res = await api.post(`/auth/resend-verification`, data);
  return res.data;
};
