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
import type { ProviderAccount, ProviderInstitution } from '../types/base.js';
import { getCurrency } from 'src/domains/currencies/currencies.utils.js';
import { ENV } from 'src/config/env.js';
import type { BankProviderKey } from 'src/domains/bankFeedProviders/bankFeedProviders.types.js';

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

    const { accessToken, itemId } = await provider.exchangeToken({
      publicToken: params.publicToken,
      metadata: params.metadata,
    });

    const { institutionId, metadata: itemMetadata } = await provider.getItemDetails({
      accessToken,
    });

    // 2. Encrypt and save credential (critical)
    const credentialResult = await createCompanyBankCredential({
      userId: params.userId,
      companyId: params.companyId,
      providerKey: providerKey,
      identifier: itemId || null,
      token: accessToken,
      rawData: { itemId, metadata: itemMetadata },
    });

    if (!credentialResult.success || !credentialResult.data) {
      throw new Error('Failed to save bank credential');
    }

    const credentialId = credentialResult.data.id;

    // 3. Fetch accounts from provider (critical)
    const providerAccounts = await provider.fetchBankAccounts({
      accessToken,
    });

    // 4. Get institution info (can be deferred)
    const institutions = await provider.getInstitutionById({
      institutionId,
      countryCodes: providerCountryCodes,
    });

    // 5. Resolve bank(s) mapping (can be deferred)
    const bankMappings = await Promise.all(
      institutions.map((institution) =>
        findOrCreateBankMapping({
          providerKey,
          institution,
          userId: params.userId,
        }),
      ),
    );

    // 6. Upsert bank accounts and connections (if fails or slow or no bank mapping, save details to bank_account_connections, resort to background processing)
    const bankAccounts: WithConnParams[] = providerAccounts.map((account) => ({
      companyId: params.companyId,
      currencyCode: account.currencyCode,
      bankId: bankMappings.find(
        (mapping) => mapping.providerBankId === (account.institutionId || institutionId),
      )?.bankId, // Assuming bank mapping is available
      createdById: params.userId,
      accountNumber: account.accountNumber,
      displayName: account.displayName,
      accountName: account.officialName || account.displayName,
      accountType: account.type,
      bankAccountMetadata: account.rawData,
      inputSource: 'system', // or user??
      businessOrPersonal: null,
      providerId,
      providerBankAccountId: account.accountId,
      connectionStatus: 'active', // might be active, pending_enrichment, pending_institution, error
      credentialId,
      //      connectionMetadata:
    }));
    const createdBankAccounts = bankAccounts.map((bankAccount) =>
      createBankAccountWithConnection(bankAccount),
    );

    // 4. Create minimal bank account records
    const savedAccounts = await this.createMinimalBankAccounts({
      accounts: providerAccounts,
      credentialId,
      companyId: params.companyId,
      userId: params.userId,
    });

    return {
      credential: {
        id: credentialId,
        providerKey: provider.key,
        accessToken,
        itemId,
        companyId: params.companyId,
        userId: params.userId,
      },
      accounts: savedAccounts,
    };
  }

  /**
   * Phase 2: Quick sync - attempt to complete institution resolution quickly
   */
  private async performQuickSync(
    credential: any,
    accounts: ConnectedAccount[],
  ): Promise<{ success: true; accounts: ConnectedAccount[] } | null> {
    try {
      const provider = await providerRegistry.get(credential.providerKey);
      if (!provider) return null;

      // 1. Get item details
      const itemDetails = await provider.getItemDetails({
        accessToken: credential.accessToken,
      });

      // 2. Get institution info
      const institutions = await provider.getInstitutionById({
        institutionId: itemDetails.institutionId,
      });

      const institution = institutions[0]; // Take first match
      if (!institution) return null;

      // 3. Resolve bank mapping (this might be slow)
      const bankMapping = await findOrCreateBankMapping({
        providerKey: credential.providerKey,
        institution,
        userId: credential.userId,
      });

      // 4. Update accounts with resolved bank info
      await this.updateAccountsWithBankInfo(accounts, bankMapping.bankId);

      // 5. Create COA entries (optional - can be done later)
      // await this.createCOAEntries(accounts, credential.companyId);

      return {
        success: true,
        accounts: await this.enrichAccountsWithBankInfo(accounts),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(
        { credentialId: credential.id, error: errorMessage },
        'Quick sync failed, falling back to background processing',
      );
      return null;
    }
  }

  /**
   * Create minimal bank account records that can be shown to user immediately
   * bank_accounts and bank_account_connections
   */
  private async createMinimalBankAccounts(params: {
    accounts: ProviderAccount[];
    credentialId: string;
    companyId: string;
    userId: string;
  }): Promise<ConnectedAccount[]> {
    const { accounts, credentialId, companyId, userId } = params;
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      throw new Error('Invalid company ID');
    }

    // Get provider_id from the credential
    const credential = await this.knex('company_bank_credentials')
      .where({ id: credentialId })
      .first(['provider_id']);

    if (!credential) {
      throw new Error('Invalid credential ID');
    }

    const savedAccounts: ConnectedAccount[] = [];

    await this.knex.transaction(async (trx) => {
      for (const account of accounts) {
        // Create minimal bank account record
        const [bankAccount] = await trx('bank_accounts')
          .insert({
            company_id: companyUUID,
            bank_id: null, // Will be filled by quick sync or background job
            display_name: account.displayName,
            account_name: account.displayName,
            account_number: account.accountNumber,
            account_type: account.type || 'checking',
            currency_id: await this.getCurrencyId(account.currencyCode),
            coa_id: await this.getPlaceholderCOAId(companyUUID, trx), // Temporary COA account
            business_or_personal: null, // User will classify
            created_by_id: userId,
            metadata: {
              mask: account.mask,
              officialName: account.officialName,
              providerAccountId: account.accountId,
              needsBankResolution: true,
            },
          })
          .returning(['id', 'display_name', 'account_type', 'account_number', 'metadata']);

        // Create connection record
        await trx('bank_account_connections').insert({
          bank_account_id: bankAccount.id,
          provider_bank_account_id: account.accountId,
          company_bank_credential_id: credentialId,
          provider_id: credential.provider_id,
          status: 'pending_enrichment',
          raw_metadata: account.rawData,
          created_by_id: userId,
        });

        savedAccounts.push({
          id: bankAccount.id,
          displayName: bankAccount.display_name,
          accountType: bankAccount.account_type,
          accountNumber: bankAccount.account_number,
          mask: account.mask,
          currencyCode: account.currencyCode,
          requiresClassification: true, // Will determine based on company type
          syncStatus: 'pending_enrichment', // From bank_account_connections
          metadata: bankAccount.metadata,
        });
      }
    });

    return savedAccounts;
  }

  /**
   * Update bank accounts with resolved bank information
   */
  private async updateAccountsWithBankInfo(
    accounts: ConnectedAccount[],
    bankId: string,
  ): Promise<void> {
    await this.knex('bank_accounts')
      .whereIn(
        'id',
        accounts.map((a) => a.id),
      )
      .update({
        bank_id: bankId,
        metadata: this.knex.raw("metadata - 'needsBankResolution'"),
        updated_at: new Date(),
      });

    await this.knex('bank_account_connections')
      .whereIn(
        'bank_account_id',
        accounts.map((a) => a.id),
      )
      .update({
        status: 'active',
        updated_at: new Date(),
      });
  }

  /**
   * Enrich accounts with bank information for response
   */
  private async enrichAccountsWithBankInfo(
    accounts: ConnectedAccount[],
  ): Promise<ConnectedAccount[]> {
    const accountIds = accounts.map((a) => a.id);

    const enrichedData = await this.knex('bank_accounts as ba')
      .leftJoin('banks as b', 'ba.bank_id', 'b.id')
      .leftJoin('bank_account_connections as bac', 'ba.id', 'bac.bank_account_id')
      .whereIn('ba.id', accountIds)
      .select(
        'ba.id',
        'ba.display_name',
        'ba.account_type',
        'ba.account_number',
        'ba.metadata',
        'b.display_name as bank_name',
        'b.logo_url as bank_logo',
        'bac.status as sync_status', // Get from connections table
      );

    return accounts.map((account) => {
      const enriched = enrichedData.find((e) => e.id === account.id);
      return {
        ...account,
        bankName: enriched?.bank_name || undefined,
        bankLogo: enriched?.bank_logo || undefined,
        syncStatus: enriched?.sync_status || account.syncStatus,
      };
    });
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
   * Format partial response when quick sync times out
   */
  private async formatPartialResponse(
    accounts: ConnectedAccount[],
    companyId: string,
  ): Promise<ConnectAccountsResponse> {
    const requiresClassification = await this.requiresClassification(companyId);

    return {
      status: 'partial',
      accounts: accounts.map((account) => ({
        ...account,
        requiresClassification,
      })),
      syncDetails: {
        institutionResolved: false,
        coaCreated: false,
        backgroundJobId: 'placeholder', // TODO: Real job ID
        estimatedCompletion: new Date(Date.now() + 30000).toISOString(), // 30 seconds
      },
    };
  }

  /**
   * Helper to check if accounts need classification based on company type
   */
  private async requiresClassification(companyId: string): Promise<boolean> {
    const companyUUID = await getCompanyUUID(companyId);
    const company = await this.knex('companies').where({ id: companyUUID }).first('company_type');

    return company?.company_type !== 'individual';
  }

  /**
   * Get currency ID by code
   */
  private async getCurrencyId(currencyCode: string): Promise<string> {
    const currency = await getCurrency(currencyCode);
    return currency.id;
  }

  /**
   * Get a placeholder COA account ID for bank accounts
   */
  private async getPlaceholderCOAId(companyId: string, trx?: Knex.Transaction): Promise<string> {
    // For now, just get the first bank asset account for this company
    // In production, we should create a specific placeholder account or make coa_id optional
    const query = (trx || this.knex)('coa')
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where({
        'coa.company_id': companyId,
        'account_types.key': 'bank', // Bank asset account
      })
      .first('coa.id');

    const coaAccount = await query;
    if (!coaAccount) {
      // If no bank COA account exists, get any asset account as fallback
      const fallbackQuery = (trx || this.knex)('coa')
        .join('account_types', 'coa.account_type_id', 'account_types.id')
        .join('account_elements', 'account_types.element_id', 'account_elements.id')
        .where({
          'coa.company_id': companyId,
          'account_elements.key': 'assets', // Any asset account
        })
        .first('coa.id');

      const fallbackAccount = await fallbackQuery;
      if (!fallbackAccount) {
        throw new Error(
          `No COA accounts found for company ${companyId}. Please ensure Chart of Accounts is set up.`,
        );
      }

      return fallbackAccount.id;
    }

    return coaAccount.id;
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
