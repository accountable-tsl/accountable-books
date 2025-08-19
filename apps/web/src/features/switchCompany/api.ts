import api from '@/lib/axios';
import type { ApiResponse } from '@/shared/types/core';
import type { AuthCompanyContext, AuthUserContext } from '@/features/auth/types';

export const switchCompanyApi = async (data: {
  newCompanyId: string;
}): Promise<
  ApiResponse<{
    user: AuthUserContext;
    company: AuthCompanyContext;
    csrfToken: string;
  }>
> => {
  const res = await api.post(`/api/companies/switch`, {
    companyId: data.newCompanyId,
  });
  return res.data;
};
