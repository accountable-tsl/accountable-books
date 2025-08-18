import api from '@/lib/axios';
import { ApiResponse } from '@/shared/types/core';
import { UserData } from './types';

export const getUserDetails = async (userId: string): Promise<ApiResponse<UserData>> => {
  const response = await api.get(`/api/users/${userId}`);
  return response.data;
};
