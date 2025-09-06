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
import type { BankAccountConnectionStatus } from 'src/domains/bankAccountConnections/baccons.types.js';
import { randomUUID } from 'crypto';

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
  staged: (WithConnParams | Omit<WithConnParams, 'bankId'> | ProviderAccount)[];
  failed: WithConnParams[];
  timedOut: boolean;
  institutionResolved: boolean;
}

export class ConnectAccountsService {
  private readonly QUICK_SYNC_TIMEOUT = 3000; // 3 seconds

  /**
   * Sanitizes objects for safe logging by redacting PII fields
   */
  private sanitizeForLogging(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data;

    const sensitiveFields = [
      'token',
      'accessToken',
      'publicToken',
      'refreshToken',
      'accountNumber',
      'routingNumber',
      'ssn',
      'socialSecurityNumber',
      'creditCardNumber',
      'cvv',
      'pin',
      'password',
      'secret',
    ];

    return JSON.parse(
      JSON.stringify(data, (key, value) => {
        if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
          return '[REDACTED]';
        }
        return value;
      }),
    );
  }

  /**
   * Gets account ID from different account types
   */
  private getAccountId(
    account: WithConnParams | Omit<WithConnParams, 'bankId'> | ProviderAccount,
  ): string {
    if ('providerBankAccountId' in account) {
      return account.providerBankAccountId;
    }
    return account.accountId;
  }

  /**
   * Gets display name from different account types
   */
  private getDisplayName(
    account: WithConnParams | Omit<WithConnParams, 'bankId'> | ProviderAccount,
  ): string {
    return account.displayName;
  }

  /**
   * Gets account type from different account types
   */
  private getAccountType(
    account: WithConnParams | Omit<WithConnParams, 'bankId'> | ProviderAccount,
  ): string {
    if ('accountType' in account) {
      return account.accountType || 'checking';
    }
    if ('type' in account) {
      return account.type || 'checking';
    }
    return 'checking';
  }

  /**
   * Main orchestration method - handles complete bank account connection flow
   */
  async connectBankAccounts(
    params: ConnectAccountsParams,
  ): Promise<ApiResponse<ConnectAccountsResponse>> {
    const traceId = randomUUID();
    const startTime = Date.now();

    // Upfront input validation for fast 400 responses
    if (!params.providerKey) {
      return errorResponse('Missing required field: providerKey', null, { metadata: { traceId } });
    }
    if (!params.publicToken) {
      return errorResponse('Missing required field: publicToken', null, { metadata: { traceId } });
    }
    if (!params.companyId) {
      return errorResponse('Missing required field: companyId', null, { metadata: { traceId } });
    }
    if (!params.userId) {
      return errorResponse('Missing required field: userId', null, { metadata: { traceId } });
    }

    const log = (phase: string, data: Record<string, unknown>) => {
      logger.info(
        {
          traceId,
          companyId: params.companyId,
          providerKey: params.providerKey,
          phase,
          duration_ms: Date.now() - startTime,
          ...data,
        },
        `[${traceId}] ${phase}`,
      );
    };

    log('flow_start', { operation: 'connectBankAccounts' });

    try {
      // PHASE 1: Critical operations (no timeout)
      log('critical_start', {});
      const criticalResult = await this.performCriticalPhase(params);
      log('critical_complete', {
        total: criticalResult.providerAccounts.length,
      });

      // PHASE 2: Quick resolution with internal time budget
      log('quick_start', {});
      const quickResult = await this.performQuickResolution(criticalResult, params, traceId);
      log('quick_complete', {
        total: criticalResult.providerAccounts.length,
        created: quickResult.created.length,
        staged: quickResult.staged.length,
      });

      // Return both created and staged accounts so UI can show everything
      const allAccountsCreated = quickResult.staged.length === 0;
      const institutionResolved = quickResult.institutionResolved;
      const accounts = [
        ...quickResult.created,
        ...quickResult.staged.map((acc) => ({
          id: `pending_${this.getAccountId(acc)}`,
          displayName: this.getDisplayName(acc),
          accountType: this.getAccountType(acc),
          accountNumber: 'accountNumber' in acc ? acc.accountNumber || '' : '',
          mask: '****',
          currencyCode: acc.currencyCode,
          requiresClassification: false,
          syncStatus: 'pending_resolution' as const,
        })),
      ];

      return successResponse(
        allAccountsCreated
          ? 'Bank accounts connected successfully'
          : 'Bank accounts connected, some processing in background',
        {
          status: allAccountsCreated ? 'complete' : 'partial',
          accounts,
          syncDetails: {
            total: criticalResult.providerAccounts.length,
            created: quickResult.created.length,
            staged: quickResult.staged.length,
            institutionResolved,
            allAccountsCreated,
            coaCreated: quickResult.created.length > 0,
          },
        },
      );
    } catch (error: unknown) {
      log('error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      logError(error as Error, {
        traceId,
        companyId: params.companyId,
        providerKey: params.providerKey,
        operation: 'connectBankAccounts',
        duration_ms: Date.now() - startTime,
      });

      const message = error instanceof Error ? error.message : 'Failed to connect bank accounts';
      return errorResponse(message, error, { metadata: { traceId } });
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

    // 3. Encrypt and save credential (with retry protection)
    const credentialResult = await createCompanyBankCredential({
      userId: params.userId,
      companyId: params.companyId,
      providerKey: params.providerKey,
      identifier: itemId || null,
      token: accessToken,
      rawData: { itemId, metadata: itemMetadata },
      // rawData: this.sanitizeForLogging({ itemId, metadata: itemMetadata }) as Record<string, unknown>, // Restore if needed
    });

    if (!credentialResult.success) {
      // If credential already exists, this might be a retry - let's check the error
      if (credentialResult.message?.includes('already has an active')) {
        throw new Error(
          'Bank connection already exists. Please disconnect the existing connection first.',
        );
      }
      throw new Error(credentialResult.message || 'Failed to save bank credential');
    }

    if (!credentialResult.data?.id) {
      throw new Error('Failed to save bank credential - no ID returned');
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
   * PHASE 2: Quick resolution with time budget
   * - Try to resolve banks and create complete accounts
   * - Uses time budget to avoid race conditions
   */
  private async performQuickResolution(
    criticalResult: CriticalPhaseResult,
    params: ConnectAccountsParams,
    traceId: string,
  ): Promise<QuickResolutionResult> {
    const deadline = Date.now() + this.QUICK_SYNC_TIMEOUT;
    const resolutionStartTime = Date.now();

    const log = (phase: string, data: Record<string, unknown>) => {
      logger.info(
        {
          traceId,
          phase: `quick_${phase}`,
          duration_ms: Date.now() - resolutionStartTime,
          ...data,
        },
        `[${traceId}] quick_${phase}`,
      );
    };

    // Reserve time for account creation (at least 1 second)
    const resolutionDeadline = Math.min(deadline - 1000, deadline);

    // Try to resolve banks - check time budget first
    if (Date.now() > resolutionDeadline) {
      log('timeout_before_resolution', {});
      const allStaged = [...criticalResult.providerAccounts];
      await this.stageProviderAccounts(
        allStaged,
        criticalResult.credentialId,
        criticalResult.providerId,
        params.userId,
      );
      return {
        created: [],
        staged: allStaged,
        failed: [],
        timedOut: true,
        institutionResolved: false,
      };
    }

    // Begin institution resolution with cooperative cancellation
    const { canBeAdded, needToBeResolved, timedOut, institutionResolved } =
      await this.quickAccountResolution({
        provider: criticalResult.provider,
        institutionId: criticalResult.institutionId,
        providerCountryCodes: criticalResult.providerCountryCodes,
        accounts: criticalResult.providerAccounts,
        providerKey: params.providerKey,
        userId: params.userId,
        companyId: params.companyId,
        providerId: criticalResult.providerId,
        credentialId: criticalResult.credentialId,
        deadline: resolutionDeadline,
      });

    // If resolution timed out, stage all accounts
    if (timedOut) {
      log('resolution_timeout', { at: Date.now() });
      const allStaged = [...criticalResult.providerAccounts];
      await this.stageProviderAccounts(
        allStaged,
        criticalResult.credentialId,
        criticalResult.providerId,
        params.userId,
      );
      return { created: [], staged: allStaged, failed: [], timedOut: true, institutionResolved };
    }

    log('resolution_complete', {
      canBeAdded: canBeAdded.length,
      needToBeResolved: needToBeResolved.length,
    });

    const created: ConnectedAccount[] = [];
    const failed: WithConnParams[] = [];

    // Process accounts one by one with time checks
    for (const account of canBeAdded) {
      if (Date.now() > deadline) {
        log('timeout_during_creation', {
          processed: created.length,
          remaining: canBeAdded.length - created.length,
        });
        // Time's up - add remaining accounts to failed list
        failed.push(...canBeAdded.slice(canBeAdded.indexOf(account)));
        break;
      }

      try {
        const res = await createBankAccountWithConnection(account);
        if (res.success && res.data) {
          created.push({
            id: res.data.bankAccountId,
            displayName: account.displayName,
            accountType: account.accountType || 'checking',
            accountNumber: account.accountNumber || '',
            mask: account.accountNumber?.slice(-4) || '****',
            currencyCode: account.currencyCode,
            requiresClassification: false,
            syncStatus: 'pending_sync' as const,
          });
        } else {
          failed.push(account);
          log('account_creation_failed', {
            account: account.displayName,
            error: res.message,
          });
        }
      } catch (error) {
        failed.push(account);
        log('account_creation_exception', {
          account: account.displayName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Stage what couldn't be processed (unresolved + failed)
    const toStage = [...needToBeResolved, ...failed];
    if (toStage.length > 0) {
      await this.stageAccounts(
        toStage,
        criticalResult.credentialId,
        criticalResult.providerId,
        params.userId,
      );
    }

    log('creation_complete', {
      created: created.length,
      staged: toStage.length,
    });

    return {
      created,
      staged: toStage,
      failed,
      timedOut: false,
      institutionResolved,
    };
  }

  /**
   * Stage accounts that couldn't be resolved or failed to create
   */
  private async stageAccounts(
    accounts: (WithConnParams | Omit<WithConnParams, 'bankId'> | ProviderAccount)[],
    credentialId: string,
    providerId: string,
    userId: string,
  ): Promise<void> {
    for (const account of accounts) {
      // Handle different account types
      const providerBankAccountId =
        'providerBankAccountId' in account ? account.providerBankAccountId : account.accountId;

      await addNewBankAccountConnectionEntry({
        userId,
        data: {
          providerBankAccountId,
          providerId: providerId,
          companyBankCredentialId: credentialId,
          bankAccountId: null, // Staged for background
          status: 'bankId' in account && account.bankId ? 'error' : 'pending_resolution',
          rawMetadata: account,
          // rawMetadata: this.sanitizeForLogging(account) as Record<string, unknown>,
        },
      });
    }
  }

  /**
   * Stage provider accounts when resolution times out before we can process them
   */
  private async stageProviderAccounts(
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
          // rawMetadata: this.sanitizeForLogging(account.rawData || account) as Record<
          //   string,
          //   unknown
          // >,
        },
      });
    }
  }

  /**
   * Phase 2: Quick sync - attempt to complete institution resolution quickly
   * Uses cooperative cancellation with time checks instead of Promise.race
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
    deadline: number; // Deadline parameter for cooperative cancellation
  }): Promise<{
    canBeAdded: WithConnParams[];
    needToBeResolved: Omit<WithConnParams, 'bankId'>[];
    timedOut: boolean;
    institutionResolved: boolean;
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
      deadline,
    } = p;

    // Check time budget before starting
    if (Date.now() > deadline) {
      return { canBeAdded: [], needToBeResolved: [], timedOut: true, institutionResolved: false };
    }

    // 1. Get institution info with time check
    const institutions = await provider.getInstitutionById({
      institutionId,
      countryCodes: providerCountryCodes,
    });

    // Check time after institution fetch
    if (Date.now() > deadline) {
      return { canBeAdded: [], needToBeResolved: [], timedOut: true, institutionResolved: false };
    }

    // 2. Create bank mappings with cooperative cancellation
    const bankMappings: Array<{ bankId: string; providerBankId: string }> = [];
    for (const institution of institutions) {
      if (Date.now() > deadline) {
        // Time's up - return partial results
        return {
          canBeAdded: [],
          needToBeResolved: [],
          timedOut: true,
          institutionResolved: bankMappings.length > 0,
        };
      }

      const mapping = await findOrCreateBankMapping({
        providerKey,
        institution,
        userId,
      });
      bankMappings.push({
        bankId: mapping.bankId,
        providerBankId: mapping.providerBankId,
      });
    }

    const canBeAdded: WithConnParams[] = [];
    const needToBeResolved: Omit<WithConnParams, 'bankId'>[] = [];
    for (const account of accounts) {
      const bankMapping = bankMappings.find(
        (mapping) => mapping.providerBankId === (account.institutionId ?? institutionId),
      );
      const bankId = bankMapping?.bankId;

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

    return {
      canBeAdded,
      needToBeResolved,
      timedOut: false,
      institutionResolved: bankMappings.length > 0,
    };
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
      connectionStatus: 'active',
      credentialId,
    };

    if (bankId) {
      return { ...acc, bankId };
    } else {
      return acc;
    }
  }
}

// Export singleton
export const connectAccountsService = new ConnectAccountsService();
