import type { Knex } from 'knex';
import { format } from 'date-fns';
import z from 'zod';

import { knexClient } from '../../../db/knexClient.js';
import {
  acquireAdvisoryXactLocks,
  lockKeyCompany,
} from '../../../shared/services/advisoryLocks.service.js';
import { isValidUUID } from '../../../shared/utils/formatting.utils.js';
import logger from '../../../shared/utils/logger.js';
import { getCompanyUUID } from '../../../shared/utils/random.utils.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { getCurrentRecordedBankBalances } from '../../balances/bank-balance-derivation.js';
import { setBankOpeningBalance } from '../../balances/opening-balance/opening-balance.service.js';
import { createCoaAccount } from '../../chart-of-accounts/coa.model.js';
import {
  deriveAccountNumberIdentity,
  findAccountByFingerprint,
} from '../account-identity.js';
import {
  projectConnectionStatus,
  projectSyncHealth,
} from '../bank-account-projections.js';
import {
  bankAccountWithConnectionInput,
  manualBankAccountInputCamel,
  newBankAccountInput,
  updateBankAccount,
} from './bankAccounts.types.js';

import type { ApiResponse } from '../../../core/types/api.types.js';
import type { BankConnectionAuthorizationStatus } from '../bank-connections/bank-connections.types.js';
import type {
  BankAccountWithConnectionInput,
  BankAccountWithMeta,
  CompanyBankingSnapshot,
  ManualBankAccountInput,
  NewBankAccountInput,
  UpdateBankAccount,
} from './bankAccounts.types.js';

export interface SyncableBankAccount {
  id: string;
  company_id: string;
  bank_account_feed_id: string;
  bank_connection_id: string;
  last_sync_at: Date | null;
}

export type BankAccountSyncIneligibilityReason =
  | 'reconnect_required'
  | 'not_connected';

export interface BankAccountSyncEligibility {
  id: string;
  eligible: boolean;
  reason: BankAccountSyncIneligibilityReason | null;
}

export async function getBankAccountSyncEligibility(
  input: { bankAccountId: string; companyId: string },
  trx?: Knex.Transaction,
): Promise<BankAccountSyncEligibility | null> {
  const db = trx ?? knexClient;
  const account = await db('bank_accounts as ba')
    .where({
      'ba.id': input.bankAccountId,
      'ba.company_id': input.companyId,
      'ba.is_deleted': false,
    })
    .first<{ id: string }>('ba.id as id');

  if (!account) return null;

  // Prefer active feed, else latest revoked — same order as metrics view.
  const feedRow = await db('bank_account_feeds as baf')
    .leftJoin('bank_connections as bc', 'bc.id', 'baf.bank_connection_id')
    .where({
      'baf.bank_account_id': input.bankAccountId,
      'baf.company_id': input.companyId,
    })
    .orderByRaw('(baf.revoked_at IS NULL) DESC, baf.connected_at DESC')
    .first<{
      revoked_at: Date | null;
      initial_sync_completed_at: Date | null;
      last_successful_sync_at: Date | null;
      connected_at: Date | null;
      authorization_status: BankConnectionAuthorizationStatus | null;
    }>([
      'baf.revoked_at',
      'baf.initial_sync_completed_at',
      'baf.last_successful_sync_at',
      'baf.connected_at',
      'bc.authorization_status',
    ]);

  let activeFeed: {
    initial_sync_completed_at: Date | null;
    last_successful_sync_at: Date | null;
    connected_at: Date | null;
  } | null = null;
  if (feedRow?.revoked_at === null) {
    activeFeed = {
      initial_sync_completed_at: feedRow.initial_sync_completed_at,
      last_successful_sync_at: feedRow.last_successful_sync_at,
      connected_at: feedRow.connected_at ?? null,
    };
  }

  const projected = projectConnectionStatus({
    hasEverHadFeed: !!feedRow,
    activeFeed,
    latestFeedRevoked: !!feedRow && activeFeed === null,
    connectionAuthorizationStatus: feedRow?.authorization_status ?? null,
  });

  let reason: BankAccountSyncIneligibilityReason | null = null;
  if (projected === 'not_connected' || projected === 'revoked') {
    reason = 'not_connected';
  } else if (projected === 'error') {
    reason = 'reconnect_required';
  }

  return { id: account.id, eligible: reason === null, reason };
}

export async function getSyncableBankAccounts(
  filters: {
    connectionId?: string;
    companyId?: string;
    bankAccountId?: string;
    requireInitialSyncComplete?: boolean;
  } = {},
  trx?: Knex.Transaction,
): Promise<SyncableBankAccount[]> {
  const db = trx ?? knexClient;
  const query = db('bank_account_feeds as baf')
    .innerJoin('bank_connections as bc', 'bc.id', 'baf.bank_connection_id')
    .innerJoin('bank_accounts as ba', 'ba.id', 'baf.bank_account_id')
    .select<SyncableBankAccount[]>([
      'ba.id as id',
      'baf.company_id as company_id',
      'baf.id as bank_account_feed_id',
      'baf.bank_connection_id as bank_connection_id',
      'baf.last_successful_sync_at as last_sync_at',
    ])
    .where({
      'ba.is_deleted': false,
      'bc.authorization_status': 'active',
    })
    .whereNull('baf.revoked_at')
    .orderByRaw('baf.last_successful_sync_at ASC NULLS FIRST, ba.id ASC');

  if (filters.connectionId) {
    query.andWhere('baf.bank_connection_id', filters.connectionId);
  }
  if (filters.companyId) {
    query.andWhere('baf.company_id', filters.companyId);
  }
  if (filters.bankAccountId) {
    query.andWhere('ba.id', filters.bankAccountId);
  }
  if (filters.requireInitialSyncComplete) {
    query.whereNotNull('baf.initial_sync_completed_at');
  }

  return query;
}

function projectHistoricalImport(
  row:
    | {
        status: string;
        earliest_transaction_date: Date | null;
        latest_transaction_date: Date | null;
        transaction_count: number;
        selected_from_date: Date | null;
        available_at: Date | null;
        expires_at: Date | null;
      }
    | undefined,
) {
  if (!row) return null;
  return {
    status: row.status,
    earliestTransactionDate: row.earliest_transaction_date
      ? format(row.earliest_transaction_date, 'yyyy-MM-dd')
      : null,
    latestTransactionDate: row.latest_transaction_date
      ? format(row.latest_transaction_date, 'yyyy-MM-dd')
      : null,
    transactionCount: row.transaction_count,
    selectedFromDate: row.selected_from_date
      ? format(row.selected_from_date, 'yyyy-MM-dd')
      : null,
    availableAt: row.available_at
      ? new Date(row.available_at).toISOString()
      : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
  };
}

export const getBankAccountsWithDetails = async (
  companyId: string,
  trx?: Knex.Transaction,
): Promise<ApiResponse<BankAccountWithMeta[]>> => {
  if (!companyId) return errorResponse('Company ID is required');
  const db = trx ?? knexClient;

  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse('Invalid company ID');
    }

    const query = db('bank_accounts_metrics_view as bam')
      .select([
        'bam.id as id',
        'bam.display_name as displayName',
        'bam.account_type as accountType',
        'bam.coa_id as coaId',
        'bam.currency_id as currencyId',
        'bam.bank_id as bankId',
        'bam.company_id as companyId',
        'bam.business_or_personal as businessOrPersonal',
        'bam.bank_name as bankName',
        'bam.bank_logo as bankLogo',
        'bam.currency_name as currencyName',
        'bam.currency_symbol as currencySymbol',
        'bam.currency_code as currencyCode',
        'bam.reporting_currency_id as reportingCurrencyId',
        'bam.reporting_currency_name as reportingCurrencyName',
        'bam.reporting_currency_symbol as reportingCurrencySymbol',
        'bam.reporting_currency_code as reportingCurrencyCode',
        'bam.coa_name as coaName',
        'bam.coa_code as coaCode',
        'bam.coa_type_label as coaTypeLabel',
        'bam.coa_type_key as coaTypeKey',
        'bam.bank_connection_id as bankConnectionId',
        'bam.bank_connection_id as connectionCredentialId',
        'bam.provider_account_id as providerBankAccountId',
        'bam.provider_key as providerKey',
        'bam.provider_name as providerName',
        'bam.provider_logo as providerLogo',
        'bam.bank_account_feed_id as bankAccountFeedId',
        'bam.feed_revoked_at as feedRevokedAt',
        'bam.authorization_status as authorizationStatus',
        'bam.initial_sync_completed_at as initialSyncCompletedAt',
        'bam.feed_connected_at as feedConnectedAt',
        'bam.last_sync_at as lastSyncAt',
        'bam.mask as mask',
        db.raw('bam.statement_balance_native::text as "statementBalance"'),
        db.raw('bam.ledger_balance_reporting::text as "ledgerBalance"'),
        'bam.uncategorized_count as uncategorizedTxCount',
        'bam.needs_review_count as needsReviewTxCount',
        'bam.provider_removed_review_count as providerRemovedReviewCount',
        'bam.total_transactions as totalTransactions',
        db.raw('bam.latest_exchange_rate::text as "latestExchangeRate"'),
      ])
      .where('bam.company_id', companyUUID);

    const rows = await query;
    const feedIds = rows
      .map((row) => row.bankAccountFeedId as string | null)
      .filter((id): id is string => Boolean(id));
    const historyImports =
      feedIds.length > 0
        ? await db('bank_transaction_history_imports')
            .whereIn('bank_account_feed_id', feedIds)
            .select('*')
        : [];
    const historyByFeedId = new Map(
      historyImports.map((row) => [row.bank_account_feed_id, row]),
    );

    const recordedByAccountId = await getCurrentRecordedBankBalances({
      companyId: companyUUID,
      bankAccountIds: rows.map((row) => row.id as string),
      ...(trx ? { trx } : {}),
    });

    const result = rows.map((row) => {
      const activeFeed =
        row.bankAccountFeedId && row.feedRevokedAt == null
          ? {
              initial_sync_completed_at: row.initialSyncCompletedAt
                ? new Date(row.initialSyncCompletedAt as string | Date)
                : null,
              last_successful_sync_at: row.lastSyncAt
                ? new Date(row.lastSyncAt as string | Date)
                : null,
              connected_at: row.feedConnectedAt
                ? new Date(row.feedConnectedAt as string | Date)
                : null,
            }
          : null;
      const connectionFacts = {
        hasEverHadFeed: Boolean(row.bankAccountFeedId),
        activeFeed,
        latestFeedRevoked: Boolean(
          row.bankAccountFeedId && row.feedRevokedAt != null,
        ),
        connectionAuthorizationStatus: row.authorizationStatus,
      };
      const bankConnectionStatus = projectConnectionStatus(connectionFacts);
      const syncHealth = projectSyncHealth(connectionFacts);
      const {
        authorizationStatus: _authorizationStatus,
        feedRevokedAt: _feedRevokedAt,
        initialSyncCompletedAt: _initialSyncCompletedAt,
        feedConnectedAt: _feedConnectedAt,
        totalTransactions: _totalTransactions,
        ...account
      } = row;
      return {
        ...account,
        statementBalance: row.statementBalance ?? null,
        recordedBankBalance:
          recordedByAccountId.get(row.id as string) ?? '0.0000',
        bankConnectionStatus,
        syncHealth,
        lastSyncAt: row.lastSyncAt
          ? new Date(row.lastSyncAt).toISOString()
          : null,
        historicalImport: projectHistoricalImport(
          row.bankAccountFeedId
            ? historyByFeedId.get(row.bankAccountFeedId)
            : undefined,
        ),
      };
    });

    return result?.length
      ? successResponse('Bank accounts fetched successfully', result)
      : successResponse('No bank accounts found', []);
  } catch (error) {
    return errorResponse('Failed to fetch bank accounts', error);
  }
};

interface MinimalBankAccountDetails {
  id: string;
  displayName: string;
  mask: string;
  businessOrPersonal: string;
  currencyCode: string;
  bankName: string;
}
export const getMinimalBankAccountDetails = async ({
  bankAccountIds,
  companyId,
  trx,
}: {
  bankAccountIds?: string[];
  companyId: string;
  trx?: Knex.Transaction;
}) => {
  const exec = async (
    txn: Knex.Transaction,
  ): Promise<ApiResponse<MinimalBankAccountDetails[]>> => {
    const companyUUID = await getCompanyUUID(companyId, txn);
    if (!companyUUID) {
      throw new Error('Company not found');
    }

    const query = txn('bank_accounts as ba')
      .innerJoin('currencies as cur', 'ba.currency_id', 'cur.id')
      .join('banks as b', 'ba.bank_id', 'b.id')
      .select([
        'ba.id as id',
        'ba.display_name as displayName',
        'ba.account_number_mask as mask',
        'ba.business_or_personal as businessOrPersonal',
        'cur.code as currencyCode',
        'b.display_name as bankName',
      ])
      .where({
        'ba.company_id': companyUUID,
        'ba.is_deleted': false,
      });

    if (bankAccountIds?.length) {
      query.whereIn('ba.id', bankAccountIds);
    }

    const results = await query;
    return successResponse('Minimal bank account details fetched', results);
  };

  try {
    if (trx) {
      return await exec(trx);
    } else {
      return await knexClient.transaction(exec);
    }
  } catch (error) {
    return errorResponse('Failed to fetch bank accounts', error);
  }
};

export async function getBankAccountsSnapshot(
  companyId: string,
): Promise<ApiResponse<CompanyBankingSnapshot>> {
  if (!companyId) return errorResponse('Company ID is required');

  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse('Invalid company ID');
    }

    const bankAccountRows = await getBankAccountsWithDetails(companyId);
    if (!bankAccountRows.success) {
      return errorResponse('Failed to fetch bank accounts', bankAccountRows);
    }
    if (bankAccountRows.data && bankAccountRows.data.length === 0) {
      return successResponse('No bank accounts found', {
        bankAccounts: [],
        totals: {
          totalAccounts: 0,
          totalNativeBalance: 0,
          totalReportingFromBankTx: 0,
          totalReportingFromLedger: 0,
          totalTransactions: 0,
          totalCategorizedCount: 0,
          totalAutoCategorizedCount: 0,
          totalUncategorizedCount: 0,
        },
      });
    }

    return successResponse('Banking snapshot fetched', {
      bankAccounts: [],
      totals: {
        totalAccounts: 0,
        totalNativeBalance: 0,
        totalReportingFromBankTx: 0,
        totalReportingFromLedger: 0,
        totalTransactions: 0,
        totalCategorizedCount: 0,
        totalAutoCategorizedCount: 0,
        totalUncategorizedCount: 0,
      },
    });
  } catch (err) {
    return errorResponse('Failed to fetch company banking snapshot', err);
  }
}

interface CreateBankAccountRes {
  coaId: string;
  bankAccountId: string;
  wasUpdated: boolean;
  bankAccountName: string;
  currencyCode: string;
  bankName: string;
}

export function defaultConnectCoaName(
  displayName: string,
  accountNumberMask: string | null | undefined,
): string {
  const mask = accountNumberMask?.trim();
  return mask ? `${displayName} ••${mask}` : displayName;
}

function coaNameCandidates(
  baseName: string,
  { allowSuffixes }: { allowSuffixes: boolean },
): string[] {
  if (!allowSuffixes) return [baseName];
  const names = [baseName];
  for (let n = 2; n <= 10; n += 1) {
    names.push(`${baseName} (${n})`);
  }
  return names;
}

async function createBankAccount({
  bankAccountData,
  userId,
  companyId,
  trx,
}: {
  bankAccountData: NewBankAccountInput;
  userId: string;
  companyId: string;
  trx?: Knex.Transaction;
}) {
  const start = Date.now();
  const log = logger.child({
    op: 'createBankAccount',
    companyId,
    userId,
  });

  const validatedInput = newBankAccountInput.safeParse(bankAccountData);
  if (!validatedInput.success) {
    log.error(
      { validationErrors: z.treeifyError(validatedInput.error) },
      'invalid input',
    );
    return errorResponse('Invalid input', z.treeifyError(validatedInput.error));
  }

  const v = validatedInput.data;

  const exec = async (
    tx: Knex.Transaction,
  ): Promise<ApiResponse<CreateBankAccountRes>> => {
    const [company, currency, bank] = await Promise.all([
      tx('companies')
        .select('id')
        .where(isValidUUID(companyId) ? 'id' : 'short_code', companyId)
        .first(),

      v.currency_id
        ? tx('currencies')
            .select('id', 'code')
            .where({ id: v.currency_id })
            .first<{ id: string; code: string }>()
        : v.currency_code
          ? tx('currencies')
              .select('id', 'code')
              .where({ code: v.currency_code.toUpperCase() })
              .first<{ id: string; code: string }>()
          : null,

      tx('banks').select('id').where('id', v.bank_id).first(),
    ]);

    if (!company?.id) {
      throw new Error('Company not found');
    }
    if (!currency || !currency.id) {
      throw new Error('Currency not found');
    }
    if (!bank) {
      throw new Error('Bank not found');
    }

    const companyUUID = company.id;
    await acquireAdvisoryXactLocks(tx, [lockKeyCompany(companyUUID)]);

    const currencyId = currency.id;
    const bankId = bank.id || v.bank_id;

    // Mask alone cannot rematch an existing account later.
    const identity = v.account_number
      ? deriveAccountNumberIdentity(v.account_number)
      : null;
    const accountNumberMask =
      identity?.account_number_mask ?? v.account_number_mask ?? null;

    const explicitCoaName = v.coa_name?.trim() || null;
    const coaCode = v.coa_code ?? null;
    const baseCoaName =
      explicitCoaName ??
      defaultConnectCoaName(v.display_name, accountNumberMask);

    const existingBankAccount = identity
      ? await findAccountByFingerprint({
          companyId: companyUUID,
          bankId,
          fingerprint: identity.account_number_fingerprint,
          forUpdate: true,
          trx: tx,
        })
      : null;

    let coaId: string;
    if (existingBankAccount?.coa_id) {
      coaId = existingBankAccount.coa_id;
    } else {
      // Catch-and-retry on 23505 aborts the surrounding Postgres transaction.
      const nameAttempts = coaNameCandidates(baseCoaName, {
        allowSuffixes: !explicitCoaName,
      });
      let chosenName: string | null = null;
      for (const name of nameAttempts) {
        const taken = await tx('coa')
          .where({
            company_id: companyUUID,
            is_deleted: false,
          })
          .whereRaw('lower(name) = lower(?)', [name])
          .first('id');
        if (!taken) {
          chosenName = name;
          break;
        }
      }

      if (!chosenName) {
        throw new Error(
          'Chart of account with the same name or code already exists',
        );
      }

      try {
        const coa = await createCoaAccount({
          trx: tx,
          companyId: companyUUID,
          userId,
          input: {
            code: coaCode,
            name: chosenName,
            description: v.coa_description,
            account_type_key: 'ca_bank',
            source: v.source || 'user',
          },
          versionNote: 'bank_account_coa_creation',
        });
        coaId = coa.id;
      } catch (e: any) {
        if (e?.code !== '23505') throw e;
        throw new Error(
          'Chart of account with the same name or code already exists',
        );
      }
    }

    let bankAccountId: string;
    try {
      if (existingBankAccount) {
        const [updated] = await tx('bank_accounts')
          .where({ id: existingBankAccount.id })
          .update({
            display_name: v.display_name,
            official_name: v.official_name ?? null,
            account_number_mask: accountNumberMask,
            account_type: v.account_type,
            business_or_personal: v.business_or_personal || 'business',
            bank_id: bankId,
            updated_by_id: userId,
            updated_at: tx.fn.now(),
          })
          .returning<{ id: string }[]>(['id']);
        if (!updated) {
          throw new Error('Failed to update bank account');
        }
        bankAccountId = updated.id;
      } else {
        const [inserted] = await tx('bank_accounts')
          .insert({
            display_name: v.display_name,
            official_name: v.official_name ?? null,
            account_number_mask: accountNumberMask,
            account_number_fingerprint:
              identity?.account_number_fingerprint ?? null,
            account_number_fingerprint_version:
              identity?.account_number_fingerprint_version ?? null,
            account_type: v.account_type,
            business_or_personal: v.business_or_personal || 'business',
            bank_id: bankId,
            currency_id: currencyId,
            company_id: companyUUID,
            coa_id: coaId,
            created_by_id: userId,
            updated_by_id: userId,
          })
          .returning<{ id: string }[]>(['id']);
        if (!inserted) {
          throw new Error('Failed to create bank account');
        }
        bankAccountId = inserted.id;
      }
    } catch (e: any) {
      if (e?.code !== '23505') throw e;
      throw new Error('Bank account with the same details already exist');
    }

    if (v.opening_balance) {
      const obDate = new Date(v.opening_balance.date);
      const obResult = await setBankOpeningBalance({
        params: {
          bank_account_id: bankAccountId,
          amount: Number(v.opening_balance.amount),
          coverage_start: obDate,
          coverage_end: obDate,
          origin: v.opening_balance.origin ?? 'user_entered',
          role: v.opening_balance.role ?? 'baseline',
          metadata: v.opening_balance.metadata,
        },
        userId,
        trx: tx,
      });

      if (!obResult.success) {
        throw new Error(obResult.message || 'Failed to create opening balance');
      }
    }

    return successResponse<CreateBankAccountRes>(
      'Bank account and associated COA created successfully',
      {
        coaId,
        bankAccountId,
        wasUpdated: !!existingBankAccount,
        bankAccountName: v.display_name,
        currencyCode: currency.code,
        bankName: bank.display_name,
      },
    );
  };

  try {
    const result = trx ? await exec(trx) : await knexClient.transaction(exec);
    log.info({ duration: Date.now() - start }, 'created');
    return result;
  } catch (error) {
    log.error(error);
    return errorResponse('Failed to create bank account', error);
  }
}

export async function createManualBankAccount({
  params,
  userId,
  companyId,
  trx,
}: {
  params: ManualBankAccountInput;
  userId: string;
  companyId: string;
  trx?: Knex.Transaction;
}) {
  const validatedInput = manualBankAccountInputCamel.safeParse(params);
  if (!validatedInput.success) {
    return errorResponse('Invalid input', z.treeifyError(validatedInput.error));
  }
  const { data } = validatedInput;
  return createBankAccount({
    bankAccountData: data,
    userId,
    companyId,
    trx,
  });
}

/** Durable bank_account only — caller owns connection/feed rows. */
export async function createBankAccountWithConnection({
  params,
  userId,
  companyId,
  trx,
}: {
  params: BankAccountWithConnectionInput;
  userId: string;
  companyId: string;
  trx?: Knex.Transaction;
}) {
  const validatedInput = bankAccountWithConnectionInput.safeParse(params);
  if (!validatedInput.success) {
    return errorResponse('Invalid input', z.treeifyError(validatedInput.error));
  }
  const { data } = validatedInput;
  return createBankAccount({ bankAccountData: data, userId, companyId, trx });
}

export async function updateBankAccounts({
  params,
  userId,
  companyId,
  trx,
}: {
  params: UpdateBankAccount[];
  userId: string;
  companyId: string;
  trx?: Knex.Transaction;
}) {
  const startTime = Date.now();
  const validatedInput = updateBankAccount.array().safeParse(params);
  if (!validatedInput.success) {
    return errorResponse('Invalid input', z.treeifyError(validatedInput.error));
  }

  const { data } = validatedInput;
  const exec = async (txn: Knex.Transaction): Promise<ApiResponse<number>> => {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      throw new Error('Company not found');
    }

    let updatedCount = 0;
    for (const i of data) {
      if (!i.id) {
        throw new Error('Bank account id is required');
      }

      const updates: Record<string, unknown> = {
        updated_by_id: userId,
        updated_at: txn.fn.now(),
      };
      if (i.displayName !== undefined) updates.display_name = i.displayName;
      if (i.accountType !== undefined) updates.account_type = i.accountType;
      if (i.businessOrPersonal !== undefined) {
        updates.business_or_personal = i.businessOrPersonal;
      }

      const updated = await txn('bank_accounts')
        .where({ id: i.id, company_id: companyUUID })
        .update(updates);

      if (!updated) {
        throw new Error(`Unable to update bank account ${i.id}`);
      }
      updatedCount++;
    }
    return successResponse('Bank accounts updated successfully', updatedCount);
  };

  try {
    const result = trx ? await exec(trx) : await knexClient.transaction(exec);
    logger.info(
      { userId, companyId, duration: Date.now() - startTime },
      'Bank accounts updated',
    );
    return result;
  } catch (error) {
    logger.error(
      { userId, companyId, duration: Date.now() - startTime },
      'Failed to update bank accounts',
    );
    return errorResponse('Failed to update bank accounts', error);
  }
}
