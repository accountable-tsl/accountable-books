import type { BankProviderKey } from '@/modules/banking/providers/model/types';
import type { ConnectAccountsResponse } from '@accountable-books/contracts/schema';

export type { ConnectAccountsResponse };
export type {
  ConnectedAccount,
  ConnectedBank,
} from '@accountable-books/contracts/schema';

export interface CreateLinkTokenRequest {
  provider: string;
  userId: string;
  companyId: string;
}

export interface CreateLinkTokenResponse {
  token: string;
}

export interface ConnectAccountRequest {
  providerKey: BankProviderKey;
  countryCode: string;
  publicToken: string;
  metadata?: any;
  userId: string;
  companyId: string;
}
