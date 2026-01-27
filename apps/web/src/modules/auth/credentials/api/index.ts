import type { ApiResponse } from '@/shared/types/core';
import api from '@/lib/axios';
import { isAxiosError } from 'axios';

import type { AuthUserContext } from '../../session/model/types';
import type { LoginForm, NewCompany, NewFirm, NewUser } from '../model/types';

export const handleLogin = async (
  data: LoginForm,
): Promise<ApiResponse<{ user: AuthUserContext; csrfToken: string }>> => {
  try {
    const resp = await api.post('/auth/login', data);

    return resp.data as ApiResponse<{
      user: AuthUserContext;
      csrfToken: string;
    }>;
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }

    return { success: false, message: 'An unexpected error occurred' };
  }
};

export const signup = async (data: {
  user: NewUser;
  company: NewCompany;
  firm?: NewFirm;
}): Promise<ApiResponse<any>> => {
  const res = await api.post('/api/signup', { data });
  return res.data;
};
