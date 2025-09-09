import { errorResponse, successResponse } from '../../../shared/utils/response.utils.js';
import { knexClient } from '../../../db/knexClient.js';
import type { ApiResponse } from '../../../core/types/api.types.js';
import {
  bankAccountWithConnectionInput,
  type BankAccountWithConnectionInput,
  type BankAccountWithMeta,
  type CompanyBankingSnapshot,
  type ManualBankAccountInput,
  manualBankAccountInputCamel,
  newBankAccountInput,
  type NewBankAccountInput,
  updateBankAccount,
  type UpdateBankAccount,
} from './bankAccounts.types.js';
import { getCompanyUUID } from '../../../shared/utils/random.utils.js';
import type { Knex } from 'knex';
import { getAccountTypeByKey } from '../../account/account.registry.js';
import { getCurrency } from 'src/domains/currencies/currencies.utils.js';
import logger from 'src/shared/utils/logger.js';
import z from 'zod';
import { isValidUUID } from 'src/shared/utils/formatting.utils.js';

const BANK_ACCOUNT_FIELDS = [
  // Bank Account Core Fields
  'ba.id as id',
  'ba.display_name as displayName',
  'ba.account_type as accountType',
  'ba.account_number as accountNumber',
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

  // Bank Connection Details (If any)
  // 'bac.id as bankConnectionId',
  // 'bac.status as bankConnectionStatus',
  // 'bac.provider_bank_account_id as providerBankAccountId',
  'ba.id as bankConnectionId', // TODO: Remove later
  'ba.connection_status as bankConnectionStatus',
  'ba.provider_bank_account_id as providerBankAccountId',
  'p.key as providerKey',
  'p.name as providerName',
  'p.logo_url as providerLogo',
];
export const getBankAccountsWithDetails = async (
  companyId: string,
  trx?: Knex.Transaction,
): Promise<ApiResponse<BankAccountWithMeta[]>> => {
  if (!companyId) return errorResponse('Company ID is required');
  const executor = trx || knexClient;

  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse('Invalid company ID');
    }

    const query = executor('bank_accounts as ba')
      .select(BANK_ACCOUNT_FIELDS)
      .where('ba.company_id', companyUUID)
      .andWhere('ba.is_deleted', false)
      .join('banks as b', 'ba.bank_id', 'b.id')
      .join('currencies as cur', 'ba.currency_id', 'cur.id')
      .join('companies as c', 'ba.company_id', 'c.id')
      .join('currencies as rc', 'c.reporting_currency_id', 'rc.id')
      .join('coa', 'ba.coa_id', 'coa.id')
      .leftJoin('account_types as at', 'coa.account_type_id', 'at.id')
      .leftJoin('bank_feed_providers as p', 'ba.provider_id', 'p.id');

    const result = await query;
    return result?.length > 0
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
  const exec = async (txn: Knex.Transaction): Promise<ApiResponse<MinimalBankAccountDetails[]>> => {
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
    log.error({ validationErrors: validatedInput.error.flatten() }, 'invalid input');
    return errorResponse('Invalid input', validatedInput.error.flatten());
  }

  const v = validatedInput.data;

  const exec = async (
    tx: Knex.Transaction,
  ): Promise<ApiResponse<{ coaId: string; bankAccountId: string; wasUpdated: boolean }>> => {
    // Get currencyId, validate bankId
    const [company, currency, bank, accountType] = await Promise.all([
      tx('companies')
        .select(['id', 'reporting_currency_id'])
        .where(isValidUUID(companyId) ? 'id' : 'short_code', companyId)
        .first(),

      getCurrency(v.currency_code),

      tx('banks').select('id').where('id', v.bank_id).first(),

      getAccountTypeByKey('ca_bank'),
    ]);

    if (!company || !company.id || !company.reporting_currency_id) {
      throw new Error('Company or reporting currency not found');
    }
    if (!currency || !currency.id) {
      throw new Error('Currency not found');
    }
    if (!bank) {
      throw new Error('Bank not found');
    }
    if (!accountType || !accountType.id) {
      throw new Error('Account type not found');
    }

    const companyUUID = company.id;
    const reportingCurrencyId = company.reporting_currency_id;
    const currencyId = currency.id;
    const bankId = bank.id || v.bank_id;
    const coaAccountTypeId = accountType.id;
    const coaName = v.coa_name || v.display_name || v.account_name;
    const coaCode =
      v.coa_code || `**${v.account_number_mask || v.account_number?.slice(-4)}` || null;

    // Create COA (currency is reporting currency)
    let coaId: string;
    try {
      const [coaRow] = await tx('coa')
        .insert({
          code: coaCode,
          name: coaName,
          description: v.coa_description,
          account_type_id: coaAccountTypeId,
          currency_id: reportingCurrencyId,
          company_id: companyUUID,
          created_by_id: userId,
          updated_by_id: userId,
          source: v.source || 'user',
        })
        .onConflict() // ['name', 'code', 'company_id'] Removed since db constraint is partial on code (i.e where code is not null), trying to pass a standard unique constraint might fail
        .ignore()
        .returning<{ id: string }[]>('id');

      if (coaRow?.id) {
        coaId = coaRow.id;
      } else {
        // COA already exists, fetch it
        const existingCoa = await tx('coa')
          .select('id')
          .where({
            code: coaCode,
            company_id: companyUUID,
          })
          .first();

        if (!existingCoa?.id) {
          throw new Error('Failed to find or create COA account');
        }
        coaId = existingCoa.id;
      }
    } catch (e: any) {
      if (e?.code !== '23505') throw e;
      throw new Error('Chart of account with the same name or code already exists');
    }

    let bankAccountId: string;
    let oldConnectionCredentialId: string | null = null;

    try {
      // Check if bank account already exists
      const existingBankAccount = await tx('bank_accounts')
        .select(['id', 'connection_credential_id'])
        .where({
          company_id: companyUUID,
          account_number: v.account_number,
        })
        .forUpdate()
        .first();

      oldConnectionCredentialId = existingBankAccount?.connection_credential_id ?? null;

      // Create bank account entry
      const [bankAccountRow] = await tx('bank_accounts')
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
          provider_id: v.provider_id,
          provider_bank_account_id: v.provider_bank_account_id,
          connection_status: v.connection_status,
          account_metadata: v.account_metadata,
          connection_credential_id: v.connection_credential_id,
          last_sync_at: v.last_sync_at,
          sync_error: v.sync_error,
          notes: v.notes,
          created_by_id: userId,
          updated_by_id: userId,
        })
        .onConflict(['account_number', 'company_id'])
        .merge({
          bank_id: bankId,
          business_or_personal: v.business_or_personal || 'business',
          provider_id: v.provider_id,
          connection_credential_id: v.connection_credential_id,
          connection_status: v.connection_status,
          updated_by_id: userId,
          updated_at: tx.fn.now(),
        })
        .returning<{ id: string; connection_credential_id: string | null }[]>([
          'id',
          'connection_credential_id',
        ]);
      bankAccountId = bankAccountRow.id;
      const newConnectionCredentialId = bankAccountRow.connection_credential_id;

      if (oldConnectionCredentialId && oldConnectionCredentialId !== newConnectionCredentialId) {
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
          await tx('bank_account_credentials').where('id', oldConnectionCredentialId).update({
            status: 'revoked',
            updated_by: userId,
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

    return successResponse('Bank account and associated COA created successfully', {
      coaId,
      bankAccountId,
      wasUpdated: !!oldConnectionCredentialId,
    });
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
  return createBankAccount({ bankAccountData: data, userId, companyId, trx });
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
      const result = await txn('bank_accounts')
        .where('id', i.id)
        .where('company_id', companyUUID)
        .update({
          display_name: i.displayName,
          account_type: i.accountType,
          business_or_personal: i.businessOrPersonal,
          connection_status: i.connectionStatus,
          notes: i.notes,
          updated_by_id: userId,
          updated_at: txn.fn.now(),
        });
      if (result === 0) {
        throw new Error(`Unable to update bank account ${i.id}`);
      }

      results.push(result);
    }
    return successResponse('Bank accounts updated successfully', results.length);
  };

  try {
    const result = trx ? await exec(trx) : await knexClient.transaction(exec);
    logger.info({ userId, companyId, duration: Date.now() - startTime }, 'Bank accounts updated');
    return result;
  } catch (error) {
    logger.error(
      { userId, companyId, duration: Date.now() - startTime },
      'Failed to update bank accounts',
    );
    return errorResponse('Failed to update bank accounts', error);
  }
}
