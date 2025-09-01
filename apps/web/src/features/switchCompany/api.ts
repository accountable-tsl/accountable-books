import api from '@/lib/axios';
import type { ApiResponse } from '@/shared/types/core';
import type { AuthCompanyContext, AuthUserContext } from '@/features/auth/types';

export const switchCompanyApi = async (
  companyId: string,
): Promise<
  ApiResponse<{
    user: AuthUserContext;
    company: AuthCompanyContext;
  }>
> => {
  const res = await api.post(`/api/companies/switch`, {
    companyId,
  });
  return res.data;
};
