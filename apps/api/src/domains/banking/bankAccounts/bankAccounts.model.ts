import type { Knex } from 'knex';
import z from 'zod';

import { knexClient } from '../../../db/knexClient.js';
import {
  acquireAdvisoryXactLocks,
  lockKeyCompany,
} from '../../../shared/services/advisoryLocks.service.js';
import { toYMD } from '../../../shared/utils/date.utils.js';
import { isValidUUID } from '../../../shared/utils/formatting.utils.js';
import logger from '../../../shared/utils/logger.js';
import { getCompanyUUID } from '../../../shared/utils/random.utils.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { setBankOpeningBalance } from '../../balances/opening-balance/opening-balance.service.js';
import { createCoaAccount } from '../../chart-of-accounts/coa.model.js';
import { determineExchangeRate } from '../../exchangeRates/exchangeRates.utils.js';
import { writeBankReconnectNotificationLifecycle } from './bankAccountNotifications.js';
import {
  bankAccountWithConnectionInput,
  manualBankAccountInputCamel,
  newBankAccountInput,
  updateBankAccount,
} from './bankAccounts.types.js';

import type { ApiResponse } from '../../../core/types/api.types.js';
import type {
  BankAccountConnectionStatus,
  BankAccountWithConnectionInput,
  BankAccountWithMeta,
  CompanyBankingSnapshot,
  ManualBankAccountInput,
  NewBankAccountInput,
  UpdateBankAccount,
} from './bankAccounts.types.js';

const BANK_ACCOUNT_FIELDS = [
  // Bank Account Core Fields
  'ba.id as id',
  'ba.display_name as displayName',
  'ba.account_type as accountType',
  'ba.coa_id as coaId',
  'ba.currency_id as currencyId',
  'ba.bank_id as bankId',
  'ba.company_id as companyId',
  'ba.business_or_personal as businessOrPersonal',

  // Bank Details
  'b.display_name as bankName',
  'b.logo_url as bankLogo',

  // Bank Account Currency
  'cur.name as currencyName',
  'cur.symbol as currencySymbol',
  'cur.code as currencyCode',

  // Reporting Currency
  'rc.id as reportingCurrencyId',
  'rc.name as reportingCurrencyName',
  'rc.symbol as reportingCurrencySymbol',
  'rc.code as reportingCurrencyCode',

  // Chart of accounts
  'coa.name as coaName',
  'coa.code as coaCode',

  // Account Type
  'at.label as coaTypeLabel',
  'at.key as coaTypeKey',

  'ba.connection_status as bankConnectionStatus',
  'ba.provider_bank_account_id as providerBankAccountId',
  'p.key as providerKey',
  'p.display_name as providerName',
  'p.logo_url as providerLogo',
  'ba.connection_credential_id as connectionCredentialId',
];
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

    // Query the comprehensive view instead of complex joins
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
        'bam.bank_connection_status as bankConnectionStatus',
        'bam.provider_bank_account_id as providerBankAccountId',
        'bam.provider_key as providerKey',
        'bam.provider_name as providerName',
        'bam.provider_logo as providerLogo',
        'bam.connection_credential_id as connectionCredentialId',
        'bam.last_sync_at as lastSyncAt',
        'bam.mask as mask',
        db.raw('bam.statement_balance_native::text as "statementBalance"'),
        db.raw('bam.ledger_balance_reporting::text as "ledgerBalance"'),
        'bam.uncategorized_count as uncategorizedTxCount',
        'bam.needs_review_count as needsReviewTxCount',
        db.raw('bam.latest_exchange_rate::text as "latestExchangeRate"'),
      ])
      .where('bam.company_id', companyUUID);

    const result = await query;

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

/**
 * Builds a full banking snapshot for a company.
 *
 * This snapshot includes both:
 * - **Bank Account Balances** from raw bank transactions (native + reporting currency)
 * - **Bank Ledger Balances** from ledger entries (reporting currency + optional source)
 *
 * It also includes:
 * - Number of bank accounts
 * - Total balances (across all accounts)
 * - Transaction count breakdown: categorized, uncategorized, auto-categorized
 *
 * Useful for building dashboards, reports, or syncing financial summaries.
 *
 * @param companyId - UUID or shortCode of the company
 * @returns snapshot of banking health and categorization coverage
 */
export async function getBankAccountsSnapshot(
  companyId: string,
): Promise<ApiResponse<CompanyBankingSnapshot>> {
  if (!companyId) return errorResponse('Company ID is required');

  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse('Invalid company ID');
    }
    // We'll build out each part (1. metadata, 2. balances, 3. transaction stats) step-by-step below.
    // TODO: Fetch all bank accounts with relevant metadata
    // TODO: Fetch balances from bank_transactions and ledger_entries
    // TODO: Fetch categorization stats per bank account
    // TODO: Combine and summarize into the final response
    // TODO; Include last synced at or last transaction field or something
    // TODO: GROUP BY BANK, ORDER BY BALANCE, BY REPORTING CURRENCY

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
  ): Promise<
    ApiResponse<{ coaId: string; bankAccountId: string; wasUpdated: boolean }>
  > => {
    // Get currencyId, validate bankId
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
    const coaName = v.coa_name ?? v.display_name;
    const coaCode =
      v.coa_code ||
      `**${v.account_number_mask || v.account_number?.slice(-4)}` ||
      null;
    const isConnectedAccount = v.connection_status !== 'not_connected';

    if (
      isConnectedAccount &&
      (!v.provider_id ||
        !v.provider_bank_account_id ||
        !v.connection_credential_id)
    ) {
      throw new Error(
        'Connected bank accounts require provider_id, provider_bank_account_id, and connection_credential_id',
      );
    }

    const providerId = isConnectedAccount ? v.provider_id : null;
    const providerBankAccountId = isConnectedAccount
      ? v.provider_bank_account_id
      : null;
    const connectionCredentialId = isConnectedAccount
      ? v.connection_credential_id
      : null;

    const existingBankAccount = await tx('bank_accounts')
      .select(['id', 'coa_id', 'connection_credential_id', 'connection_status'])
      .where({
        company_id: companyUUID,
        bank_id: bankId,
        account_number: v.account_number,
      })
      .forUpdate()
      .first();

    // Existing bank accounts retain their COA. New bank accounts always get a
    // newly created COA so uniqueness conflicts cannot silently link accounts.
    let coaId: string;
    if (existingBankAccount?.coa_id) {
      coaId = existingBankAccount.coa_id;
    } else {
      try {
        const coa = await createCoaAccount({
          trx: tx,
          companyId: companyUUID,
          userId,
          input: {
            code: coaCode,
            name: coaName,
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
    const oldConnectionCredentialId =
      existingBankAccount?.connection_credential_id ?? null;

    try {
      let bankAccountRow: {
        id: string;
        connection_credential_id: string | null;
        connection_status: BankAccountConnectionStatus;
        display_name: string;
        sync_error: string | null;
        updated_at: Date | string;
      } | null;

      if (existingBankAccount) {
        const bankAccountUpdate: Record<string, unknown> = {
          bank_id: bankId,
          business_or_personal: v.business_or_personal || 'business',
          provider_id: providerId,
          provider_bank_account_id: providerBankAccountId,
          connection_credential_id: connectionCredentialId,
          connection_status: v.connection_status,
          updated_by_id: userId,
          updated_at: tx.fn.now(),
        };

        if (v.account_metadata !== undefined) {
          bankAccountUpdate.account_metadata = v.account_metadata;
        }
        if (v.last_sync_at !== undefined) {
          bankAccountUpdate.last_sync_at = v.last_sync_at;
        }
        if (v.sync_error !== undefined) {
          bankAccountUpdate.sync_error = v.sync_error;
        }
        if (v.notes !== undefined) {
          bankAccountUpdate.notes = v.notes;
        }

        [bankAccountRow] = await tx('bank_accounts')
          .where({ id: existingBankAccount.id })
          .update(bankAccountUpdate)
          .returning<
            {
              id: string;
              connection_credential_id: string | null;
              connection_status: BankAccountConnectionStatus;
              display_name: string;
              sync_error: string | null;
              updated_at: Date | string;
            }[]
          >(['id', 'connection_credential_id', 'connection_status', 'display_name', 'sync_error', 'updated_at']);
      } else {
        [bankAccountRow] = await tx('bank_accounts')
          .insert({
            display_name: v.display_name,
            account_name: v.account_name || v.display_name,
            account_number: v.account_number,
            account_number_mask: v.account_number_mask,
            account_type: v.account_type,
            business_or_personal: v.business_or_personal || 'business',
            bank_id: bankId,
            currency_id: currencyId,
            company_id: companyUUID,
            coa_id: coaId,
            provider_id: providerId,
            provider_bank_account_id: providerBankAccountId,
            connection_status: v.connection_status,
            account_metadata: v.account_metadata,
            connection_credential_id: connectionCredentialId,
            last_sync_at: v.last_sync_at,
            sync_error: v.sync_error,
            notes: v.notes,
            created_by_id: userId,
            updated_by_id: userId,
          })
          .returning<
            {
              id: string;
              connection_credential_id: string | null;
              connection_status: BankAccountConnectionStatus;
              display_name: string;
              sync_error: string | null;
              updated_at: Date | string;
            }[]
          >([
            'id',
            'connection_credential_id',
            'connection_status',
            'display_name',
            'sync_error',
            'updated_at',
          ]);
      }

      if (!bankAccountRow) {
        throw new Error('Failed to create or update bank account');
      }

      bankAccountId = bankAccountRow.id;
      const newConnectionCredentialId = bankAccountRow.connection_credential_id;
      await writeBankReconnectNotificationLifecycle(tx, {
        bankAccountId,
        clientCompanyId: companyUUID,
        previousConnectionStatus:
          existingBankAccount?.connection_status ?? null,
        nextConnectionStatus: bankAccountRow.connection_status,
        bankAccountName: bankAccountRow.display_name,
        previousSyncError: existingBankAccount?.sync_error ?? null,
        syncError: bankAccountRow.sync_error,
        stateVersion: bankAccountRow.updated_at,
      });

      if (
        oldConnectionCredentialId &&
        oldConnectionCredentialId !== newConnectionCredentialId
      ) {
        log.info(
          {
            oldCredentialId: oldConnectionCredentialId,
            newCredentialId: newConnectionCredentialId,
            bankAccountId,
          },
          'Checking if old credential can be revoked',
        );

        const result = await tx('bank_accounts')
          .where('connection_credential_id', oldConnectionCredentialId)
          .whereNot('id', bankAccountId)
          .count()
          .first();
        const count = Number(result?.count ?? 0);

        log.info(
          {
            oldCredentialId: oldConnectionCredentialId,
            accountsUsingOldCredential: count,
          },
          'Credential usage check result',
        );

        if (count === 0) {
          await tx('bank_account_credentials')
            .where('id', oldConnectionCredentialId)
            .update({
              status: 'revoked',
              updated_by_id: userId,
              updated_at: tx.fn.now(),
            });

          log.info(
            {
              oldCredentialId: oldConnectionCredentialId,
            },
            'Old credential revoked successfully',
          );
        } else {
          log.info(
            {
              oldCredentialId: oldConnectionCredentialId,
              accountsStillUsing: count,
            },
            'Old credential still in use, not revoked',
          );
        }
      }
    } catch (e: any) {
      if (e?.code !== '23505') throw e;
      throw new Error('Bank account with the same details already exist');
    }

    // Handle opening balance if provided
    if (v.opening_balance) {
      try {
        const obDate = new Date(v.opening_balance.date);
        const obResult = await setBankOpeningBalance({
          params: {
            bank_account_id: bankAccountId,
            amount: Number(v.opening_balance.amount),
            coverage_start: obDate,
            coverage_end: obDate, // Same day for manual entry
            origin: v.opening_balance.origin ?? 'system_calculated',
            role: v.opening_balance.role ?? 'checkpoint',
            metadata: v.opening_balance.metadata,
          },
          userId,
          trx: tx,
        });

        if (!obResult.success) {
          log.warn(
            {
              error: obResult.message,
              bankAccountId,
              openingBalance: v.opening_balance.amount,
              openingBalanceDate: v.opening_balance.date,
            },
            'Failed to create opening balance - continuing without it',
          );
          // Don't fail the whole transaction - just log the warning
        } else {
          log.info(
            {
              bankAccountId,
              openingBalanceId: obResult.data?.openingBalanceId,
              journalBatchId: obResult.data?.journalBatchId,
              amount: v.opening_balance,
            },
            'Opening balance created successfully',
          );
        }
      } catch (error) {
        log.error(
          {
            error: error instanceof Error ? error.message : 'Unknown error',
            bankAccountId,
          },
          'Error creating opening balance',
        );
        // Don't fail the transaction - user can add opening balance later
      }
    }

    return successResponse<CreateBankAccountRes>(
      'Bank account and associated COA created successfully',
      {
        coaId,
        bankAccountId,
        wasUpdated: !!existingBankAccount,
        bankAccountName: v.display_name || v.account_name || '',
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
    bankAccountData: {
      ...data,
      connection_status: data.connection_status ?? 'not_connected',
    },
    userId,
    companyId,
    trx,
  });
}

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
    const results = [];
    for (const i of data) {
      if (!i.id) {
        throw new Error('Bank account id is required');
      }

      const existing = await txn('bank_accounts')
        .where({ id: i.id, company_id: companyUUID })
        .forUpdate()
        .first<{
          id: string;
          connection_status: BankAccountConnectionStatus;
          display_name: string;
          sync_error: string | null;
        }>('id', 'connection_status', 'display_name', 'sync_error');

      if (!existing) {
        throw new Error(`Unable to update bank account ${i.id}`);
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
      if (i.connectionStatus !== undefined) {
        updates.connection_status = i.connectionStatus;
      }
      if (i.notes !== undefined) updates.notes = i.notes;

      const [updated] = await txn('bank_accounts')
        .where({ id: i.id, company_id: companyUUID })
        .update(updates)
        .returning<
          {
            id: string;
            connection_status: BankAccountConnectionStatus;
            display_name: string;
            sync_error: string | null;
            updated_at: Date | string;
          }[]
        >(['id', 'connection_status', 'display_name', 'sync_error', 'updated_at']);

      if (!updated) {
        throw new Error(`Unable to update bank account ${i.id}`);
      }

      await writeBankReconnectNotificationLifecycle(txn, {
        bankAccountId: updated.id,
        clientCompanyId: companyUUID,
        previousConnectionStatus: existing.connection_status,
        nextConnectionStatus: updated.connection_status,
        bankAccountName: updated.display_name,
        previousSyncError: existing.sync_error,
        syncError: updated.sync_error,
        stateVersion: updated.updated_at,
      });

      results.push(1);
    }
    return successResponse(
      'Bank accounts updated successfully',
      results.length,
    );
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
