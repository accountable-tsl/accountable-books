import { randomUUID } from 'crypto';
import { startOfMonth } from 'date-fns';
import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import { enqueueBankBalance } from '../../../domains/balances/index.js';
import { getBankAccountCredential } from '../../../domains/banking/bankAccountCredentials/bankAccountCredentials.model.js';
import type { BankAccountCredential } from '../../../domains/banking/bankAccountCredentials/bankAccountCredentials.types.js';
import type { BankProviderKey } from '../../../domains/banking/bankFeedProviders/bankFeedProviders.types.js';
import { addNewBankTransactions } from '../../../domains/bankTransactions/bankTransactions.model.js';
import type {
  BankTransactionBatchInput,
  BankTransactionInput,
} from '../../../domains/bankTransactions/bankTransactions.types.js';
import { getSystemUser } from '../../../domains/users/users.model.js';
import { redis as redisClient } from '../../../lib/redis.js';
import { logger } from '../../../shared/utils/logger.js';
import { providerRegistry } from '../providers/registry.js';
import type { ProviderTransaction } from '../types/base.js';
import { TransactionSyncStrategy } from '../types/base.js';

interface BankAccountForSync {
  id: string;
  provider_bank_account_id: string;
  company_id: string;
  currency_id: string;
}

export class TransactionSyncService {
  /**
   * Sync transactions for a specific credential (item)
   * Handles pagination and processes all transactions
   */
  async syncTransactionsForCredential({
    credentialId,
    userId,
  }: {
    credentialId: string;
    userId?: string;
  }): Promise<void> {
    const traceId = randomUUID();
    const startTime = Date.now();

    // Prevent duplicate sync operations for the same credential
    const lockKey = `sync:transaction:${credentialId}`;
    const lockTTL = 30 * 60; // 30 minutes

    // Initialize variables outside try block for proper scoping
    let batchCount = 0;
    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;
    let companyId: string = '';
    let providerId: string = '';

    const acquired = await this.acquireSyncLock(lockKey, lockTTL, traceId);
    if (!acquired) {
      logger.warn(
        {
          traceId,
          credentialId,
          lockKey,
        },
        'Transaction sync already in progress - skipping duplicate',
      );
      return;
    }

    const log = (phase: string, data: Record<string, unknown>) => {
      logger.info(
        {
          traceId,
          credentialId,
          phase,
          duration_ms: Date.now() - startTime,
          ...data,
        },
        `[${traceId}] Transaction sync: ${phase}`,
      );
    };

    try {
      log('started', {});

      // Get credential details
      const credentialRes = await getBankAccountCredential({
        credentialId,
        decryptToken: true,
      });
      if (!credentialRes.success) {
        throw new Error(
          `Credential lookup failed: ${credentialRes.message || 'Unknown error'}`,
        );
      }
      if (!credentialRes.data || !credentialRes.data.access_token) {
        throw new Error(`Credential not found or invalid: ${credentialId}`);
      }
      const credential = credentialRes.data;

      if (credential.status !== 'active') {
        throw new Error(`Credential is not active: ${credential.status}`);
      }

      // Get the provider
      const provider = await providerRegistry.getById(credential.provider_id);
      if (!provider) {
        throw new Error(`Provider not found: ${credential.provider_id}`);
      }

      // Check if provider supports transaction sync
      if (!provider.supportsTransactionSync()) {
        log('skipped', {
          reason: 'Provider does not support transaction sync',
          providerId: credential.provider_id,
          providerKey: provider.key,
        });
        return;
      }

      companyId = credential.company_id;
      providerId = credential.provider_id;

      // Determine sync parameters based on provider strategy
      const isInitialSync = !credential.initial_sync_completed;
      const usesDateRangeStrategy =
        provider.transactionSyncStrategy ===
        TransactionSyncStrategy.DATE_RANGE_OVERLAP;

      // For date-range providers: Use date approach with overlap to prevent gaps
      // For cursor-based providers: Use cursor approach
      let fromDate: Date | undefined;
      if (isInitialSync) {
        fromDate =
          credential.transactions_from_date || startOfMonth(new Date());
      } else if (
        usesDateRangeStrategy &&
        credential.last_transactions_sync_at
      ) {
        // For incremental date-range syncs: go back 1 day to catch any backdated txns
        const lastSync = new Date(credential.last_transactions_sync_at);
        lastSync.setDate(lastSync.getDate() - 1); // 1-day overlap
        fromDate = lastSync;
      }

      log('sync_params', {
        isInitialSync,
        providerKey: provider.key,
        transactionSyncStrategy: provider.transactionSyncStrategy,
        usesDateRangeStrategy,
        fromDate: fromDate?.toISOString(),
        hasCursor: !!credential.sync_cursor,
        syncCursor: credential.sync_cursor
          ? `${credential.sync_cursor.slice(0, 10)}...`
          : null,
        lastSyncAt: credential.last_transactions_sync_at?.toISOString(),
        institutionId: credential.institution_id,
        institutionName: credential.institution_name,
      });

      // // Decrypt access token
      // const accessToken = decrypt(credential.encrypted_access_token);

      // Fetch transactions with pagination
      let hasMore = true;
      // For date-range providers: Don't use stored cursor (pages are unstable)
      // For cursor-based providers: Use stored cursor for stable incremental sync
      let cursor = usesDateRangeStrategy ? undefined : credential.sync_cursor;
      let totalApiCalls = 0;
      let totalProcessingTime = 0;
      let hasAnyFailures = false; // Track failures across ALL batches

      // Track earliest and latest transaction dates per bank account across all batches
      // This will be used to enqueue balance recalculation after sync completes
      const accountDateRanges = new Map<
        string,
        { earliest: Date; latest: Date }
      >();

      const trackAccountDateRange = (bankAccountId: string, rawDate: Date) => {
        if (!bankAccountId) return;

        const date = new Date(rawDate);
        if (Number.isNaN(date.getTime())) return;

        const current = accountDateRanges.get(bankAccountId);
        if (!current) {
          accountDateRanges.set(bankAccountId, {
            earliest: date,
            latest: date,
          });
          return;
        }

        if (date < current.earliest) current.earliest = date;
        if (date > current.latest) current.latest = date;
      };

      while (hasMore) {
        batchCount++;
        totalApiCalls++;
        const batchStartTime = Date.now();
        const result = await provider.syncTransactions({
          accessToken: credential.access_token,
          cursor: cursor || undefined,
          fromDate,
        });

        const apiCallTime = Date.now() - batchStartTime;

        log('batch_fetched', {
          batchNumber: batchCount,
          added: result.transactions.added.length,
          modified: result.transactions.modified.length,
          removed: result.transactions.removed.length,
          hasMore: result.hasMore,
          apiCallDuration: apiCallTime,
          nextCursor: result.nextCursor
            ? `${result.nextCursor.slice(0, 10)}...`
            : null,
        });

        // Process transactions in a database transaction
        // Get mapping of provider account IDs to our bank account IDs
        const accountMap = await this.getAccountMapping(credential);

        let processedTxns = {
          successful: 0,
          failed: 0,
          errors: [] as Array<{ batch: any; error: string }>,
        };

        // Process modified transactions
        if (result.transactions.modified.length > 0) {
          await this.processModifiedTransactions(
            result.transactions.modified,
            accountMap,
          );

          // Track dates from modified transactions for balance recalculation
          for (const txn of result.transactions.modified) {
            if (txn.pending) continue; // Skip pending transactions
            const account = accountMap.get(txn.providerBankAccountId);
            if (!account) continue;

            trackAccountDateRange(account.id, new Date(txn.date));
          }
        }

        // Process removed transactions
        if (result.transactions.removed.length > 0) {
          const removedTransactionDates = await this.processRemovedTransactions(
            result.transactions.removed,
            accountMap,
          );

          // Track dates from removed transactions for balance recalculation
          for (const { bankAccountId, date } of removedTransactionDates) {
            trackAccountDateRange(bankAccountId, date);
          }
        }

        // Process added transactions
        if (result.transactions.added.length > 0) {
          processedTxns = await this.processAddedTransactions({
            transactions: result.transactions.added,
            accountMap,
            companyId: credential.company_id,
            providerKey: provider.key,
          });

          // Track dates from added transactions for balance recalculation
          for (const txn of result.transactions.added) {
            if (txn.pending) continue; // Skip pending transactions
            const account = accountMap.get(txn.providerBankAccountId);
            if (!account) continue;

            trackAccountDateRange(account.id, new Date(txn.date));
          }
        }

        // Log batch processing results
        log('batch_processed', {
          successful: processedTxns.successful,
          failed: processedTxns.failed,
          errorCount: processedTxns.errors.length,
          hasErrors: processedTxns.failed > 0,
        });

        // Handle failed transactions
        if (processedTxns.failed > 0) {
          hasAnyFailures = true; // Track failures across ALL batches
          log('batch_errors', {
            errors: processedTxns.errors,
            failedCount: processedTxns.failed,
            successfulCount: processedTxns.successful,
          });

          // For now, we continue with partial success
          // In the future, we might implement retry logic here
        }

        // Update cursor per batch (for cursor-based providers to avoid infinite loops)
        // But DON'T update last_transactions_sync_at yet (wait until ALL batches complete)
        const shouldUpdateCursor =
          result.nextCursor &&
          !usesDateRangeStrategy && // Only for cursor-based providers
          (processedTxns.successful > 0 ||
            (processedTxns.failed > 0 &&
              processedTxns.successful === 0 &&
              result.transactions.added.length === 0));

        if (shouldUpdateCursor) {
          await knexClient('bank_account_credentials')
            .where({ id: credentialId })
            .update({
              sync_cursor: result.nextCursor,
              updated_at: new Date(),
            });

          log('cursor_updated_mid_sync', {
            nextCursor: result.nextCursor,
            batchNumber: batchCount,
            note: 'Cursor updated to prevent infinite loop, but timestamp NOT updated yet',
          });
        }

        const batchResult = processedTxns;

        const batchProcessingTime = Date.now() - batchStartTime;
        totalProcessingTime += batchProcessingTime;

        // Update totals based on actual processing results
        totalAdded += batchResult?.successful || 0;
        totalModified += result.transactions.modified.length;
        totalRemoved += result.transactions.removed.length;

        // Enhanced batch completion logging
        log('batch_completed', {
          batchNumber: batchCount,
          batchProcessingTime,
          successfulTransactions: batchResult?.successful || 0,
          failedTransactions: batchResult?.failed || 0,
          modifiedTransactions: result.transactions.modified.length,
          removedTransactions: result.transactions.removed.length,
          cumulativeAdded: totalAdded,
          cumulativeModified: totalModified,
          cumulativeRemoved: totalRemoved,
        });

        // Track failed transactions for final summary
        if (batchResult && batchResult.failed > 0) {
          log('batch_partial_failure', {
            batchNumber: batchCount,
            batchFailed: batchResult.failed,
            batchSuccessful: batchResult.successful,
            totalErrors: batchResult.errors.length,
            errorSamples: batchResult.errors.slice(0, 3), // First 3 errors for debugging
          });
        }

        hasMore = result.hasMore;
        cursor = result.nextCursor;
      }

      // ALL batches complete - now update final state
      // Only update last_transactions_sync_at if NO failures occurred
      if (!hasAnyFailures) {
        await knexClient('bank_account_credentials')
          .where({ id: credentialId })
          .update({
            last_transactions_sync_at: new Date(),
            initial_sync_completed: true,
            updated_at: new Date(),
          });

        log('final_state_updated', {
          last_transactions_sync_at: new Date().toISOString(),
          reason: 'All batches succeeded - safe to update timestamp',
        });
      } else {
        log('timestamp_not_updated_due_to_failures', {
          hasAnyFailures,
          note: 'Next sync will retry the same date range to recover failed transactions',
        });
      }

      // Enqueue balance recalculation for all affected accounts
      // Only enqueue if sync completed successfully (no failures)
      if (!hasAnyFailures && accountDateRanges.size > 0) {
        let user_id = userId;
        if (!user_id) {
          const systemUser = await getSystemUser();
          if (!systemUser) {
            throw new Error('System user not found');
          }
          user_id = systemUser.id;
        }

        for (const [bankAccountId, dateRange] of accountDateRanges) {
          try {
            await enqueueBankBalance({
              companyId: companyId,
              bankAccountId: bankAccountId,
              recalcFrom: dateRange.earliest.toISOString().split('T')[0], // YYYY-MM-DD
              triggeredBy: 'sync',
              userId: user_id,
            });
          } catch (error) {
            log('balance_recalc_enqueue_failed', {
              error: error instanceof Error ? error.message : 'Unknown error',
              bankAccountId,
              earliestDate: dateRange.earliest.toISOString(),
            });
          }
        }

        log('balance_recalc_queued', {
          affectedAccounts: Array.from(accountDateRanges.keys()),
          accountCount: accountDateRanges.size,
          dateRanges: Array.from(accountDateRanges.entries()).map(
            ([accountId, range]) => ({
              accountId,
              earliest: range.earliest.toISOString().split('T')[0],
              latest: range.latest.toISOString().split('T')[0],
            }),
          ),
        });
      } else if (accountDateRanges.size > 0) {
        log('balance_recalc_skipped_due_to_failures', {
          hasAnyFailures,
          affectedAccountsCount: accountDateRanges.size,
          note: 'Balance recalc will be queued on next successful sync',
        });
      }

      // Comprehensive completion metrics
      const totalDuration = Date.now() - startTime;
      const avgBatchTime =
        batchCount > 0 ? totalProcessingTime / batchCount : 0;
      const throughputPerSecond =
        totalDuration > 0
          ? (totalAdded + totalModified + totalRemoved) / (totalDuration / 1000)
          : 0;

      log('completed', {
        // Transaction counts
        totalAdded,
        totalModified,
        totalRemoved,
        totalTransactions: totalAdded + totalModified + totalRemoved,

        // Performance metrics
        totalDuration,
        totalProcessingTime,
        batchCount,
        totalApiCalls,
        avgBatchTime: Math.round(avgBatchTime),
        throughputPerSecond: Math.round(throughputPerSecond * 100) / 100,

        // Sync metadata
        isInitialSync,
        providerKey: provider.key,
        transactionSyncStrategy: provider.transactionSyncStrategy,
        usesDateRangeStrategy,
        finalCursor: cursor ? `${cursor.slice(0, 10)}...` : null,
        cursorStoredForNextSync: !usesDateRangeStrategy,
        dateRangeUsed: usesDateRangeStrategy
          ? `${fromDate?.toISOString().split('T')[0]} to ${new Date().toISOString().split('T')[0]}`
          : undefined,
        credentialId,
        companyId: credential.company_id,
        providerId: credential.provider_id,

        // Failure tracking
        hasAnyFailures,
        timestampUpdated: !hasAnyFailures,

        // Status
        status: hasAnyFailures ? 'partial_success' : 'success',
      });
    } catch (error) {
      const errorDuration = Date.now() - startTime;

      log('sync_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorStack:
          error instanceof Error
            ? error.stack?.split('\n').slice(0, 5).join('\n')
            : undefined,
        duration: errorDuration,
        batchesProcessed: batchCount || 0,
        transactionsProcessed: totalAdded + totalModified + totalRemoved || 0,
        credentialId,
        companyId: companyId,
        providerId: providerId,
        status: 'error',
      });
      throw error;
    } finally {
      // Always release the lock
      await this.releaseSyncLock(lockKey, traceId);
    }
  }

  /**
   * Insert new transactions
   */
  private async processAddedTransactions({
    transactions,
    accountMap,
    companyId,
    providerKey,
  }: {
    transactions: ProviderTransaction[];
    accountMap: Map<string, BankAccountForSync>;
    companyId: string;
    providerKey: BankProviderKey;
  }): Promise<{
    successful: number;
    failed: number;
    errors: Array<{ batch: any; error: string }>;
  }> {
    const systemUser = await getSystemUser();
    if (!systemUser) {
      throw new Error('System user not found');
    }
    const transactionBatches = this.groupTransactionsByAccountId({
      transactions,
      accountMap,
      providerKey,
    });

    const results = {
      successful: 0,
      failed: 0,
      errors: [] as Array<{ batch: any; error: string }>,
    };

    for (const batch of transactionBatches) {
      try {
        const res = await addNewBankTransactions({
          userId: systemUser.id,
          companyId,
          data: batch,
          // No shared transaction - let the model handle its own transaction
        });

        if (!res.success) {
          if (res.message.includes('was previously imported')) {
            // Previously imported transactions are considered successful
            results.successful++;
          } else {
            // Only increment failed for actual failures
            results.failed++;
            results.errors.push({
              batch: {
                accountId: batch.bank_account_id,
                count: batch.bank_transactions.length,
              },
              error: res.message || 'Unknown error',
            });
            // TODO: Add notification system for failed batch imports
            // Should notify users/admins when transaction sync batches fail
          }
        } else {
          results.successful++;
        }
      } catch (error: unknown) {
        results.failed++;
        results.errors.push({
          batch: { accountId: batch.bank_account_id },
          error:
            error instanceof Error ? error.message : 'Unknown error occured',
        });
      }
    }

    return results;
  }

  /**
   * Update modified transactions (only allowed fields due to immutability)
   */
  private async processModifiedTransactions(
    transactions: ProviderTransaction[],
    accountMap: Map<string, BankAccountForSync>,
  ): Promise<void> {
    for (const txn of transactions) {
      const account = accountMap.get(txn.providerBankAccountId);
      if (!account) {
        continue;
      }

      // Due to immutability constraints, we can only update specific fields
      // For now, we'll just update the raw_data to track changes
      await knexClient('bank_transactions')
        .where({
          external_id: txn.transactionId,
          bank_account_id: account.id,
        })
        .update({
          raw_data: {
            ...txn.rawData,
            category: txn.category,
            merchant_name: txn.merchantName,
            last_modified: new Date().toISOString(),
          },
          updated_at: new Date(),
        });
    }
  }

  /**
   * Soft delete removed transactions
   * Returns the bank account ID and date for each removed transaction for balance recalculation
   */
  private async processRemovedTransactions(
    transactionIds: string[],
    accountMap: Map<string, BankAccountForSync>,
  ): Promise<Array<{ bankAccountId: string; date: Date }>> {
    if (transactionIds.length === 0) return [];

    const accountIds = Array.from(accountMap.values()).map((a) => a.id);

    // First, fetch the transactions to get their dates before soft-deleting
    const transactionsToRemove = await knexClient('bank_transactions')
      .whereIn('external_id', transactionIds)
      .whereIn('bank_account_id', accountIds)
      .select('bank_account_id', 'date');

    // Then soft delete them
    await knexClient('bank_transactions')
      .whereIn('external_id', transactionIds)
      .whereIn('bank_account_id', accountIds)
      .update({
        is_deleted: true,
        deleted_at: new Date(),
        updated_at: new Date(),
      });

    return transactionsToRemove.map((txn) => ({
      bankAccountId: txn.bank_account_id,
      date: new Date(txn.date),
    }));
  }

  /**
   * Get mapping of provider account IDs to our bank account IDs
   */
  private async getAccountMapping(
    credential: BankAccountCredential,
  ): Promise<Map<string, BankAccountForSync>> {
    const accounts = await knexClient('bank_accounts')
      .where({
        connection_credential_id: credential.id,
        company_id: credential.company_id,
      })
      .select('id', 'provider_bank_account_id', 'company_id', 'currency_id');

    const map = new Map<string, BankAccountForSync>();
    for (const account of accounts) {
      if (account.provider_bank_account_id) {
        map.set(account.provider_bank_account_id, account);
      }
    }

    return map;
  }

  /**
   * Get credential by ID
   */
  private async getCredential(
    credentialId: string,
  ): Promise<BankAccountCredential | null> {
    const credential = await knexClient('bank_account_credentials')
      .where({ id: credentialId })
      .first();

    return credential || null;
  }

  /**
   * Find credential by provider item ID (for webhook processing)
   */
  async findCredentialByItemId(
    itemId: string,
  ): Promise<BankAccountCredential | null> {
    // For now, we'll find by item_identifier and assume it's Plaid
    // TODO: Add provider lookup when we support multiple providers with item-based webhooks
    const credential = await knexClient('bank_account_credentials')
      .where({
        item_identifier: itemId,
        status: 'active',
      })
      .first();

    return credential || null;
  }

  /**
   * Set transaction sync start date preference
   */
  async setTransactionSyncDate(
    credentialId: string,
    fromDate: Date,
  ): Promise<void> {
    await knexClient('bank_account_credentials')
      .where({ id: credentialId })
      .update({
        transactions_from_date: fromDate,
        updated_at: new Date(),
      });
  }

  private groupTransactionsByAccountId({
    transactions,
    accountMap,
    batchMeta,
    providerKey,
  }: {
    transactions: ProviderTransaction[];
    accountMap: Map<string, BankAccountForSync>;
    batchMeta?: any;
    providerKey?: BankProviderKey;
  }): BankTransactionBatchInput[] {
    // group with Map to preserve key types
    const byProvider = new Map<string, ProviderTransaction[]>();

    for (const tx of transactions) {
      if (tx.pending) continue; // drop pending transactions
      const list = byProvider.get(tx.providerBankAccountId);
      if (list) list.push(tx);
      else byProvider.set(tx.providerBankAccountId, [tx]);
    }

    const batches: BankTransactionBatchInput[] = [];

    for (const [providerBankAccountId, txs] of byProvider) {
      const acct = accountMap.get(providerBankAccountId);
      if (!acct) continue; // skip unknown accounts

      const bank_transactions: BankTransactionInput[] = txs.map((tx) => ({
        date: new Date(tx.date),
        txn_at: tx.txnAt || new Date(tx.date),
        amount: tx.amount,
        bank_account_id: acct.id,
        description: tx.description ?? null,
        payee: tx.merchantName ?? null,
        raw_data: tx.rawData ?? undefined,
        external_id: tx.transactionId,
        additional_notes: tx.additionalNotes ?? undefined,
      }));

      if (bank_transactions.length === 0) continue;

      batches.push({
        source: 'bank_feed',
        bank_account_id: acct.id,
        bank_transactions,
        metadata: batchMeta ?? undefined,
        provider_key: providerKey ?? undefined,
      });
    }

    return batches;
  }

  /**
   * Acquire a distributed lock for sync operations
   */
  private async acquireSyncLock(
    lockKey: string,
    ttlSeconds: number,
    traceId: string,
  ): Promise<boolean> {
    try {
      // Use Redis SET with NX (only if not exists) and EX (expiration)
      const result = await redisClient.set(
        lockKey,
        traceId,
        'EX',
        ttlSeconds,
        'NX',
      );
      return result === 'OK';
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          lockKey,
          traceId,
        },
        'Failed to acquire sync lock',
      );
      return false;
    }
  }

  /**
   * Release a distributed lock for sync operations
   */
  private async releaseSyncLock(
    lockKey: string,
    traceId: string,
  ): Promise<void> {
    try {
      // Use Lua script to ensure we only delete our own lock
      const luaScript = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;

      await redisClient.eval(luaScript, 1, lockKey, traceId);
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          lockKey,
          traceId,
        },
        'Failed to release sync lock',
      );
    }
  }

  /**
   * Check if a sync is currently in progress for a credential
   */
  async isSyncInProgress(credentialId: string): Promise<boolean> {
    try {
      const lockKey = `sync:transaction:${credentialId}`;
      const result = await redisClient.get(lockKey);
      return result !== null;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          credentialId,
        },
        'Failed to check sync status',
      );
      return false; // Assume not in progress if we can't check
    }
  }

  /**
   * Get detailed sync status for monitoring
   */
  async getSyncStatus(credentialId: string): Promise<{
    isInProgress: boolean;
    lockInfo?: {
      traceId: string;
      startedAt: number;
      lockKey: string;
    };
    lastSync?: {
      completedAt: Date;
      isInitialCompleted: boolean;
    };
  }> {
    try {
      const lockKey = `sync:transaction:${credentialId}`;
      const lockTraceId = await redisClient.get(lockKey);

      // Get credential info for last sync details
      const credential = await this.getCredential(credentialId);

      return {
        isInProgress: lockTraceId !== null,
        lockInfo: lockTraceId
          ? {
              traceId: lockTraceId,
              startedAt: Date.now(), // Approximate, could store actual start time in Redis
              lockKey,
            }
          : undefined,
        lastSync:
          credential && credential.last_transactions_sync_at
            ? {
                completedAt: credential.last_transactions_sync_at,
                isInitialCompleted: credential.initial_sync_completed || false,
              }
            : undefined,
      };
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          credentialId,
        },
        'Failed to get detailed sync status',
      );

      return {
        isInProgress: false,
      };
    }
  }
}

export const transactionSyncService = new TransactionSyncService();
