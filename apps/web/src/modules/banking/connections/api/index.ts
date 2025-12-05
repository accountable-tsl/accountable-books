import api from '@/lib/axios';
import type { ApiResponse } from '@/shared/types/core';

import type {
  ConnectAccountRequest,
  ConnectAccountsResponse,
  CreateLinkTokenRequest,
  CreateLinkTokenResponse,
} from '../model/types';

export const createLinkToken = async (
  data: CreateLinkTokenRequest,
): Promise<ApiResponse<CreateLinkTokenResponse>> => {
  const response = await api.post('/api/banking/link-token', data);
  return response.data;
};

export const connectAccounts = async (
  data: ConnectAccountRequest,
): Promise<ApiResponse<ConnectAccountsResponse>> => {
  const response = await api.post('/api/banking/connect-accounts', data);
  return response.data;
};
