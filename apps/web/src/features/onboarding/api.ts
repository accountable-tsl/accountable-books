import api from '@/lib/axios';
import { ResendVerEmailService, VerifyEmailFnResponse } from '@/features/onboarding/types';
import { ApiResponse } from '@/shared/types/core';
import { CompanyData } from '@/domains/company/types';
import { UserData } from '@/domains/user/types';
import { isAxiosError } from 'axios';

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

export const handleEmailVerification = async (data: {
  token?: string;
  userId: string;
}): Promise<ApiResponse<VerifyEmailFnResponse>> => {
  try {
    const res = await api.post(`/auth/verify-email`, data);
    return res.data as ApiResponse<VerifyEmailFnResponse>;
  } catch (err: any) {
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }

    return { success: false, message: 'An unexpected error occurred' };
  }
};
