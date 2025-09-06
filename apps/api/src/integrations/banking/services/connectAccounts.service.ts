import type { ApiResponse } from '../../../core/types/api.types.js';
import { errorResponse, successResponse } from '../../../shared/utils/response.utils.js';
import { logger, logError } from '../../../shared/utils/logger.js';
import { providerRegistry } from '../providers/registry.js';
import { createCompanyBankCredential } from '../../../domains/banking/banking.model.js';
import { findOrCreateBankMapping } from '../utils/resolveBank.js';
import {
  createBankAccountWithConnection,
  type WithConnParams,
} from '../../../domains/banking/bankAccounts/bankAccounts.model.js';
import type { BankingProvider, ProviderAccount } from '../types/base.js';
import type { BankProviderKey } from 'src/domains/bankFeedProviders/bankFeedProviders.types.js';
import { addNewBankAccountConnectionEntry } from 'src/domains/bankAccountConnections/baccons.model.js';

export interface ConnectAccountsParams {
  providerKey: BankProviderKey;
  publicToken: string;
  metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
}

export interface ConnectAccountsResponse {
  status: 'complete' | 'partial';
  accounts: ConnectedAccount[];
  syncDetails: {
    institutionResolved: boolean;
    coaCreated: boolean;
    backgroundJobId?: string;
    estimatedCompletion?: string;
    stagedCount?: number;
  };
}

interface CriticalPhaseResult {
  provider: BankingProvider;
  providerInfo: {
    id: string;
    key: BankProviderKey;
    countries: Array<{ code: string }>;
  };
  providerId: string;
  providerCountryCodes: string[];
  institutionId: string;
  credentialId: string;
  providerAccounts: ProviderAccount[];
}

interface QuickResolutionResult {
  created: ConnectedAccount[];
  staged: (WithConnParams | Omit<WithConnParams, 'bankId'>)[];
}

export class ConnectAccountsService {
  private readonly QUICK_SYNC_TIMEOUT = 3000; // 3 seconds

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
      // PHASE 1: Critical operations (no timeout)
      const criticalResult = await this.performCriticalPhase(params);

      logger.info(
        {
          companyId: params.companyId,
          duration_ms: Date.now() - startTime,
          accountCount: criticalResult.providerAccounts.length,
          phase: 'critical_complete',
        },
        'Critical sync completed successfully',
      );

      // PHASE 2: Try quick resolution with timeout
      const quickStartTime = Date.now();
      const quickResult = await Promise.race([
        this.performQuickResolution(criticalResult, params),
        this.timeout(this.QUICK_SYNC_TIMEOUT).then(() => null),
      ]);

      const quickDuration = Date.now() - quickStartTime;

      if (quickResult) {
        logger.info(
          {
            companyId: params.companyId,
            duration_ms: quickDuration,
            created: quickResult.created.length,
            staged: quickResult.staged.length,
            phase: 'quick_complete',
          },
          'Quick resolution completed',
        );

        return successResponse('Bank accounts connected successfully', {
          status: quickResult.created.length > 0 ? 'complete' : 'partial',
          accounts: quickResult.created,
          syncDetails: {
            institutionResolved: true,
            coaCreated: quickResult.created.length > 0,
            stagedCount: quickResult.staged.length,
          },
        });
      }

      // PHASE 3: Critical fallback - stage everything
      logger.warn(
        {
          companyId: params.companyId,
          duration_ms: quickDuration,
          accountCount: criticalResult.providerAccounts.length,
          phase: 'quick_timeout',
        },
        'Quick resolution timed out, staging all accounts',
      );

      await this.stageAllAccounts(
        criticalResult.providerAccounts,
        criticalResult.credentialId,
        criticalResult.providerId,
        params.userId,
      );

      return successResponse('Bank accounts connected, processing in background', {
        status: 'partial',
        accounts: criticalResult.providerAccounts.map((acc) => ({
          id: `pending_${acc.accountId}`,
          displayName: acc.displayName,
          accountType: acc.type || 'checking',
          accountNumber: acc.accountNumber || '',
          mask: acc.mask || '****',
          currencyCode: acc.currencyCode,
          requiresClassification: false,
          syncStatus: 'pending_enrichment' as const,
        })),
        syncDetails: {
          institutionResolved: false,
          coaCreated: false,
          backgroundJobId: 'pending',
          estimatedCompletion: new Date(Date.now() + 30000).toISOString(),
        },
      });
    } catch (error: unknown) {
      logError(error as Error, {
        companyId: params.companyId,
        providerKey: params.providerKey,
        operation: 'connectBankAccounts',
        duration_ms: Date.now() - startTime,
      });

      const message = error instanceof Error ? error.message : 'Failed to connect bank accounts';
      return errorResponse(message, error);
    }
  }

  /**
   * PHASE 1: Critical operations that must complete synchronously
   * - Exchange token, save credential, fetch accounts
   * - These operations CANNOT be interrupted by timeout
   */
  private async performCriticalPhase(params: ConnectAccountsParams): Promise<CriticalPhaseResult> {
    // Get provider info
    const provider = await providerRegistry.get(params.providerKey);
    const providerInfo = await providerRegistry.getEnabledProvider(params.providerKey);

    if (!provider || !providerInfo) {
      throw new Error(`Provider ${params.providerKey} not found`);
    }

    // 1. Exchange token
    const { accessToken, itemId } = await provider.exchangeToken({
      publicToken: params.publicToken,
    });

    // 2. Get item details
    const { institutionId, metadata: itemMetadata } = await provider.getItemDetails({
      accessToken,
    });

    // 3. Encrypt and save credential
    const credentialResult = await createCompanyBankCredential({
      userId: params.userId,
      companyId: params.companyId,
      providerKey: params.providerKey,
      identifier: itemId || null,
      token: accessToken,
      rawData: { itemId, metadata: itemMetadata },
    });

    if (!credentialResult.success || !credentialResult.data) {
      throw new Error('Failed to save bank credential');
    }
    const credentialId = credentialResult.data.id;

    // 4. Fetch accounts from provider
    const providerAccounts = await provider.fetchBankAccounts({
      accessToken,
    });

    return {
      provider,
      providerInfo,
      providerId: providerInfo.id,
      providerCountryCodes: providerInfo.countries.map((c) => c.code),
      institutionId,
      credentialId,
      providerAccounts,
    };
  }

  /**
   * PHASE 2: Quick resolution with timeout
   * - Try to resolve banks and create complete accounts
   * - Can timeout after 3 seconds
   */
  private async performQuickResolution(
    criticalResult: CriticalPhaseResult, 
    params: ConnectAccountsParams
  ): Promise<QuickResolutionResult> {
    const resolutionStartTime = Date.now();

    // Try to resolve banks
    const { canBeAdded, needToBeResolved } = await this.quickAccountResolution({
      provider: criticalResult.provider,
      institutionId: criticalResult.institutionId,
      providerCountryCodes: criticalResult.providerCountryCodes,
      accounts: criticalResult.providerAccounts,
      providerKey: params.providerKey,
      userId: params.userId,
      companyId: params.companyId,
      providerId: criticalResult.providerId,
      credentialId: criticalResult.credentialId,
    });

    logger.info(
      {
        duration_ms: Date.now() - resolutionStartTime,
        canBeAdded: canBeAdded.length,
        needToBeResolved: needToBeResolved.length,
      },
      'Bank resolution completed',
    );

    // Try to create accounts
    const createStartTime = Date.now();
    const created = [];
    const failed = [];

    for (const account of canBeAdded) {
      try {
        const res = await createBankAccountWithConnection(account);
        if (res.success && res.data) {
          created.push({
            id: res.data.bankAccountId,
            displayName: account.displayName,
            accountType: account.accountType || 'checking',
            accountNumber: account.accountNumber || '',
            mask: account.displayName?.slice(-4) || '****',
            currencyCode: account.currencyCode,
            requiresClassification: false,
            syncStatus: 'active' as const,
          });
        } else {
          failed.push(account);
          logger.warn(
            {
              account: account.displayName,
              error: res.message,
            },
            'Failed to create bank account',
          );
        }
      } catch (error) {
        failed.push(account);
        logger.error({ account: account.displayName, error }, 'Exception creating bank account');
      }
    }

    logger.info(
      {
        duration_ms: Date.now() - createStartTime,
        created: created.length,
        failed: failed.length,
      },
      'Account creation phase completed',
    );

    // Stage unresolved and failed accounts
    const toStage = [...needToBeResolved, ...failed];
    if (toStage.length > 0) {
      await this.stageAccounts(
        toStage,
        criticalResult.credentialId,
        criticalResult.providerId,
        params.userId,
      );
    }

    return {
      created,
      staged: toStage,
    };
  }

  /**
   * Stage accounts that couldn't be resolved or failed to create
   */
  private async stageAccounts(
    accounts: (WithConnParams | Omit<WithConnParams, 'bankId'>)[],
    credentialId: string,
    providerId: string,
    userId: string,
  ): Promise<void> {
    for (const account of accounts) {
      await addNewBankAccountConnectionEntry({
        userId,
        data: {
          providerBankAccountId: account.providerBankAccountId,
          providerId: providerId,
          companyBankCredentialId: credentialId,
          bankAccountId: null, // Staged for background
          status: ('bankId' in account && account.bankId) ? 'error' : 'pending_resolution',
          rawMetadata: account,
        },
      });
    }
  }

  /**
   * Stage all accounts when quick resolution times out
   */
  private async stageAllAccounts(
    providerAccounts: ProviderAccount[],
    credentialId: string,
    providerId: string,
    userId: string,
  ): Promise<void> {
    for (const account of providerAccounts) {
      await addNewBankAccountConnectionEntry({
        userId,
        data: {
          providerBankAccountId: account.accountId,
          providerId: providerId,
          companyBankCredentialId: credentialId,
          bankAccountId: null,
          status: 'pending_resolution',
          rawMetadata: account.rawData || account,
        },
      });
    }
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

  /**
   * Promise timeout utility
   */
  private timeout(ms: number): Promise<null> {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
  }
}

// Export singleton
export const connectAccountsService = new ConnectAccountsService();
