import api from '@/lib/axios';
import type { ApiResponse } from '@/shared/types/core';

export interface CreateLinkTokenRequest {
  provider: string;
  userId: string;
  companyId: string;
}

export interface CreateLinkTokenResponse {
  token: string;
}

export interface ExchangeTokenRequest {
  provider: string;
  publicToken: string;
  metadata?: any;
  userId: string;
  companyId: string;
}

export interface ExchangeTokenResponse {
  accessToken: string;
  itemId: string;
}

export const createLinkToken = async (
  data: CreateLinkTokenRequest,
): Promise<ApiResponse<CreateLinkTokenResponse>> => {
  const response = await api.post('/api/banking/link-token', data);
  return response.data;
};

export const exchangeToken = async (
  data: ExchangeTokenRequest,
): Promise<ApiResponse<ExchangeTokenResponse>> => {
  const response = await api.post('/api/banking/exchange-token', data);
  return response.data;
};
