import { isAxiosError } from 'axios';

import api from '@/lib/axios';
import type { AuthUserContext } from '@/modules/auth/types';
import type { ApiResponse } from '@/shared/types/core';

export const switchCompanyApi = async (
  companyId: string,
): Promise<
  ApiResponse<{
    user: AuthUserContext;
    csrfToken: string;
  }>
> => {
  try {
    const res = await api.post(`/api/companies/switch`, {
      companyId,
    });
    return res.data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.data) {
      return error.response.data;
    }

    return { success: false, message: 'An unexpected error occurred' };
  }
};
