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
  ): Promise<ApiResponse<{ coaId: string; bankAccountId: string }>> => {
    // Get currencyId, validate bankId
    const [company, currency, bank, accountType] = await Promise.all([
      tx('companies')
        .select('id')
        .where(isValidUUID(companyId) ? 'id' : 'short_code', companyId)
        .returning<{ id: string; reporting_currency_id: string }>(['id', 'reporting_currency_id'])
        .first(),

      getCurrency(v.currency_code),

      tx('banks').select('id').where('id', v.bank_id).first(),

      getAccountTypeByKey('ca_bank'),
    ]);

    if (!company || !company.id || !company.reporting_currency_id)
      return errorResponse('Company not found');
    if (!currency || !currency.id) return errorResponse('Currency not found');
    if (!bank) return errorResponse('Bank not found');
    if (!accountType || !accountType.id) return errorResponse('Account type not found');

    const companyUUID = company.id;
    const reportingCurrencyId = company.reporting_currency_id;
    const currencyId = currency.id;
    const bankId = bank.id || v.bank_id;
    const coaAccountTypeId = accountType.id;
    const coaName = v.coa_name || v.display_name || v.account_name;
    const coaCode = v.coa_code || `**${v.account_number.slice(0, 4)}`;

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
      coaId = coaRow.id;
    } catch (e: any) {
      if (e?.code !== '23505') throw e;
      throw new Error('Chart of account with the same name or code already exists');
    }

    let bankAccountId: string;
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

      const oldConnectionCredentialId = existingBankAccount?.connection_credential_id ?? null;

      // Create bank account entry
      const [bankAccountRow] = await tx('bank_accounts')
        .insert({
          display_name: v.display_name,
          account_name: v.account_name || v.display_name,
          account_number: v.account_number,
          account_number_mask: v.account_number_mask,
          account_type: v.account_type,
          business_or_personal: v.business_or_personal,
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
        const result = await tx('bank_accounts')
          .where('connection_credential_id', oldConnectionCredentialId)
          .whereNot('id', bankAccountId)
          .count()
          .first();
        const count = Number(result?.count ?? 0);
        if (count && count === 0) {
          await tx('bank_account_credentials').where('id', oldConnectionCredentialId).update({
            status: 'revoked',
          });
        }
      }
    } catch (e: any) {
      if (e?.code !== '23505') throw e;
      throw new Error('Bank account with the same details already exist');
    }

    return successResponse('Bank account and associated COA created successfully', {
      coaId,
      bankAccountId,
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
