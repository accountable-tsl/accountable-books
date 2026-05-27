import type {
  ResendVerEmailService,
  VerifyEmailFnResponse,
} from '@/domains-pending-migration/onboarding/types';
import type { UserData } from '@/domains-pending-migration/user/types';
import type { CompanyData } from '@/modules/company/companies';
import type { ApiResponse } from '@/shared/types/core';
import api from '@/lib/axios';
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
    console.log({ res: res.data });
    return res.data as ApiResponse<VerifyEmailFnResponse>;
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }

    return { success: false, message: 'An unexpected error occurred' };
  }
};
