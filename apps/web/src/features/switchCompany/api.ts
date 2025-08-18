import api from '@/lib/axios';
import { ApiResponse } from '@/shared/types/core';
import { AuthCompanyContext, UserContext } from '@/features/auth/types';

export const switchCompanyApi = async (data: {
  newCompanyId: string;
}): Promise<
  ApiResponse<{
    user: UserContext;
    company: AuthCompanyContext;
    csrfToken: string;
  }>
> => {
  const res = await api.post(`/api/companies/switch`, {
    companyId: data.newCompanyId,
  });
  return res.data;
};
