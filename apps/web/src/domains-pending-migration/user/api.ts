import type { ApiResponse } from '@/shared/types/core';
import api from '@/lib/axios';

import type { UserData } from './types';

export const getUserDetails = async (
  userId: string,
): Promise<ApiResponse<UserData>> => {
  const response = await api.get(`/api/users/${userId}`);
  return response.data;
};
