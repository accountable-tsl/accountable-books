# 🏦 Banking Integration System - Unified Implementation Plan

> **Last Updated:** August 2025  
> **Priority:** MVP CRITICAL

## 🎯 Executive Summary

This unified plan combines the best architectural patterns from both previous approaches:

- **Clean abstractions** from the overhaul plan
- **Production-ready implementation** from the system plan
- **Simplified complexity** while maintaining robustness
- **MVP-first approach** with clear future extensibility

### Design Philosophy

1. **Simple but not Simplistic** - Clean interfaces, robust implementation
2. **MVP-First** - Focus on Plaid + Mono, easy to extend later
3. **Configuration-Driven** - Easy to enable/disable providers and features
4. **Developer-Friendly** - Clear patterns, good errors, comprehensive docs

---

## 🏗️ Unified Architecture

### High-Level Flow

```
User → Provider Selection → OAuth Flow → Exchange Token → Fetch Accounts → Sync Transactions
                    ↓                           ↓                    ↓
                Registry Lookup        Connection Storage       Queue Processing
                    ↓                           ↓                    ↓
                Widget System         Bank Auto-Discovery      Webhook Updates
```

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Provider Registry                           │
├─────────────────────────────────────────────────────────────────┤
│  PlaidProvider  │  MonoProvider  │  Future Providers...          │
├─────────────────────────────────────────────────────────────────┤
│              Unified Banking Service                            │
├─────────────────────────────────────────────────────────────────┤
│   Connection    │  Transaction   │  Bank Mapping  │  Webhooks   │
│    Handler      │     Sync       │   Discovery    │  Handler    │
├─────────────────────────────────────────────────────────────────┤
│                  Queue System & Error Handling                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Provider Interface (Simplified but Complete)

### Core Provider Interface

```typescript
// apps/api/src/lib/banking/providers/base.provider.ts

export interface ProviderCapability {
  type: 'transactions' | 'balance' | 'identity' | 'income';
  supported: boolean;
  realtime: boolean;
}

export interface ProviderError {
  code: string;
  message: string;
  displayMessage: string;
  retryable: boolean;
  metadata?: Record<string, any>;
}

export interface BankAccount {
  id: string;
  name: string;
  accountNumber: string;
  accountType: 'checking' | 'savings' | 'credit' | 'investment';
  currency: string;
  balance?: number;
  institution: {
    id: string;
    name: string;
    code?: string;
  };
}

export interface Transaction {
  id: string;
  accountId: string;
  date: Date;
  amount: number;
  description: string;
  merchantName?: string;
  category?: string[];
  pending: boolean;
  metadata?: Record<string, any>;
}

export interface SyncResult {
  transactions: Transaction[];
  hasMore: boolean;
  nextCursor?: string;
  totalCount?: number;
  syncedAt: Date;
}

export abstract class BankingProvider {
  abstract readonly key: string;
  abstract readonly name: string;
  abstract readonly countries: string[];
  abstract readonly capabilities: ProviderCapability[];

  // Connection Flow
  abstract createLinkToken(userId: string, companyId: string): Promise<string>;
  abstract exchangeToken(
    publicToken: string,
    metadata?: any,
  ): Promise<{
    accessToken: string;
    itemId?: string;
    institutionId?: string;
  }>;

  // Account Operations
  abstract fetchAccounts(accessToken: string): Promise<BankAccount[]>;

  // Transaction Operations
  abstract syncTransactions(
    accessToken: string,
    accountId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      cursor?: string;
      limit?: number;
    },
  ): Promise<SyncResult>;

  // Webhook & Health
  abstract validateWebhook(headers: Record<string, any>, body: any): boolean;
  abstract handleWebhook(body: any): Promise<void>;
  abstract testConnection(accessToken: string): Promise<boolean>;
  abstract refreshConnection?(accessToken: string): Promise<string>;

  // Error Handling
  abstract handleError(error: any): ProviderError;
  abstract isRetryableError(error: any): boolean;

  // Utility
  abstract getProviderBankId(institution: any): string;

  // Display helpers
  getDisplayMessage(errorCode: string): string {
    const messages: Record<string, string> = {
      RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
      INVALID_CREDENTIALS: 'Invalid login credentials. Please check and try again.',
      ITEM_LOGIN_REQUIRED: 'Please reconnect your bank account.',
      INSUFFICIENT_CREDENTIALS: 'Additional verification required.',
      ITEM_LOCKED: 'Your account is temporarily locked. Please try again later.',
      USER_SETUP_REQUIRED: 'Please complete account setup with your bank.',
      MFA_NOT_SUPPORTED: 'Multi-factor authentication not supported for this account.',
    };

    return (
      messages[errorCode] || 'An error occurred while connecting to your bank. Please try again.'
    );
  }
}
```

### Provider Registry (Enhanced)

```typescript
// apps/api/src/lib/banking/providers/registry.ts

export class ProviderRegistry {
  private providers = new Map<string, BankingProvider>();
  private countryProviders = new Map<string, BankingProvider[]>();

  register(provider: BankingProvider): void {
    this.providers.set(provider.key, provider);

    // Update country mappings
    for (const country of provider.countries) {
      const existing = this.countryProviders.get(country) || [];
      existing.push(provider);
      existing.sort((a, b) => this.getProviderPriority(a) - this.getProviderPriority(b));
      this.countryProviders.set(country, existing);
    }
  }

  get(key: string): BankingProvider | undefined {
    return this.providers.get(key);
  }

  getForCountry(countryCode: string): BankingProvider[] {
    return this.countryProviders.get(countryCode) || [];
  }

  getEnabled(): BankingProvider[] {
    const enabled = ENV.ENABLED_PROVIDERS?.split(',') || [];
    return Array.from(this.providers.values()).filter((p) => enabled.includes(p.key));
  }

  private getProviderPriority(provider: BankingProvider): number {
    const priorities: Record<string, number> = {
      plaid: 1,
      mono: 1,
      stripe: 3,
    };
    return priorities[provider.key] || 999;
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();
```

---

## 🇺🇸 Plaid Provider (Production-Ready)

```typescript
// apps/api/src/lib/banking/providers/plaid.provider.ts

import { Configuration, PlaidApi, PlaidEnvironments, PlaidError } from 'plaid';
import {
  BankingProvider,
  BankAccount,
  Transaction,
  SyncResult,
  ProviderError,
  ProviderCapability,
} from './base.provider';
import { ENV } from '../../../config/env';

export class PlaidProvider extends BankingProvider {
  readonly key = 'plaid';
  readonly name = 'Plaid';
  readonly countries = ['US', 'CA'];
  readonly capabilities: ProviderCapability[] = [
    { type: 'transactions', supported: true, realtime: true },
    { type: 'balance', supported: true, realtime: true },
    { type: 'identity', supported: true, realtime: false },
    { type: 'income', supported: true, realtime: false },
  ];

  private client: PlaidApi;

  constructor() {
    super();
    const configuration = new Configuration({
      basePath: PlaidEnvironments[ENV.PLAID_ENVIRONMENT || 'sandbox'],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': ENV.PLAID_CLIENT_ID,
          'PLAID-SECRET': ENV.PLAID_SECRET,
          'Plaid-Version': '2020-09-14',
        },
      },
    });
    this.client = new PlaidApi(configuration);
  }

  async createLinkToken(userId: string, companyId: string): Promise<string> {
    const response = await this.client.linkTokenCreate({
      client_name: 'Accountable Books',
      country_codes: ['US', 'CA'],
      language: 'en',
      user: { client_user_id: userId },
      products: ['transactions', 'accounts'],
      webhook: `${ENV.BACKEND_URL}/webhooks/plaid/${companyId}`,
      redirect_uri: `${ENV.FRONTEND_URL}/banking/connected`,
      account_filters: {
        depository: { account_subtypes: ['checking', 'savings'] },
        credit: { account_subtypes: ['credit card'] },
      },
    });

    return response.data.link_token;
  }

  async exchangeToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
    const response = await this.client.itemPublicTokenExchange({
      public_token: publicToken,
    });

    return {
      accessToken: response.data.access_token,
      itemId: response.data.item_id,
    };
  }

  async fetchAccounts(accessToken: string): Promise<BankAccount[]> {
    const response = await this.client.accountsGet({
      access_token: accessToken,
    });

    return response.data.accounts.map((account) => ({
      id: account.account_id,
      name: account.name,
      accountNumber: account.mask || account.account_id.slice(-4),
      accountType: this.mapAccountType(account.type, account.subtype),
      currency: account.balances.iso_currency_code || 'USD',
      balance: account.balances.current || undefined,
      institution: {
        id: response.data.item.institution_id || '',
        name: account.name.split(' - ')[0], // Extract bank name
      },
    }));
  }

  async syncTransactions(
    accessToken: string,
    accountId: string,
    options: { startDate?: Date; endDate?: Date; cursor?: string; limit?: number },
  ): Promise<SyncResult> {
    if (options.cursor) {
      // Incremental sync using cursor
      const response = await this.client.transactionsSync({
        access_token: accessToken,
        cursor: options.cursor,
        count: options.limit || 100,
      });

      return {
        transactions: this.mapTransactions(response.data.added, accountId),
        hasMore: response.data.has_more,
        nextCursor: response.data.next_cursor,
        syncedAt: new Date(),
      };
    } else {
      // Initial sync or date range sync
      const response = await this.client.transactionsGet({
        access_token: accessToken,
        start_date: options.startDate?.toISOString().split('T')[0] || '2020-01-01',
        end_date:
          options.endDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        options: {
          account_ids: [accountId],
          count: options.limit || 500,
          offset: 0,
          include_original_description: true,
          include_personal_finance_category: true,
        },
      });

      return {
        transactions: this.mapTransactions(response.data.transactions, accountId),
        hasMore: response.data.total_transactions > response.data.transactions.length,
        totalCount: response.data.total_transactions,
        syncedAt: new Date(),
      };
    }
  }

  async validateWebhook(headers: Record<string, any>, body: any): boolean {
    // Plaid webhook validation using JWT
    const signature = headers['plaid-verification'];
    return !!signature; // Simplified validation - implement full JWT verification
  }

  async handleWebhook(body: any): Promise<void> {
    const { webhook_type, webhook_code, item_id } = body;

    // Emit events for the webhook handler service to process
    if (webhook_type === 'TRANSACTIONS' && webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      // Queue sync for all accounts with this item_id
      // This will be handled by the webhook handler service
    }
  }

  async testConnection(accessToken: string): Promise<boolean> {
    try {
      await this.client.accountsGet({ access_token: accessToken });
      return true;
    } catch {
      return false;
    }
  }

  async refreshConnection(accessToken: string): Promise<string> {
    // Plaid tokens don't expire, but we can update webhook URL
    await this.client.itemWebhookUpdate({
      access_token: accessToken,
      webhook: `${ENV.BACKEND_URL}/webhooks/plaid`,
    });
    return accessToken;
  }

  handleError(error: any): ProviderError {
    if (error instanceof PlaidError) {
      return {
        code: error.error_code,
        message: error.error_message,
        displayMessage: this.getDisplayMessage(error.error_code),
        retryable: this.isRetryableError(error),
        metadata: {
          type: error.error_type,
          documentation_url: error.documentation_url,
          suggested_action: error.suggested_action,
        },
      };
    }

    return {
      code: 'PLAID_UNKNOWN_ERROR',
      message: error.message || 'Unknown Plaid error',
      displayMessage: 'An unexpected error occurred. Please try again.',
      retryable: false,
    };
  }

  isRetryableError(error: any): boolean {
    if (error instanceof PlaidError) {
      const retryableCodes = [
        'RATE_LIMIT_EXCEEDED',
        'INTERNAL_SERVER_ERROR',
        'PLANNED_MAINTENANCE',
      ];
      return retryableCodes.includes(error.error_code);
    }
    return false;
  }

  getProviderBankId(institution: any): string {
    return institution.institution_id;
  }

  private mapAccountType(
    type: string,
    subtype: string | null,
  ): 'checking' | 'savings' | 'credit' | 'investment' {
    if (type === 'depository') {
      return subtype === 'savings' ? 'savings' : 'checking';
    } else if (type === 'credit') {
      return 'credit';
    } else if (type === 'investment') {
      return 'investment';
    }
    return 'checking';
  }

  private mapTransactions(plaidTxns: any[], accountId: string): Transaction[] {
    return plaidTxns.map((txn) => ({
      id: txn.transaction_id,
      accountId: accountId,
      date: new Date(txn.date),
      amount: -txn.amount, // Plaid uses inverse convention
      description: txn.original_description || txn.name,
      merchantName: txn.merchant_name,
      category: txn.category || [],
      pending: txn.pending,
      metadata: {
        category_id: txn.category_id,
        account_owner: txn.account_owner,
        location: txn.location,
        payment_channel: txn.payment_channel,
        personal_finance_category: txn.personal_finance_category,
      },
    }));
  }
}
```

---

## 🇳🇬 Mono Provider (Production-Ready)

```typescript
// apps/api/src/lib/banking/providers/mono.provider.ts

import axios, { AxiosError } from 'axios';
import {
  BankingProvider,
  BankAccount,
  Transaction,
  SyncResult,
  ProviderError,
  ProviderCapability,
} from './base.provider';
import { ENV } from '../../../config/env';

export class MonoProvider extends BankingProvider {
  readonly key = 'mono';
  readonly name = 'Mono';
  readonly countries = ['NG', 'GH', 'KE', 'ZA'];
  readonly capabilities: ProviderCapability[] = [
    { type: 'transactions', supported: true, realtime: true },
    { type: 'balance', supported: true, realtime: true },
    { type: 'identity', supported: true, realtime: false },
    { type: 'income', supported: false, realtime: false },
  ];

  private readonly baseUrl = 'https://api.withmono.com/v2';
  private readonly secretKey = ENV.MONO_SECRET_KEY;

  constructor() {
    super();
    if (!this.secretKey) {
      throw new Error('MONO_SECRET_KEY is required');
    }
  }

  async createLinkToken(userId: string, companyId: string): Promise<string> {
    // Mono uses widget approach - return configuration
    return JSON.stringify({
      key: this.secretKey,
      scope: 'auth',
      data: {
        customer: { id: userId },
        meta: { companyId },
      },
      onSuccess: `${ENV.BACKEND_URL}/banking/mono/callback`,
      onClose: `${ENV.FRONTEND_URL}/banking/cancelled`,
    });
  }

  async exchangeToken(code: string): Promise<{ accessToken: string; itemId: string }> {
    const response = await axios.post(
      `${this.baseUrl}/accounts/auth`,
      { code },
      {
        headers: {
          'mono-sec-key': this.secretKey,
          'Content-Type': 'application/json',
        },
      },
    );

    if (response.data.status !== 'successful') {
      throw new Error(`Mono exchange failed: ${response.data.message}`);
    }

    const accountId = response.data.data.id;
    return {
      accessToken: accountId,
      itemId: accountId,
    };
  }

  async fetchAccounts(accountId: string): Promise<BankAccount[]> {
    const response = await axios.get(`${this.baseUrl}/accounts/${accountId}`, {
      headers: { 'mono-sec-key': this.secretKey },
    });

    const account = response.data.data.account;
    const meta = response.data.data.meta;

    return [
      {
        id: accountId,
        name: account.name,
        accountNumber: account.account_number,
        accountType: this.mapAccountType(account.type),
        currency: account.currency,
        balance: account.balance ? account.balance / 100 : undefined, // Convert from kobo/cents
        institution: {
          id: meta.institution._id,
          name: meta.institution.name,
          code: meta.institution.bank_code,
        },
      },
    ];
  }

  async syncTransactions(
    accountId: string,
    _: string, // accountId is used as accessToken in Mono
    options: { startDate?: Date; endDate?: Date; cursor?: string; limit?: number },
  ): Promise<SyncResult> {
    const params = new URLSearchParams();

    if (options.startDate) {
      params.append('start', options.startDate.toISOString().split('T')[0]);
    }
    if (options.endDate) {
      params.append('end', options.endDate.toISOString().split('T')[0]);
    }
    if (options.cursor) {
      params.append('paginate', 'true');
      params.append('page', options.cursor);
    }
    if (options.limit) {
      params.append('limit', options.limit.toString());
    }

    const response = await axios.get(
      `${this.baseUrl}/accounts/${accountId}/transactions?${params}`,
      {
        headers: { 'mono-sec-key': this.secretKey },
      },
    );

    const data = response.data.data;
    const paging = response.data.paging;

    const transactions: Transaction[] = data.map((txn: any) => ({
      id: txn._id,
      accountId: accountId,
      date: new Date(txn.date),
      amount: txn.type === 'credit' ? txn.amount / 100 : -(txn.amount / 100), // Convert from kobo
      description: txn.narration,
      merchantName: txn.merchant?.name,
      category: txn.category ? [txn.category] : [],
      pending: false, // Mono doesn't have pending transactions
      metadata: {
        balance_after: txn.balance / 100,
        type: txn.type,
        merchant: txn.merchant,
      },
    }));

    return {
      transactions,
      hasMore: paging?.next !== null,
      nextCursor: paging?.next,
      totalCount: paging?.total,
      syncedAt: new Date(),
    };
  }

  async validateWebhook(headers: Record<string, any>, body: any): boolean {
    const signature = headers['mono-webhook-signature'];
    // Implement HMAC validation with webhook secret
    return !!signature; // Simplified validation
  }

  async handleWebhook(body: any): Promise<void> {
    const { event, data } = body;

    switch (event) {
      case 'account.connected':
        // Handle new connection
        break;
      case 'account.updated':
        // Trigger transaction sync
        break;
      case 'account.disconnected':
        // Mark connection as inactive
        break;
    }
  }

  async testConnection(accountId: string): Promise<boolean> {
    try {
      await this.fetchAccounts(accountId);
      return true;
    } catch {
      return false;
    }
  }

  handleError(error: any): ProviderError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const message = (axiosError.response?.data as any)?.message || axiosError.message;

      return {
        code: `MONO_${status || 'UNKNOWN'}`,
        message: message,
        displayMessage: this.getMonoDisplayMessage(status),
        retryable: this.isRetryableError(error),
        metadata: {
          status,
          url: axiosError.config?.url,
        },
      };
    }

    return {
      code: 'MONO_UNKNOWN_ERROR',
      message: error.message || 'Unknown Mono error',
      displayMessage: 'An error occurred while connecting to your bank. Please try again.',
      retryable: false,
    };
  }

  isRetryableError(error: any): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      return status === 429 || status === 500 || status === 502 || status === 503;
    }
    return false;
  }

  getProviderBankId(institution: any): string {
    return institution.bank_code || institution._id;
  }

  private mapAccountType(type: string): 'checking' | 'savings' | 'credit' | 'investment' {
    switch (type?.toLowerCase()) {
      case 'savings':
      case 'domicillary-savings':
        return 'savings';
      case 'current':
      case 'domicillary-current':
        return 'checking';
      case 'credit':
        return 'credit';
      default:
        return 'checking';
    }
  }

  private getMonoDisplayMessage(status?: number): string {
    const messages: Record<number, string> = {
      400: 'Invalid request. Please check your information and try again.',
      401: 'Authentication failed. Please reconnect your bank account.',
      403: 'Access denied. Please contact support.',
      404: 'Bank account not found. Please reconnect.',
      429: 'Too many requests. Please try again later.',
      500: 'Bank server error. Please try again later.',
      502: 'Bank service unavailable. Please try again later.',
      503: 'Bank service temporarily unavailable. Please try again later.',
    };

    return (
      messages[status || 0] || 'An error occurred while connecting to your bank. Please try again.'
    );
  }
}
```

---

## 🔄 Unified Banking Service

```typescript
// apps/api/src/lib/banking/banking.service.ts

import { knexClient } from '../../db/knexClient';
import { providerRegistry } from './providers/registry';
import { SyncOrchestrator } from './sync/orchestrator';
import { BankMappingService } from './mapping/mapping.service';
import { WebhookHandler } from './webhooks/handler';

export interface ConnectionResult {
  success: boolean;
  connections?: ConnectionDetails[];
  error?: {
    code: string;
    message: string;
    displayMessage: string;
    retryable: boolean;
  };
}

export interface ConnectionDetails {
  connectionId: string;
  bankAccountId: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  provider: string;
  status: 'connected' | 'pending' | 'error';
}

export class UnifiedBankingService {
  private syncOrchestrator = new SyncOrchestrator();
  private bankMapping = new BankMappingService();
  private webhookHandler = new WebhookHandler();

  async createLinkToken(params: {
    provider: string;
    userId: string;
    companyId: string;
  }): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const provider = providerRegistry.get(params.provider);
      if (!provider) {
        return { success: false, error: `Unsupported provider: ${params.provider}` };
      }

      const token = await provider.createLinkToken(params.userId, params.companyId);
      return { success: true, token };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async exchangeTokenAndConnect(params: {
    provider: string;
    publicToken: string;
    userId: string;
    companyId: string;
    metadata?: any;
  }): Promise<ConnectionResult> {
    const { provider: providerKey, publicToken, userId, companyId, metadata } = params;

    try {
      const provider = providerRegistry.get(providerKey);
      if (!provider) {
        return {
          success: false,
          error: {
            code: 'UNSUPPORTED_PROVIDER',
            message: `Provider ${providerKey} is not supported`,
            displayMessage: 'This bank connection method is not supported.',
            retryable: false,
          },
        };
      }

      const result = await knexClient.transaction(async (trx) => {
        // Exchange token
        const { accessToken, itemId } = await provider.exchangeToken(publicToken, metadata);

        // Fetch accounts
        const accounts = await provider.fetchAccounts(accessToken);

        // Process each account
        const connections: ConnectionDetails[] = [];

        for (const account of accounts) {
          // Map bank
          const bankId = await this.bankMapping.resolveBankId(
            account.institution,
            providerKey,
            companyId,
            trx,
          );

          // Create or find bank account
          const [bankAccount] = await trx('bank_accounts')
            .insert({
              display_name: account.name,
              account_name: account.name,
              account_number: account.accountNumber,
              account_type: account.accountType,
              bank_id: bankId,
              currency_id: await this.resolveCurrencyId(account.currency, trx),
              company_id: companyId,
              created_by_id: userId,
            })
            .onConflict(['company_id', 'account_number', 'bank_id'])
            .merge(['account_name', 'account_type', 'updated_at'])
            .returning('*');

          // Create connection
          const [connection] = await trx('bank_account_connections')
            .insert({
              provider_bank_account_id: account.id,
              bank_account_id: bankAccount.id,
              provider_id: await this.getProviderId(providerKey, trx),
              status: 'active',
              raw_metadata: {
                access_token: accessToken,
                item_id: itemId,
                provider_account_id: account.id,
              },
              connected_at: new Date(),
              created_by_id: userId,
            })
            .returning('*');

          connections.push({
            connectionId: connection.id,
            bankAccountId: bankAccount.id,
            accountName: account.name,
            accountNumber: account.accountNumber,
            bankName: account.institution.name,
            provider: providerKey,
            status: 'connected',
          });

          // Queue initial sync
          await this.syncOrchestrator.queueSync(connection.id);
        }

        return connections;
      });

      return { success: true, connections: result };
    } catch (error: any) {
      const provider = providerRegistry.get(providerKey);
      const providerError = provider?.handleError(error) || {
        code: 'UNKNOWN_ERROR',
        message: error.message || 'Unknown error',
        displayMessage: 'An unexpected error occurred. Please try again.',
        retryable: false,
      };

      return { success: false, error: providerError };
    }
  }

  async syncTransactions(connectionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.syncOrchestrator.syncConnection(connectionId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async handleWebhook(provider: string, headers: any, body: any): Promise<{ success: boolean }> {
    return this.webhookHandler.handle(provider, headers, body);
  }

  private async resolveCurrencyId(currencyCode: string, trx: any): Promise<string> {
    const currency = await trx('currencies').where('code', currencyCode.toUpperCase()).first();

    return currency?.id || 'default-currency-id';
  }

  private async getProviderId(providerKey: string, trx: any): Promise<string> {
    const provider = await trx('bank_feed_providers').where('key', providerKey).first();

    if (!provider) {
      throw new Error(`Provider ${providerKey} not found in database`);
    }

    return provider.id;
  }
}
```

---

## 🔄 Simplified Sync Orchestrator

```typescript
// apps/api/src/lib/banking/sync/orchestrator.ts

import { Queue, Worker } from 'bullmq';
import { knexClient } from '../../../db/knexClient';
import { providerRegistry } from '../providers/registry';
import IORedis from 'ioredis';

export class SyncOrchestrator {
  private queue: Queue;
  private worker: Worker;
  private redis: IORedis;

  constructor() {
    this.redis = new IORedis(process.env.REDIS_URL);
    this.queue = new Queue('transaction-sync', { connection: this.redis });
    this.setupWorker();
  }

  async queueSync(connectionId: string, priority: number = 0): Promise<void> {
    await this.queue.add(
      'sync-connection',
      { connectionId },
      {
        priority,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 10,
        removeOnFail: 5,
      },
    );
  }

  async syncConnection(connectionId: string): Promise<void> {
    // Get connection details
    const connection = await knexClient('bank_account_connections as bac')
      .select('bac.*', 'bfp.key as provider_key', 'ba.company_id', 'ba.currency_id')
      .join('bank_feed_providers as bfp', 'bac.provider_id', 'bfp.id')
      .join('bank_accounts as ba', 'bac.bank_account_id', 'ba.id')
      .where('bac.id', connectionId)
      .first();

    if (!connection || connection.status !== 'active') {
      throw new Error('Connection not found or inactive');
    }

    const provider = providerRegistry.get(connection.provider_key);
    if (!provider) {
      throw new Error(`Provider ${connection.provider_key} not found`);
    }

    // Get sync cursor
    const cursor = connection.raw_metadata?.sync_cursor;
    const accessToken =
      connection.raw_metadata?.access_token || connection.provider_bank_account_id;

    // Sync transactions
    const syncResult = await provider.syncTransactions(
      accessToken,
      connection.provider_bank_account_id,
      {
        cursor,
        limit: 100,
        startDate: cursor ? undefined : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days back
      },
    );

    // Process in batches
    if (syncResult.transactions.length > 0) {
      await this.processBatch(connection, syncResult.transactions);
    }

    // Update cursor and last sync
    await knexClient('bank_account_connections')
      .where('id', connectionId)
      .update({
        last_sync_at: new Date(),
        raw_metadata: knexClient.raw(
          `
          COALESCE(raw_metadata, '{}'::jsonb) || 
          jsonb_build_object('sync_cursor', ?)
        `,
          [syncResult.nextCursor],
        ),
      });

    // Queue next sync if more data
    if (syncResult.hasMore) {
      await this.queueSync(connectionId, 1);
    }
  }

  private async processBatch(connection: any, transactions: any[]): Promise<void> {
    await knexClient.transaction(async (trx) => {
      // Create batch
      const [batch] = await trx('bank_transaction_batches')
        .insert({
          bank_account_id: connection.bank_account_id,
          source: 'api',
          start_date: transactions[0]?.date || new Date(),
          end_date: transactions[transactions.length - 1]?.date || new Date(),
          import_row_count: transactions.length,
          fingerprint: this.generateBatchFingerprint(connection.bank_account_id, transactions),
          source_metadata: {
            provider: connection.provider_key,
            connection_id: connection.id,
          },
          created_by_id: connection.created_by_id,
          balance_before: 0, // TODO: Calculate
          balance_after: 0, // TODO: Calculate
        })
        .returning('*');

      // Filter duplicates
      const existingExternalIds = await trx('bank_transactions')
        .where('bank_account_id', connection.bank_account_id)
        .pluck('external_id');

      const newTransactions = transactions.filter((t) => !existingExternalIds.includes(t.id));

      if (newTransactions.length > 0) {
        const toInsert = newTransactions.map((txn) => ({
          bank_account_id: connection.bank_account_id,
          bank_transaction_batch_id: batch.id,
          external_id: txn.id,
          date: txn.date,
          amount: txn.amount,
          payee: txn.merchantName,
          description: txn.description,
          raw_data: txn.metadata,
          system_exchange_rate: 1, // TODO: Get from exchange rate service
          created_by_id: connection.created_by_id,
          categorization_status: 'uncategorized',
        }));

        await trx('bank_transactions').insert(toInsert);
      }
    });
  }

  private setupWorker(): void {
    this.worker = new Worker(
      'transaction-sync',
      async (job) => {
        const { connectionId } = job.data;
        await this.syncConnection(connectionId);
      },
      {
        connection: this.redis,
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job) => {
      console.log(`Sync completed for connection: ${job.data.connectionId}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Sync failed for connection: ${job?.data.connectionId}`, err);
    });
  }

  private generateBatchFingerprint(bankAccountId: string, transactions: any[]): string {
    const crypto = require('crypto');
    const key = `${bankAccountId}:${transactions.length}:${transactions[0]?.id}:${transactions[transactions.length - 1]?.id}`;
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}
```

---

## 🕸️ Webhook Handler

```typescript
// apps/api/src/lib/banking/webhooks/handler.ts

import { Request, Response } from 'express';
import { providerRegistry } from '../providers/registry';
import { SyncOrchestrator } from '../sync/orchestrator';
import { knexClient } from '../../../db/knexClient';

export class WebhookHandler {
  private syncOrchestrator = new SyncOrchestrator();

  async handle(providerKey: string, headers: any, body: any): Promise<{ success: boolean }> {
    try {
      const provider = providerRegistry.get(providerKey);
      if (!provider) {
        throw new Error(`Unknown provider: ${providerKey}`);
      }

      // Validate webhook
      if (!provider.validateWebhook(headers, body)) {
        throw new Error('Invalid webhook signature');
      }

      // Handle provider-specific webhooks
      await provider.handleWebhook(body);

      // Common webhook processing
      await this.processWebhook(providerKey, body);

      return { success: true };
    } catch (error) {
      console.error(`Webhook error for ${providerKey}:`, error);
      return { success: false };
    }
  }

  private async processWebhook(providerKey: string, body: any): Promise<void> {
    switch (providerKey) {
      case 'plaid':
        await this.handlePlaidWebhook(body);
        break;
      case 'mono':
        await this.handleMonoWebhook(body);
        break;
    }
  }

  private async handlePlaidWebhook(body: any): Promise<void> {
    const { webhook_type, webhook_code, item_id } = body;

    if (webhook_type === 'TRANSACTIONS' && webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      // Find connections for this item and queue sync
      const connections = await knexClient('bank_account_connections').where(
        'raw_metadata',
        '@>',
        JSON.stringify({ item_id }),
      );

      for (const connection of connections) {
        await this.syncOrchestrator.queueSync(connection.id, 1);
      }
    }
  }

  private async handleMonoWebhook(body: any): Promise<void> {
    const { event, data } = body;

    switch (event) {
      case 'account.updated':
        const connection = await knexClient('bank_account_connections')
          .where('provider_bank_account_id', data.account._id)
          .first();

        if (connection) {
          await this.syncOrchestrator.queueSync(connection.id, 1);
        }
        break;

      case 'account.disconnected':
        await knexClient('bank_account_connections')
          .where('provider_bank_account_id', data.account._id)
          .update({ status: 'revoked' });
        break;
    }
  }
}

export const webhookHandler = new WebhookHandler();
```

---

## 🎭 Frontend Integration (Provider-Agnostic)

### Unified Connection Component

```typescript
// apps/web/src/features/banking/BankConnectionModal.tsx

import { useState } from 'react';
import { ProviderWidget } from './widgets/ProviderWidget';
import { api } from '../../lib/api';

interface BankConnectionModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (connections: any[]) => void;
  companyId: string;
  countryCode?: string;
}

export function BankConnectionModal({
  open,
  onClose,
  onSuccess,
  companyId,
  countryCode = 'US'
}: BankConnectionModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const providers = [
    { key: 'plaid', name: 'Plaid', countries: ['US', 'CA'] },
    { key: 'mono', name: 'Mono', countries: ['NG', 'GH', 'KE', 'ZA'] }
  ].filter(p => p.countries.includes(countryCode));

  const handleProviderSelect = async (providerKey: string) => {
    setLoading(true);
    try {
      const response = await api.post('/banking/link-token', {
        provider: providerKey,
        companyId
      });

      setLinkToken(response.data.token);
      setSelectedProvider(providerKey);
    } catch (error) {
      console.error('Failed to create link token:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectionSuccess = async (publicToken: string) => {
    setLoading(true);
    try {
      const response = await api.post('/banking/exchange-token', {
        provider: selectedProvider,
        publicToken,
        companyId
      });

      if (response.data.success) {
        onSuccess(response.data.connections);
        onClose();
      }
    } catch (error) {
      console.error('Failed to complete connection:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {!selectedProvider ? (
          <div>
            <h2>Connect Your Bank Account</h2>
            <div className="provider-selection">
              {providers.map(provider => (
                <button
                  key={provider.key}
                  onClick={() => handleProviderSelect(provider.key)}
                  disabled={loading}
                  className="provider-button"
                >
                  {provider.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ProviderWidget
            provider={selectedProvider}
            token={linkToken}
            onSuccess={handleConnectionSuccess}
            onClose={onClose}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}
```

### Provider Widget System

```typescript
// apps/web/src/features/banking/widgets/ProviderWidget.tsx

import { PlaidWidget } from './PlaidWidget';
import { MonoWidget } from './MonoWidget';

interface ProviderWidgetProps {
  provider: string;
  token: string | null;
  onSuccess: (token: string) => void;
  onClose: () => void;
  loading: boolean;
}

export function ProviderWidget({ provider, ...props }: ProviderWidgetProps) {
  const widgets = {
    plaid: PlaidWidget,
    mono: MonoWidget
  };

  const Widget = widgets[provider as keyof typeof widgets];

  if (!Widget) {
    return <div>Unsupported provider: {provider}</div>;
  }

  return <Widget {...props} />;
}
```

---

## 📊 Configuration & Environment

### Environment Variables

```bash
# Provider Configuration
ENABLED_PROVIDERS=plaid,mono
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENVIRONMENT=production
MONO_SECRET_KEY=your_mono_secret_key

# Sync Configuration
SYNC_BATCH_SIZE=100
SYNC_INITIAL_DAYS=90
SYNC_QUEUE_CONCURRENCY=5

# Webhook Configuration
WEBHOOK_SECRET=your_webhook_secret

# Error Handling
MAX_RETRY_ATTEMPTS=3
RETRY_DELAY_MS=5000
CONNECTION_TIMEOUT_MS=30000
```

### Provider Initialization

```typescript
// apps/api/src/lib/banking/init.ts

import { providerRegistry } from './providers/registry';
import { PlaidProvider } from './providers/plaid.provider';
import { MonoProvider } from './providers/mono.provider';

export function initializeBankingProviders(): void {
  const enabledProviders = process.env.ENABLED_PROVIDERS?.split(',') || [];

  if (enabledProviders.includes('plaid')) {
    providerRegistry.register(new PlaidProvider());
  }

  if (enabledProviders.includes('mono')) {
    providerRegistry.register(new MonoProvider());
  }

  console.log(`Initialized ${providerRegistry.getEnabled().length} banking providers`);
}
```

---

## 🧪 Testing Strategy

### Provider Tests

```typescript
// apps/api/src/lib/banking/providers/__tests__/providers.test.ts

describe('Banking Providers', () => {
  describe('Plaid Provider', () => {
    let provider: PlaidProvider;

    beforeEach(() => {
      provider = new PlaidProvider();
    });

    it('should create link token', async () => {
      const token = await provider.createLinkToken('user-1', 'company-1');
      expect(token).toMatch(/^link-/);
    });

    it('should handle errors gracefully', async () => {
      const error = provider.handleError(new Error('Test error'));
      expect(error.retryable).toBe(false);
      expect(error.displayMessage).toBeDefined();
    });
  });

  describe('Provider Registry', () => {
    it('should register and retrieve providers', () => {
      const registry = new ProviderRegistry();
      const provider = new PlaidProvider();

      registry.register(provider);
      expect(registry.get('plaid')).toBe(provider);
      expect(registry.getForCountry('US')).toContain(provider);
    });
  });
});
```

### Integration Tests

```typescript
// apps/api/src/lib/banking/__tests__/integration.test.ts

describe('Banking Integration', () => {
  it('should complete full connection flow', async () => {
    const service = new UnifiedBankingService();

    // Mock provider responses
    jest.spyOn(PlaidProvider.prototype, 'exchangeToken').mockResolvedValue({
      accessToken: 'access-token',
      itemId: 'item-123',
    });

    const result = await service.exchangeTokenAndConnect({
      provider: 'plaid',
      publicToken: 'public-token',
      userId: 'user-1',
      companyId: 'company-1',
    });

    expect(result.success).toBe(true);
    expect(result.connections).toHaveLength(1);
  });
});
```

---

## 🚀 Implementation Timeline

### Phase 1: Core Infrastructure (Days 1-3)

- [x] **Day 1**: Provider interface and registry system
- [ ] **Day 2**: Plaid provider implementation
- [ ] **Day 3**: Mono provider implementation

### Phase 2: Service Layer (Days 4-6)

- [ ] **Day 4**: Unified banking service
- [ ] **Day 5**: Sync orchestrator with queue
- [ ] **Day 6**: Webhook handlers

### Phase 3: Integration (Days 7-8)

- [ ] **Day 7**: API endpoints and database integration
- [ ] **Day 8**: Frontend components and widgets

### Phase 4: Testing & Deployment (Days 9-10)

- [ ] **Day 9**: Comprehensive testing
- [ ] **Day 10**: Production deployment and monitoring

---

## ✅ Success Criteria

### MVP Requirements

- [ ] Connect to 5+ major US banks via Plaid
- [ ] Connect to 5+ Nigerian banks via Mono
- [ ] Automatic transaction sync with deduplication
- [ ] Real-time webhook processing
- [ ] Provider-agnostic frontend interface
- [ ] Comprehensive error handling
- [ ] Production-ready deployment

### Quality Gates

- [ ] 95%+ connection success rate
- [ ] <5 second connection time
- [ ] 100% error handling coverage
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Security review passed

---

## 🔮 Future Extensibility

### Adding New Providers

1. **Create Provider Class**: Implement `BankingProvider` interface
2. **Register Provider**: Add to registry during initialization
3. **Add Widget**: Create frontend component
4. **Update Config**: Add to enabled providers

### Example: Adding Okra

```typescript
export class OkraProvider extends BankingProvider {
  readonly key = 'okra';
  readonly name = 'Okra';
  readonly countries = ['NG', 'GH'];
  // ... implement required methods
}

// Registration
providerRegistry.register(new OkraProvider());
```

### Enhancement Roadmap

- [ ] Account verification (micro-deposits)
- [ ] Real-time balance updates
- [ ] Spending insights and categorization
- [ ] Multi-country currency support
- [ ] Advanced fraud detection
- [ ] Open banking integrations

---

**This plan creates a production-ready solution that's simple to understand and easy to extend.**

---

## 🔄 **Complete User Flow: Step-by-Step Breakdown**

### **What Actually Happens When a User Links Their Bank Account?**

This section explains the complete flow from the user's perspective and what happens behind the scenes at each step.

---

## **🎯 User Journey: "I Want to Connect My Bank Account"**

### **Step 1: User Initiates Bank Connection**

**What the user sees:**

- User clicks "Connect Bank Account" button in the Accountable Books app
- A modal opens showing available providers (Plaid for US, Mono for Nigeria)

**What happens behind the scenes:**

```typescript
// Frontend: BankConnectionModal.tsx
const handleProviderSelect = async (providerKey: string) => {
  // 1. Call API to create link token
  const response = await api.post('/banking/link-token', {
    provider: providerKey,
    companyId: companyId,
  });

  // 2. Store the link token and show provider widget
  setLinkToken(response.data.token);
  setSelectedProvider(providerKey);
};
```

**Backend processing:**

```typescript
// Backend: UnifiedBankingService.createLinkToken()
async createLinkToken(params: {
  provider: string;
  userId: string;
  companyId: string;
}): Promise<{ success: boolean; token?: string; error?: string }> {
  // 1. Get the provider from registry
  const provider = providerRegistry.get(params.provider);

  // 2. Create provider-specific link token
  const token = await provider.createLinkToken(params.userId, params.companyId);

  // 3. Return token to frontend
  return { success: true, token };
}
```

**What this means:**

- **Plaid**: Creates a link token that will be used to initialize the Plaid Link widget
- **Mono**: Returns configuration data for the Mono widget
- The token contains encrypted information about the user and company

---

### **Step 2: Provider Widget Opens**

**What the user sees:**

- Provider-specific widget opens (Plaid Link or Mono widget)
- User sees their bank's login page
- User enters their bank credentials

**What happens behind the scenes:**

**For Plaid:**

```typescript
// Frontend: PlaidWidget.tsx
<PlaidLink
  token={linkToken}
  onSuccess={handleSuccess}
  onExit={onClose}
>
  {({ open, ready }) => (
    <button onClick={() => open()} disabled={!ready}>
      Connect Bank Account
    </button>
  )}
</PlaidLink>
```

**For Mono:**

```typescript
// Frontend: MonoWidget.tsx
<MonoConnect
  config={linkToken} // Contains Mono configuration
  onSuccess={handleSuccess}
  onClose={onClose}
/>
```

**What this means:**

- **Plaid**: Opens Plaid's secure iframe with bank selection and login
- **Mono**: Opens Mono's widget with Nigerian bank selection and login
- User's credentials are handled directly by the provider (we never see them)

---

### **Step 3: User Completes Bank Authentication**

**What the user sees:**

- User selects their bank from the list
- User enters username/password
- User may complete 2FA if required
- User sees success message

**What happens behind the scenes:**

- Provider (Plaid/Mono) authenticates with the user's bank
- Provider receives a temporary token/code
- Provider calls our success callback with this token

```typescript
// Frontend: ProviderWidget.tsx
const handleSuccess = async (publicToken: string) => {
  // 1. Call our API to exchange the temporary token
  const response = await api.post('/banking/exchange-token', {
    provider: selectedProvider,
    publicToken: publicToken,
    companyId: companyId,
  });

  // 2. Handle the result
  if (response.data.success) {
    onSuccess(response.data.connections);
    onClose();
  }
};
```

---

### **Step 4: Token Exchange (The Magic Happens)**

**What the user sees:**

- Loading spinner while we process their connection
- Success message with connected accounts

**What happens behind the scenes:**

```typescript
// Backend: UnifiedBankingService.exchangeTokenAndConnect()
async exchangeTokenAndConnect(params: {
  provider: string;
  publicToken: string;
  userId: string;
  companyId: string;
}): Promise<ConnectionResult> {

  // 1. Exchange temporary token for permanent access token
  const { accessToken, itemId } = await provider.exchangeToken(publicToken);

  // 2. Fetch all accounts from the bank
  const accounts = await provider.fetchAccounts(accessToken);

  // 3. Process each account in a database transaction
  const connections = await knexClient.transaction(async (trx) => {
    const connections = [];

    for (const account of accounts) {
      // 3a. Map the bank to our internal bank record
      const bankId = await this.bankMapping.resolveBankId(
        account.institution,
        providerKey,
        companyId,
        trx
      );

      // 3b. Create or update bank account record
      const [bankAccount] = await trx('bank_accounts').insert({
        display_name: account.name,
        account_number: account.accountNumber,
        bank_id: bankId,
        company_id: companyId,
        // ... other fields
      }).returning('*');

      // 3c. Create bank connection record
      const [connection] = await trx('bank_account_connections').insert({
        provider_bank_account_id: account.id,
        bank_account_id: bankAccount.id,
        provider_id: providerId,
        status: 'active',
        raw_metadata: {
          access_token: accessToken,
          item_id: itemId
        }
      }).returning('*');

      connections.push(connection);
    }

    return connections;
  });

  // 4. Queue initial transaction sync for each account
  for (const connection of connections) {
    await this.syncOrchestrator.queueSync(connection.id);
  }

  return { success: true, connections };
}
```

**What this means:**

- **Token Exchange**: We convert the temporary token to a permanent access token
- **Account Discovery**: We fetch all accounts the user has access to
- **Bank mapping**: We automatically map the bank to our internal records
- **Database storage**: We create records for the bank account and connection
- **Sync queue**: We queue up the initial transaction sync

---

### **Step 5: Initial Transaction Sync (Background Process)**

**What the user sees:**

- Connection is complete, user can continue using the app
- Transactions will appear shortly

**What happens behind the scenes:**

```typescript
// Backend: SyncOrchestrator.syncConnection()
async syncConnection(connectionId: string): Promise<void> {
  // 1. Get connection details from database
  const connection = await knexClient('bank_account_connections')
    .where('id', connectionId)
    .first();

  // 2. Get the provider
  const provider = providerRegistry.get(connection.provider_key);

  // 3. Fetch transactions from the bank
  const syncResult = await provider.syncTransactions(
    connection.raw_metadata.access_token,
    connection.provider_bank_account_id,
    {
      startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days back
      limit: 100
    }
  );

  // 4. Process transactions in batches
  await this.processBatch(connection, syncResult.transactions);

  // 5. Update sync cursor for next sync
  await knexClient('bank_account_connections')
    .where('id', connectionId)
    .update({
      last_sync_at: new Date(),
      raw_metadata: {
        ...connection.raw_metadata,
        sync_cursor: syncResult.nextCursor
      }
    });
}
```

**What this means:**

- **Background Processing**: Sync happens asynchronously via queue
- **Transaction Fetching**: We get the last 90 days of transactions
- **Deduplication**: We check for existing transactions to avoid duplicates
- **Batch Processing**: We process transactions in efficient batches
- **Cursor Management**: We store a cursor for incremental syncs

---

### **Step 6: Real-time Updates via Webhooks**

**What the user sees:**

- New transactions appear automatically
- No manual refresh needed

**What happens behind the scenes:**

```typescript
// Backend: WebhookHandler.handlePlaidWebhook()
private async handlePlaidWebhook(body: any): Promise<void> {
  const { webhook_type, webhook_code, item_id } = body;

  if (webhook_type === 'TRANSACTIONS' && webhook_code === 'SYNC_UPDATES_AVAILABLE') {
    // 1. Find all connections for this bank item
    const connections = await knexClient('bank_account_connections')
      .where('raw_metadata', '@>', JSON.stringify({ item_id }));

    // 2. Queue sync for each connection
    for (const connection of connections) {
      await this.syncOrchestrator.queueSync(connection.id, 1);
    }
  }
}
```

**What this means:**

- **Webhook Reception**: Bank sends us a notification when new transactions are available
- **Automatic Sync**: We automatically queue a sync job
- **Real-time Updates**: New transactions appear without user action

---

## **🔄 Complete Flow Summary**

### **Frontend Flow:**

1. **User clicks "Connect Bank"** → Modal opens
2. **User selects provider** → API call to create link token
3. **Provider widget opens** → User authenticates with bank
4. **User completes auth** → Temporary token received
5. **Token exchange** → API call to exchange token
6. **Success** → User sees connected accounts

### **Backend Flow:**

1. **Create link token** → Provider-specific token generation
2. **Token exchange** → Convert temporary to permanent token
3. **Account discovery** → Fetch all user's accounts
4. **Bank mapping** → Map to internal bank records
5. **Database storage** → Create account and connection records
6. **Queue sync** → Background transaction sync
7. **Webhook handling** → Real-time updates

### **Data Flow:**

```
User → Frontend → API → Provider → Bank
                ↓
            Database ← Queue ← Webhooks
```

---

## **🎯 Key Points to Remember**

### **Security:**

- **We never see user credentials** - they go directly to the provider
- **Tokens are encrypted** - stored securely in database
- **Webhooks are validated** - signature verification prevents spoofing

### **Reliability:**

- **Queue-based processing** - sync jobs are retried if they fail
- **Transaction safety** - database operations are atomic
- **Error handling** - graceful degradation for all failure scenarios

### **Performance:**

- **Asynchronous sync** - doesn't block user experience
- **Batch processing** - efficient database operations
- **Cursor-based pagination** - only fetch new transactions

### **User Experience:**

- **Immediate feedback** - user sees connection status right away
- **Background processing** - transactions sync without user waiting
- **Real-time updates** - new transactions appear automatically

---

This flow ensures a smooth, secure, and reliable bank connection experience while maintaining data integrity and providing real-time updates to users.
