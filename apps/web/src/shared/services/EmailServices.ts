import api from '@/lib/axios';
import { ApiResponse } from '@/shared/types/core';

export type CheckEmailProps = {
  email: string;
  purpose: 'signup' | 'resetPassword' | 'verifyEmail';
};
// Check if email already exists in db
export const checkEmail = async ({
  email,
  purpose = 'signup',
}: CheckEmailProps): Promise<ApiResponse<string | null>> => {
  const res = await api.post(`/api/email/check`, { email, purpose });

  return res.data;
};
