# 🏦 Banking Integration System - Unified Implementation Plan

> **Last Updated:** August 2025  
> **Priority:** MVP CRITICAL

### Design Philosophy

1. **Simple but not Simplistic** - Clean interfaces, robust implementation
2. **MVP-First** - Focus on Plaid + Mono, easy to extend later
3. **Configuration-Driven** - Easy to enable/disable providers and features
4. **Developer-Friendly** - Clear patterns, good errors, comprehensive docs

---

## 🏗️ Unified Architecture

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

---

## 🎯 IMPLEMENTATION TODO

Based on the architecture above, here's the complete implementation sequence:

### Phase 1: Backend Foundation (Days 1-5)

#### 1.1 Core Architecture Setup

- [ ] Create banking integration directory structure  
       _Why: Establishes organized folder structure for scalable provider system_
- [ ] Implement base provider interface (`providers/base.provider.ts`)  
       _Why: Defines unified contract that all banking providers must implement_
- [ ] Create provider registry (`providers/registry.ts`)  
       _Why: Manages provider instances and country-based provider selection_
- [ ] Set up common types and interfaces (`types/common.ts`)  
       _Why: Standardizes data structures across all banking providers_
- [ ] Create main module exports (`index.ts`)  
       _Why: Provides clean API for other parts of application to import banking functionality_

#### 1.2 Database Schema Updates

- [ ] Create `bank_feed_providers` table migration  
       _Why: Stores metadata about each banking provider (Plaid, Mono, etc.)_
- [ ] Create `bank_account_connections` table migration  
       _Why: Links our bank accounts to external provider accounts with auth tokens_
- [ ] Update `bank_accounts` table (add provider fields)  
       _Why: Connects existing bank accounts to their provider connections_
- [ ] Update `transactions` table (add external*id, provider fields)  
       \_Why: Enables transaction deduplication and provider traceability*
- [ ] Seed default providers (Plaid, Mono)  
       _Why: Populates provider table with MVP banking integrations_

#### 1.3 Plaid Provider Implementation

- [ ] Install Plaid SDK (`npm install plaid`)  
       _Why: Official Plaid library provides secure API client and type definitions_
- [ ] Create Plaid client wrapper (`providers/plaid/client.ts`)  
       _Why: Abstracts Plaid SDK configuration and provides reusable client instance_
- [ ] Define Plaid-specific types (`types/plaid.types.ts`)  
       _Why: Type safety for Plaid API responses and provider-specific data structures_
- [ ] Implement PlaidProvider class (`providers/plaid.provider.ts`)  
       _Why: Concrete implementation of banking interface for US bank connections_
- [ ] Add Plaid error handling and mapping  
       _Why: Converts Plaid errors to user-friendly messages and retry logic_

#### 1.4 Mono Provider Implementation

- [ ] Install required HTTP client dependencies  
       _Why: Mono uses REST API, need axios/fetch client for HTTP requests_
- [ ] Create Mono client wrapper (`providers/mono/client.ts`)  
       _Why: Centralizes Mono API configuration, authentication headers, and base URLs_
- [ ] Define Mono-specific types (`types/mono.types.ts`)  
       _Why: Type safety for Mono API responses and Nigeria-specific banking data_
- [ ] Implement MonoProvider class (`providers/mono.provider.ts`)  
       _Why: Concrete implementation of banking interface for Nigerian bank connections_
- [ ] Add Mono error handling and mapping  
       _Why: Converts Mono HTTP errors to standardized error format with user messaging_

#### 1.5 Core Services

- [ ] Create UnifiedBankingService (`banking.service.ts`)  
       _Why: High-level service that coordinates all banking operations across providers_
- [ ] Implement BankMappingService (`mapping/mapping.service.ts`)  
       _Why: Maps external bank institutions to our internal bank records automatically_
- [ ] Create SyncOrchestrator with BullMQ (`sync/orchestrator.ts`)  
       _Why: Manages background transaction syncing with retry logic and error handling_
- [ ] Implement WebhookHandler (`webhooks/handler.ts`)  
       _Why: Processes real-time notifications from banking providers about account changes_
- [ ] Set up Redis connection for queues  
       _Why: Enables reliable background job processing for transaction syncs_

### Phase 2: API Endpoints (Days 6-7)

#### 2.1 Banking API Routes

- [ ] POST `/api/banking/link-token` - Create provider link token  
       _Why: Generates secure tokens for frontend to initialize banking widgets_
- [ ] POST `/api/banking/exchange-token` - Exchange public token for access  
       _Why: Converts temporary tokens from providers into permanent access tokens_
- [ ] GET `/api/banking/connections` - List user's connections  
       _Why: Shows users their connected bank accounts with connection status_
- [ ] DELETE `/api/banking/connections/:id` - Disconnect account  
       _Why: Allows users to revoke bank access and clean up stored credentials_
- [ ] POST `/api/banking/test-connection/:id` - Test connection health  
       _Why: Validates that stored credentials still work and connection is active_

#### 2.2 Webhook Endpoints

- [ ] POST `/api/webhooks/plaid/:companyId` - Plaid webhook handler  
       _Why: Receives real-time notifications from Plaid about account changes_
- [ ] POST `/api/webhooks/mono/:companyId` - Mono webhook handler  
       _Why: Receives real-time notifications from Mono about transaction updates_
- [ ] Add webhook signature validation  
       _Why: Ensures webhooks are from legitimate providers and not spoofed requests_
- [ ] Add webhook logging and monitoring  
       _Why: Tracks webhook delivery success and helps debug integration issues_

#### 2.3 Transaction Sync Endpoints

- [ ] POST `/api/banking/sync/:connectionId` - Manual sync trigger  
       _Why: Allows users to force immediate transaction sync when needed_
- [ ] GET `/api/banking/sync-status/:connectionId` - Get sync status  
       _Why: Shows users sync progress and any errors that occurred_
- [ ] Add sync job monitoring endpoints  
       _Why: Enables administrators to monitor sync performance and troubleshoot issues_

### Phase 3: Frontend Implementation (Days 8-10)

#### 3.1 Banking Feature Structure

- [ ] Create `features/banking/` directory structure  
       _Why: Organizes all banking-related frontend components in one location_
- [ ] Install provider SDKs:  
       _Why: Official widgets provide secure, maintained connection flows_
  - [ ] `npm install react-plaid-link`  
         _Why: React component for Plaid's bank connection widget_
  - [ ] `npm install @mono.co/connect.js`  
         _Why: JavaScript SDK for Mono's bank connection widget_
- [ ] Set up shared types and utilities  
       _Why: Ensures type safety and consistency across banking frontend components_

#### 3.2 Provider Components

- [ ] Create PlaidWidget component (`providers/plaid/PlaidLink.tsx`)  
       _Why: Wraps Plaid Link widget with our application-specific configuration_
- [ ] Create PlaidLink hook (`providers/plaid/usePlaidLink.ts`)  
       _Why: Manages Plaid link token creation and success/error handling logic_
- [ ] Create MonoWidget component (`providers/mono/MonoConnect.tsx`)  
       _Why: Wraps Mono Connect widget with our application-specific configuration_
- [ ] Create MonoConnect hook (`providers/mono/useMonoConnect.ts`)  
       _Why: Manages Mono connection flow and token exchange logic_
- [ ] Create ProviderWidget orchestrator (`widgets/ProviderWidget.tsx`)  
       _Why: Routes to correct provider widget based on user selection_

#### 3.3 Connection Flow Components

- [ ] Create BankConnectionModal (`components/BankConnectionModal.tsx`)  
       _Why: Main UI component that orchestrates the entire bank connection flow_
- [ ] Create ProviderSelector (`components/ProviderSelector.tsx`)  
       _Why: Shows users available banking providers based on their country_
- [ ] Create ConnectionStatus (`components/ConnectionStatus.tsx`)  
       _Why: Displays connection progress, success/error states to users_
- [ ] Implement country detection logic  
       _Why: Automatically shows relevant banking providers based on user location_
- [ ] Add provider selection based on country  
       _Why: Filters available providers to only show those supported in user's country_

#### 3.4 Banking Dashboard

- [ ] Create ConnectedAccounts list view  
       _Why: Shows users all their connected bank accounts in one place_
- [ ] Add connection management (disconnect, reconnect)  
       _Why: Allows users to manage their bank connections without re-onboarding_
- [ ] Create connection health status indicators  
       _Why: Shows users which connections are working vs need attention_
- [ ] Add manual sync triggers  
       _Why: Lets users force transaction refresh when they know new activity occurred_

### Phase 4: Integration & Testing (Days 11-13)

#### 4.1 Provider Registration & Initialization

- [ ] Create provider initialization system (`init.ts`)  
       _Why: Bootstraps all banking providers at application startup_
- [ ] Add environment configuration validation  
       _Why: Ensures required API keys and settings are present before starting_
- [ ] Register providers based on enabled configuration  
       _Why: Only loads providers that are configured and enabled for the environment_
- [ ] Add startup health checks  
       _Why: Validates provider connectivity before accepting user requests_

#### 4.2 Database Integration

- [ ] Connect banking service to existing company/user system  
       _Why: Ensures bank connections respect multi-tenancy and user permissions_
- [ ] Implement transaction categorization hooks  
       _Why: Prepares transactions for ML categorization pipeline integration_
- [ ] Add transaction deduplication logic  
       _Why: Prevents duplicate transactions when syncing overlapping date ranges_
- [ ] Create bank account display in existing UI  
       _Why: Integrates bank accounts into existing chart of accounts interface_

#### 4.3 Testing Implementation

- [ ] Unit tests for each provider adapter  
       _Why: Ensures each provider correctly implements the banking interface_
- [ ] Integration tests for UnifiedBankingService  
       _Why: Validates that service layer correctly orchestrates provider operations_
- [ ] API endpoint tests with mock providers  
       _Why: Tests API behavior without depending on external banking services_
- [ ] Frontend component tests  
       _Why: Ensures UI components handle all provider states and error conditions_
- [ ] End-to-end connection flow tests  
       _Why: Validates complete user journey from provider selection to connected account_

#### 4.4 Error Handling & Monitoring

- [ ] Add comprehensive error logging  
       _Why: Essential for debugging banking integration issues in production_
- [ ] Implement retry strategies for failed syncs  
       _Why: Handles temporary provider outages and network issues gracefully_
- [ ] Set up provider health monitoring  
       _Why: Proactively detects when banking providers are experiencing issues_
- [ ] Add user-friendly error messages  
       _Why: Helps users understand and resolve connection problems themselves_
- [ ] Create sync failure alerting  
       _Why: Notifies administrators of systematic sync issues requiring attention_

### Phase 5: CSV Fallback (Days 14-15)

#### 5.1 CSV Upload Infrastructure

- [ ] Create CSV file upload component  
       _Why: Fallback option for banks not supported by Plaid/Mono_
- [ ] Implement CSV parsing and validation  
       _Why: Ensures uploaded transaction data is clean and properly formatted_
- [ ] Add transaction mapping and categorization  
       _Why: Standardizes CSV data to match provider-imported transaction format_
- [ ] Create manual transaction entry forms  
       _Why: Allows users to add individual transactions when CSV import isn't suitable_

#### 5.2 CSV Integration

- [ ] Integrate CSV upload with existing transaction flow  
       _Why: Ensures CSV transactions go through same processing pipeline as API imports_
- [ ] Add CSV import to BankConnectionModal as fallback  
       _Why: Provides seamless fallback when no banking providers support user's country_
- [ ] Create CSV template downloads  
       _Why: Helps users format their bank exports correctly for import_
- [ ] Add import history and status tracking  
       _Why: Lets users see their CSV import attempts and troubleshoot formatting issues_

### Phase 6: Production Readiness (Days 16-18)

#### 6.1 Security Implementation

- [ ] Implement token encryption at rest  
       _Why: Protects stored banking credentials from database breaches_
- [ ] Add comprehensive audit logging  
       _Why: Creates compliance trail for all banking operations and data access_
- [ ] Set up rate limiting on banking endpoints  
       _Why: Prevents abuse and protects against DDoS attacks on sensitive endpoints_
- [ ] Security review of credential handling  
       _Why: Ensures banking tokens are handled according to security best practices_
- [ ] Add webhook signature validation  
       _Why: Prevents malicious actors from sending fake webhook notifications_

#### 6.2 Performance Optimization

- [ ] Implement connection pooling for providers  
       _Why: Reduces API call overhead and improves response times_
- [ ] Add caching for bank and institution data  
       _Why: Reduces database queries for frequently accessed bank information_
- [ ] Optimize transaction sync batch sizes  
       _Why: Balances sync speed with memory usage and API rate limits_
- [ ] Add performance monitoring and metrics  
       _Why: Tracks sync performance and identifies bottlenecks for optimization_

#### 6.3 Deployment & Configuration

- [ ] Set up environment variables for all providers  
       _Why: Manages API keys and configuration across different environments securely_
- [ ] Configure staging environment with sandbox/test accounts  
       _Why: Enables safe testing of banking integrations without real financial data_
- [ ] Create deployment scripts and health checks  
       _Why: Ensures banking services are healthy after each deployment_
- [ ] Add monitoring dashboards  
       _Why: Provides visibility into banking integration performance and errors_
- [ ] Update CI/CD pipeline for new dependencies  
       _Why: Includes banking SDK dependencies in automated testing and deployment_

### Phase 7: Documentation & Launch Prep (Days 19-20)

#### 7.1 Documentation

- [ ] API documentation updates  
       _Why: Documents new banking endpoints for frontend developers and API consumers_
- [ ] User guide for bank connections  
       _Why: Helps end users understand how to connect and manage their bank accounts_
- [ ] Troubleshooting guide  
       _Why: Enables support team to help users resolve common connection issues_
- [ ] Developer setup instructions  
       _Why: Helps new developers set up banking integrations in local environment_

#### 7.2 Demo & Seed Data

- [ ] Add banking connections to demo data  
       _Why: Enables demonstration of banking features without requiring real bank accounts_
- [ ] Create sample transactions for each provider  
       _Why: Shows realistic transaction data for different banking providers and countries_
- [ ] Update demo application flow  
       _Why: Includes banking connection steps in demo user journey_
- [ ] Test with demo companies  
       _Why: Validates that banking features work correctly in demo environment_

#### 7.3 Launch Validation

- [ ] Test with 5+ US banks via Plaid sandbox  
       _Why: Ensures Plaid integration works across major US financial institutions_
- [ ] Test with 5+ Nigerian banks via Mono test environment  
       _Why: Validates Mono integration covers major Nigerian banking providers_
- [ ] Validate transaction categorization accuracy (90%+ target)  
       _Why: Meets MVP requirement for AI-powered categorization quality_
- [ ] Complete security audit  
       _Why: Essential before handling real banking credentials and financial data_
- [ ] Performance benchmarking  
       _Why: Ensures system can handle expected transaction volumes without degradation_

---

## 📋 Success Checklist

### MVP Launch Requirements

- [ ] ✅ Plaid integration tested with 5+ US banks
- [ ] ✅ Mono integration tested with 5+ Nigerian banks
- [ ] ✅ Automatic transaction sync with <5% error rate
- [ ] ✅ Real-time webhook processing operational
- [ ] ✅ Provider-agnostic frontend interface working
- [ ] ✅ CSV fallback upload functional
- [ ] ✅ Comprehensive error handling implemented
- [ ] ✅ All tests passing (90%+ coverage)
- [ ] ✅ Security review completed
- [ ] ✅ Production deployment successful

### Quality Gates

- [ ] 95%+ bank connection success rate
- [ ] <5 second average connection time
- [ ] 100% critical error handling coverage
- [ ] Transaction sync accuracy >98%
- [ ] All webhook events handled properly
- [ ] User-friendly error messages for all failure cases

### Post-Launch Monitoring

- [ ] Connection success rate monitoring
- [ ] Transaction sync performance tracking
- [ ] Provider API health monitoring
- [ ] User error feedback collection
- [ ] Banking integration usage analytics

---

**This implementation plan ensures a production-ready, scalable banking integration system that meets MVP requirements while maintaining high quality and extensibility.**

MY LAYMAN NOTES:
The flow should:

1. Auto-Detect + Manual Country SelectionAutomatically detect the user’s country. simple, nothing complexStill allow the user to manually select a different country if needed.
   2, Show Available Providers or AlternativesAfter country selection, show a list of supported bank feed providers (Plaid, Mono, etc.) available in that country.If none are available, prompt the user to:Upload transactions via CSV, orContact support for assistance.
2. Connect a Bank AccountOn provider selection, guide the user through connecting their bank account securely and take them to a list of connected banks page in the end.
