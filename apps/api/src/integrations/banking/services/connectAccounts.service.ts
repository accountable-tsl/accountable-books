import type { Knex } from 'knex';
import { knexClient } from '../../../db/knexClient.js';
import type { ApiResponse } from '../../../core/types/api.types.js';
import { errorResponse, successResponse } from '../../../shared/utils/response.utils.js';
import { logger, logError } from '../../../shared/utils/logger.js';
import { providerRegistry } from '../providers/registry.js';
import { createCompanyBankCredential } from '../../../domains/banking/banking.model.js';
import { getCompanyUUID } from '../../../shared/utils/random.utils.js';
import { findOrCreateBankMapping } from '../utils/resolveBank.js';
import {
  createBankAccountWithConnection,
  type WithConnParams,
} from '../../../domains/banking/bankAccounts/bankAccounts.model.js';
import type { BankingProvider, ProviderAccount, ProviderInstitution } from '../types/base.js';
import { getCurrency } from 'src/domains/currencies/currencies.utils.js';
import { ENV } from 'src/config/env.js';
import type { BankProviderKey } from 'src/domains/bankFeedProviders/bankFeedProviders.types.js';
import { addNewBankAccountConnectionEntry } from 'src/domains/bankAccountConnections/baccons.model.js';

export interface ConnectAccountsParams {
  providerKey: BankProviderKey;
  publicToken: string;
  metadata?: any;
  companyId: string;
  userId: string;
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
  syncStatus?: 'active' | 'pending_enrichment' | 'pending_institution' | 'error'; // From bank_account_connections
  metadata?: Record<string, any>;
}

export interface ConnectAccountsResponse {
  status: 'complete' | 'partial';
  accounts: ConnectedAccount[];
  syncDetails: {
    institutionResolved: boolean;
    coaCreated: boolean;
    backgroundJobId?: string;
    estimatedCompletion?: string;
  };
}

export class ConnectAccountsService {
  private readonly QUICK_SYNC_TIMEOUT = 3000; // 3 seconds

  constructor(private knex: Knex = knexClient) {}

  /**
   * Main orchestration method - handles complete bank account connection flow
   */
  async connectBankAccounts(
    params: ConnectAccountsParams,
  ): Promise<ApiResponse<ConnectAccountsResponse>> {
    const startTime = Date.now();

    logger.info(
      {
        companyId: params.companyId,
        providerKey: params.providerKey,
        operation: 'connectBankAccounts',
      },
      'Starting bank account connection flow',
    );

    try {
      // Phase 1: Critical sync (always synchronous - must complete)
      const { credential, accounts } = await this.performCriticalSync(params);

      // Phase 2: Try quick sync with timeout
      const quickSyncResult = await Promise.race([
        this.performQuickSync(credential, accounts),
        this.timeout(this.QUICK_SYNC_TIMEOUT),
      ]);

      if (quickSyncResult && quickSyncResult.success) {
        // Everything completed quickly!
        logger.info(
          {
            companyId: params.companyId,
            duration_ms: Date.now() - startTime,
            accountCount: accounts.length,
          },
          'Bank connection completed fully in quick sync',
        );

        return successResponse('Bank accounts connected successfully', {
          status: 'complete' as const,
          accounts: quickSyncResult.accounts,
          syncDetails: {
            institutionResolved: true,
            coaCreated: true,
          },
        });
      }

      // Phase 3: Fallback to partial response + background processing
      await this.enqueueBackgroundSync(credential, accounts);

      const partialResponse = await this.formatPartialResponse(accounts, params.companyId);

      logger.info(
        {
          companyId: params.companyId,
          duration_ms: Date.now() - startTime,
          accountCount: accounts.length,
        },
        'Bank connection completed with background processing',
      );

      return successResponse('Bank accounts connected successfully', partialResponse);
    } catch (error: any) {
      logError(error, {
        companyId: params.companyId,
        provider: params.provider,
        operation: 'connectBankAccounts',
        duration_ms: Date.now() - startTime,
      });

      return errorResponse(error.message || 'Failed to connect bank accounts', error);
    }
  }

  /**
   * Phase 1: Critical operations that must complete synchronously
   * - Exchange token
   * - Save credential
   * - Fetch accounts
   * - Create minimal bank account records
   */
  private async attemptCompleteSync(params: ConnectAccountsParams) {
    // 1. Get provider and exchange token (critical)
    const provider = await providerRegistry.get(params.providerKey);
    const providerInfo = await providerRegistry.getEnabledProvider(params.providerKey);

    if (!provider || !providerInfo) {
      throw new Error(`Provider ${params.providerKey} not found`);
    }

    const providerId = providerInfo.id;
    const providerKey = providerInfo.key;
    const providerCountries = providerInfo.countries;
    const providerCountryCodes = providerCountries.map((country) => country.code);

    const { institutionId, credentialId, providerAccounts } = await this.performCriticalSyncOps({
      provider,
      publicToken: params.publicToken,
      userId: params.userId,
      companyId: params.companyId,
      providerKey,
    });

    const { canBeAdded, needToBeResolved } = await this.quickAccountResolution({
      provider,
      institutionId,
      providerCountryCodes,
      accounts: providerAccounts,
      providerKey,
      userId: params.userId,
      companyId: params.companyId,
      providerId,
      credentialId,
    });

    /**
     * Bank account resolution was fast enough?
     * If needsToBeResolved.length > 0, we need to enqueue a background job to resolve the bank accounts
     * If canBeAdded.length > 0, we need to create the bank accounts and connections
     * If creating the bank accounts and connections was fast enough and fully successful, nothing to enqueue, return the bank account records
     * If creating the bank accounts and connections was not fully successful or timed out, we need to enqueue a background job to handle the failed bank accounts creation
     * For the accounts we need to enqueue, we need to add the necessary details to the bank_account_connections table so we can retry the creation
     * Try to cover most edge cases
     */
    const unableToCreate: WithConnParams[] = [];
    for (const bankAccount of canBeAdded) {
      const res = await createBankAccountWithConnection(bankAccount);
      if (!res.success) {
        unableToCreate.push(bankAccount);
      }
    }

    // Stage unresolved accounts, enqueue background job to resolve
    for (const account of needToBeResolved) {
    await addNewBankAccountConnectionEntry({
      userId: params.userId,
      data:{
        providerBankAccountId: account.providerBankAccountId,
        providerId: account.providerId,
        companyBankCredentialId: account.credentialId,
        status: "pending_resolution",
        rawMetadata: account,
      }
    })}

    for (const account of unableToCreate) {
      await addNewBankAccountConnectionEntry({
        userId: params.userId,
        data: {
          providerBankAccountId: account.providerBankAccountId,
          providerId: account.providerId,
          companyBankCredentialId: account.credentialId,
          bankAccountId: account.bankAccountId,
          status: "error",
          rawMetadata: account,
        },
      });
    }
  }

  private async performCriticalSyncOps({
    provider,
    publicToken,
    userId,
    companyId,
    providerKey,
  }: {
    provider: BankingProvider;
    publicToken: string;
    userId: string;
    companyId: string;
    providerKey: BankProviderKey;
  }) {
    // 1. Exchange token
    const { accessToken, itemId } = await provider.exchangeToken({
      publicToken: publicToken,
    });

    // 2. Get item details
    const { institutionId, metadata: itemMetadata } = await provider.getItemDetails({
      accessToken,
    });

    // 3. Encrypt and save credential
    const credentialResult = await createCompanyBankCredential({
      userId,
      companyId,
      providerKey,
      identifier: itemId || null,
      token: accessToken,
      rawData: { itemId, metadata: itemMetadata },
    });

    if (!credentialResult.success || !credentialResult.data) {
      throw new Error('Failed to save bank credential');
    }
    const credentialId = credentialResult.data.id;

    // 4. Fetch accounts from provider (critical)
    const providerAccounts = await provider.fetchBankAccounts({
      accessToken,
    });

    return { institutionId, credentialId, providerAccounts };
  }

  /**
   * Phase 2: Quick sync - attempt to complete institution resolution quickly
   */
  private async quickAccountResolution(p: {
    provider: BankingProvider;
    institutionId: string;
    providerCountryCodes: string[];
    accounts: ProviderAccount[];
    providerId: string;
    providerKey: BankProviderKey;
    userId: string;
    companyId: string;
    credentialId: string;
  }): Promise<{
    canBeAdded: WithConnParams[];
    needToBeResolved: Omit<WithConnParams, 'bankId'>[];
  }> {
    const {
      provider,
      institutionId,
      providerCountryCodes,
      accounts,
      providerKey,
      userId,
      companyId,
      providerId,
      credentialId,
    } = p;

    // 1. Get institution info
    const institutions = await provider.getInstitutionById({
      institutionId,
      countryCodes: providerCountryCodes,
    });

    const bankMappings = await Promise.all(
      institutions.map((institution) =>
        findOrCreateBankMapping({
          providerKey,
          institution,
          userId,
        }),
      ),
    );

    const canBeAdded: WithConnParams[] = [];
    const needToBeResolved: Omit<WithConnParams, 'bankId'>[] = [];
    for (const account of accounts) {
      const bankId = bankMappings.find(
        (mapping) => mapping.providerBankId === (account.institutionId ?? institutionId),
      )?.bankId;

      const acc = this.mapAccountForCreation({
        account,
        bankId,
        companyId,
        userId,
        providerId,
        credentialId,
      });

      if (bankId) {
        canBeAdded.push(acc as WithConnParams);
      } else {
        needToBeResolved.push(acc as Omit<WithConnParams, 'bankId'>);
      }
    }

    return { canBeAdded, needToBeResolved };
  }

  private mapAccountForCreation(i: {
    account: ProviderAccount;
    bankId?: string;
    companyId: string;
    userId: string;
    providerId: string;
    credentialId: string;
  }): WithConnParams | Omit<WithConnParams, 'bankId'> {
    const { account, bankId, companyId, userId, providerId, credentialId } = i;
    const acc: Omit<WithConnParams, 'bankId'> = {
      companyId,
      currencyCode: account.currencyCode,
      createdById: userId,
      accountNumber: account.accountNumber,
      displayName: account.displayName,
      accountName: account.officialName ?? account.displayName,
      accountType: account.type,
      bankAccountMetadata: account.rawData,
      inputSource: 'system',
      businessOrPersonal: null,
      providerId,
      providerBankAccountId: account.accountId,
      connectionStatus: bankId ? 'active' : 'pending',
      credentialId,
    };

    if (bankId) {
      return { ...acc, bankId };
    } else {
      return acc;
    }
  }

  // Add unresolved connections to the database so we can retry them later
  private async stageUnresolvedConnection(userId: string, data: ) {
    const connections = await addNewBankAccountConnectionEntry({
      userId,
      data,
    });

    // bank_account_id: null, // Staged for background       │ │
    // │ │       provider_bank_account_id: account.accountId,          │ │
    // │ │       company_bank_credential_id: credentialId,             │ │
    // │ │       status: 'pending_institution',                        │ │
    // │ │       raw_metadata: account.rawData
  }
  /**
   * Schedule background processing for remaining operations
   */
  private async enqueueBackgroundSync(
    credential: any,
    accounts: ConnectedAccount[],
  ): Promise<void> {
    // For now, just mark as pending - in the future we can use BullMQ
    logger.info(
      {
        credentialId: credential.id,
        accountCount: accounts.length,
      },
      'Background sync enqueued (placeholder)',
    );

    // TODO: Implement actual job queue
    // await bullQueue.add('complete-bank-sync', {
    //   credentialId: credential.id,
    //   accountIds: accounts.map(a => a.id),
    //   priority: 1
    // });
  }

  /**
   * Promise timeout utility
   */
  private timeout(ms: number): Promise<null> {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
  }
}

// Export singleton
export const connectAccountsService = new ConnectAccountsService();
