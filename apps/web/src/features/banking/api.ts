import api from '@/lib/axios';
import type { ApiResponse } from '@/shared/types/core';
import z from 'zod';
import type { BankProviderKey } from '@/features/banking/utils/providers';

export interface CreateLinkTokenRequest {
  provider: string;
  userId: string;
  companyId: string;
}

export interface CreateLinkTokenResponse {
  token: string;
}


export const bankAccountConnectionStatus = z.enum([
  'active',
  'revoked',
  'error',
  'pending_sync',
  'pending_resolution',
]);
export type BankAccountConnectionStatus = z.infer<typeof bankAccountConnectionStatus>;

export interface ConnectAccountRequest {
  providerKey: BankProviderKey;
  publicToken: string;
  metadata?: any;
  userId: string;
  companyId: string;
}
export interface ConnectedAccount {
  id: string;
  displayName: string;
  accountType: string;
  accountNumber?: string;
  mask?: string;
  currencyCode: string;
  bankName?: string;
  bankLogo?: string;
  requiresClassification: boolean;
  syncStatus?: BankAccountConnectionStatus;
  metadata?: Record<string, unknown>;
}

export interface ConnectAccountsResponse {
  status: 'complete' | 'partial';
  accounts: ConnectedAccount[];
  syncDetails: {
    total: number;
    created: number;
    staged: number;
    institutionResolved: boolean;
    allAccountsCreated: boolean;
    coaCreated: boolean;
    backgroundJobId?: string;
    estimatedCompletion?: string;
  };
}

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
  console.log(response.data);
  return response.data;
};
