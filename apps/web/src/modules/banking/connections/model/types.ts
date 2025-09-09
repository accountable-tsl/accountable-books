import type { BusinessOrPersonalAccount } from '@/modules/banking/accounts';
import type { BankProviderKey } from '@/modules/banking/providers/model/types';

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
  publicToken: string;
  metadata?: any;
  userId: string;
  companyId: string;
}

export interface ConnectedAccount {
  id: string;
  displayName: string;
  mask: string;
  currencyCode: string;
  businessOrPersonal: BusinessOrPersonalAccount;
}

export interface ConnectedBank {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface ConnectAccountsResponse {
  bank: ConnectedBank;
  accounts: ConnectedAccount[];
}
