import { ErrorCode, errorResponse, successResponse } from '../../../shared/utils/response.utils.js';
import { knexClient } from '../../../db/knexClient.js';
import type { ApiResponse } from '../../../core/types/api.types.js';
import {
  type BankAccountType,
  type BankAccountWithMeta,
  type CompanyBankingSnapshot,
  newBankAccountInput,
  type NewBankAccountInput,
} from './bankAccounts.types.js';
// import Decimal from "decimal.js";
import { getCompanyUUID } from '../../../shared/utils/random.utils.js';
import { camelToSnake, snakeToCamel } from '../../../shared/utils/formatting.utils.js';
import { coaSource, type CoaSource } from '../../chartOfAccounts/coa.types.js';
import type { Knex } from 'knex';
import { type AccessibleCompaniesResponse } from '../../userRoles/userRoles.types.js';
import { getAccountTypeByKey } from '../../account/account.registry.js';
import { getCurrency } from 'src/domains/currencies/currencies.utils.js';
import logger from 'src/shared/utils/logger.js';
import type { BankAccountConnectionStatus } from 'src/domains/bankAccountConnections/baccons.types.js';

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
  'bac.id as bankConnectionId',
  'bac.status as bankConnectionStatus',
  'bac.provider_bank_account_id as providerBankAccountId',
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
      .leftJoin('bank_account_connections as bac', 'ba.id', 'bac.bank_account_id')
      .leftJoin('bank_feed_providers as p', 'bac.provider_id', 'p.id');

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

/**
 * Creates a new bank account for a company, just one
 * @param input
 * @returns
 */
export async function createNewBankAccount(input: {
  companyId: string;
  userId: string;
  data: NewBankAccountInput;
  userContext?: AccessibleCompaniesResponse;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<BankAccountWithMeta>> {
  const knexInstance = input.trx || knexClient;
  const { data: inputData, userId, companyId } = input;
  if (!companyId)
    return errorResponse('Company ID is required') as ApiResponse<BankAccountWithMeta>;
  try {
    const companyUUID = await getCompanyUUID(companyId, input.trx);
    if (!companyUUID) {
      return errorResponse('Invalid company ID') as ApiResponse<BankAccountWithMeta>;
    }

    const validatedInput = newBankAccountInput.safeParse(camelToSnake(inputData));
    if (!validatedInput.success) {
      return errorResponse(
        `Invalid input provided`,
        validatedInput.error.flatten(),
      ) as ApiResponse<BankAccountWithMeta>;
    }

    const { data } = validatedInput;

    // Check if bank and currency ids are valid
    const [bank, currency] = await Promise.all([
      knexInstance('banks').select('id').where('id', data.bank_id).first(),
      knexInstance('currencies').select('id').where('id', data.currency_id).first(),
    ]);

    if (!bank)
      return errorResponse('The selected bank cannot be verified', undefined, {
        code: ErrorCode.NOT_FOUND,
      }) as ApiResponse<BankAccountWithMeta>;
    if (!currency) return errorResponse('Invalid currency');

    // Check that bank account does not already exist
    const existing = await knexInstance('bank_accounts')
      .select('id')
      .where({
        company_id: companyUUID,
        bank_id: data.bank_id,
        account_number: data.account_number,
      })
      .first();

    if (existing) {
      return errorResponse('Bank account with same account number already exists');
    }

    const accountTypeKey = 'ca_bank';
    const accountType = await getAccountTypeByKey(accountTypeKey);
    if (!accountType || !accountType.id)
      return errorResponse('Failed to fetch account type for bank account');

    // Create chart of account (aka ledger) for the bank account
    const coaInput = {
      code: data.account_code,
      name: data.display_name,
      accountTypeId: accountType.id,
      source: data.source || coaSource.enum.user,
    };

    const existingCoa = await knexInstance('coa')
      .select('id')
      .where({
        company_id: companyUUID,
        name: coaInput.name,
      })
      .first();

    console.log(existingCoa);
    if (existingCoa) {
      return errorResponse(
        `A chart of account with the name "${coaInput.name}" ${coaInput.code ? `and code "${coaInput.code}"` : ''} already exists in this company`,
        undefined,
        { code: ErrorCode.CONFLICT },
      );
    }

    const executeWithTransaction = async (tx: Knex.Transaction) => {
      // const coa = await createCoa({
      //   companyId,
      //   userId,
      //   data: [coaInput],
      //   trx: tx,
      // });

      const [coa] = await tx('coa')
        .insert({
          company_id: companyUUID,
          name: coaInput.name,
          code: coaInput.code,
          account_type_id: coaInput.accountTypeId,
          source: coaInput.source,
          created_by_id: userId,
          updated_by_id: userId,
          currency_id: currency.id,
        })
        .returning('*');

      if (!coa || !coa.id) {
        tx.rollback();
        return errorResponse('Failed to create coa for bank') as ApiResponse<BankAccountWithMeta>;
      }

      // Create new bank account
      const [newBankAccount] = await tx('bank_accounts')
        .insert({
          display_name: data.display_name,
          account_name: data.account_name || data.display_name,
          account_type: data.account_type,
          account_number: data.account_number,
          bank_id: data.bank_id,
          currency_id: data.currency_id,
          company_id: companyUUID,
          coa_id: coa.id,
          created_by_id: userId,
          updated_by_id: userId,
        })
        .returning('*');

      if (!newBankAccount) {
        return errorResponse(
          'Failed to create bank account record',
        ) as ApiResponse<BankAccountWithMeta>;
      }

      const [newBankAccountDetails] = await tx('bank_accounts as ba')
        .select(BANK_ACCOUNT_FIELDS)
        .where('ba.id', newBankAccount.id)
        .join('banks as b', 'ba.bank_id', 'b.id')
        .join('currencies as cur', 'ba.currency_id', 'cur.id')
        .join('companies as c', 'ba.company_id', 'c.id')
        .join('currencies as rc', 'c.reporting_currency_id', 'rc.id')
        .join('coa', 'ba.coa_id', 'coa.id')
        .leftJoin('account_types as at', 'coa.account_type_id', 'at.id')
        .leftJoin('bank_account_connections as bac', 'ba.id', 'bac.bank_account_id')
        .leftJoin('bank_feed_providers as p', 'bac.provider_id', 'p.id');

      return successResponse(
        'Bank account created successfully',
        snakeToCamel(newBankAccountDetails),
      );
    };

    if (input.trx) {
      return (await executeWithTransaction(input.trx)) as ApiResponse<BankAccountWithMeta>;
    } else {
      return (await knexInstance.transaction(
        executeWithTransaction,
      )) as ApiResponse<BankAccountWithMeta>;
    }
  } catch (error) {
    return errorResponse('An unexpected error occurred while creating the bank account', error);
  }
}

type BaseCreateBankAccountParams = {
  companyId: string;
  currencyCode: string;
  bankId: string;
  createdById: string;
  accountNumber: string;
  displayName: string;
  accountName?: string | null;
  coaCode?: string | null;
  coaDescription?: string | null;
  accountType?: BankAccountType | null;
  inputSource?: CoaSource | null;
  businessOrPersonal?: 'business' | 'personal' | null;
  bankAccountMetadata?: Record<string, unknown> | null;
};

export type WithConnParams = BaseCreateBankAccountParams & {
  providerId: string;
  providerBankAccountId: string;
  connectionStatus: string;
  rawConnectionData?: Record<string, unknown> | null;
  credentialId: string;
};

type WithoutConnParams = BaseCreateBankAccountParams;

type WithConnResp = { coaId: string; bankAccountId: string; connectionId: string };
type WithoutConnResp = { coaId: string; bankAccountId: string };

interface CreateBankAccountParams {
  companyId: string;
  currencyCode: string;
  bankId: string;
  providerId: string;
  createdById: string;
  accountNumber: string;
  displayName: string;
  accountName?: string | null;
  providerBankAccountId: string;
  connectionStatus: BankAccountConnectionStatus;
  coaCode?: string | null;
  coaDescription?: string | null;
  accountType?: BankAccountType | null;
  inputSource?: CoaSource;
  businessOrPersonal?: string | null;
  bankAccountMetadata?: Record<string, unknown> | null;
  connectionMetadata?: Record<string, unknown> | null;
  credentialId: string;
}

interface CreateBankAccountResponse {
  coaId: string;
  bankAccountId: string;
  connectionId?: string;
}

export async function createBankAccount2(
  params: CreateBankAccountParams,
  trx?: Knex.Transaction,
): Promise<ApiResponse<CreateBankAccountResponse>> {
  const start = Date.now();
  const log = logger.child({
    op: 'createBankAccount',
    companyId: params.companyId,
    userId: params.createdById,
  });

  const companyUUID = await getCompanyUUID(params.companyId);
  const accountCurrency = await getCurrency(params.currencyCode);
  const at = await getAccountTypeByKey('ca_bank');
  if (!at?.id) throw new Error('Account type not found');
  const accountTypeId = at.id;

  const run = async (tx: Knex.Transaction): Promise<ApiResponse<CreateBankAccountResponse>> => {
    // Check for existing connection
    const existingConn = await tx('bank_account_connections')
      .select('id', 'bank_account_id')
      .where({
        provider_id: params.providerId,
        provider_bank_account_id: params.providerBankAccountId,
      })
      .first()
      .forUpdate();

    if (existingConn?.bank_account_id) {
      const ba = await tx('bank_accounts')
        .select('id', 'coa_id')
        .where({ id: existingConn.bank_account_id })
        .first();
      if (!ba) throw new Error('Invariant: connection points to missing bank account');
      return successResponse('Bank account already exists', {
        coaId: ba.coa_id,
        bankAccountId: ba.id,
        connectionId: existingConn.id,
      });
    }

    const company = await tx('companies')
      .select('reporting_currency_id')
      .where({ id: companyUUID })
      .first();
    if (!company) throw new Error('Company not found');

    // Create COA entry, else read existing on unique violation
    let coaId: string;
    const coaName = params.displayName || params.accountName;
    try {
      const [row] = await tx('coa')
        .insert({
          code: params.coaCode ?? null,
          name: coaName,
          description: params.coaDescription,
          account_type_id: accountTypeId,
          currency_id: company.reporting_currency_id,
          company_id: companyUUID,
          created_by_id: params.createdById,
          updated_by_id: params.createdById,
          source: params.inputSource ?? 'user',
        })
        .returning<{ id: string }[]>('id');
      coaId = row.id;
    } catch (e: any) {
      if (e?.code !== '23505') throw e;
      const byCode =
        params.coaCode &&
        (await tx('coa')
          .select('id')
          .where({ code: params.coaCode, company_id: companyUUID })
          .first());
      const byName =
        !byCode &&
        (await tx('coa')
          .select('id')
          .where({ name: coaName, account_type_id: accountTypeId, company_id: companyUUID })
          .first());
      if (!byCode && !byName) throw new Error('Failed to create or locate COA');
      coaId = (byCode || byName)!.id;
    }

    // Create bank account entry
    let bankAccountId: string;
    try {
      const [row] = await tx('bank_accounts')
        .insert({
          display_name: params.displayName,
          account_name: params.accountName ?? params.displayName,
          account_type: params.accountType,
          account_number: params.accountNumber,
          business_or_personal: params.businessOrPersonal ?? null,
          bank_id: params.bankId,
          currency_id: accountCurrency.id,
          company_id: params.companyId,
          coa_id: coaId,
          created_by_id: params.createdById,
          updated_by_id: params.createdById,
          metadata: params.bankAccountMetadata ?? {},
        })
        .returning<{ id: string }[]>('id');
      bankAccountId = row.id;
    } catch (e: any) {
      if (e?.code !== '23505') throw e;
      const existing = await tx('bank_accounts')
        .select('id')
        .where({
          company_id: companyUUID,
          bank_id: params.bankId,
          account_number: params.accountNumber,
        })
        .first();
      if (!existing) throw new Error('Failed to create or locate bank account');
      bankAccountId = existing.id;
    }

    // Create bank account connection entry
    const connectionId =
      existingConn?.id ??
      (await tx('bank_account_connections')
        .insert({
          provider_bank_account_id: params.providerBankAccountId,
          bank_account_id: bankAccountId,
          provider_id: params.providerId,
          status: params.connectionStatus,
          created_by_id: params.createdById,
          connected_at: tx.fn.now(),
          raw_metadata: params.connectionMetadata ?? {},
          company_bank_credential_id: params.credentialId,
        })
        .onConflict(['provider_id', 'provider_bank_account_id'])
        .ignore()
        .returning<{ id: string }[]>('id')
        .then(async (rows) => {
          if (rows[0]) return rows[0].id;
          const existing = await tx('bank_account_connections')
            .select('id', 'bank_account_id')
            .where({
              provider_id: params.providerId,
              provider_bank_account_id: params.providerBankAccountId,
            })
            .first()
            .forUpdate();
          if (!existing) throw new Error('Failed to create or locate connection');
          if (!existing.bank_account_id) {
            const [upd] = await tx('bank_account_connections')
              .where({ id: existing.id })
              .update({
                bank_account_id: bankAccountId,
                status: params.connectionStatus,
              })
              .returning<{ id: string }[]>('id');
            return upd.id;
          }
          return existing.id;
        }));

    return successResponse('Bank account record created successfully', {
      coaId,
      bankAccountId,
      connectionId,
    });
  };
  try {
    const res = await (trx ? run(trx) : knexClient.transaction(run));
    log.info({ duration: Date.now() - start }, 'created');
    return res;
  } catch (error) {
    log.error(error);
    return errorResponse('Failed to create bank account');
  }
}

function hasConn(p: BaseCreateBankAccountParams | WithConnParams): p is WithConnParams {
  return 'providerId' in p && 'providerBankAccountId' in p && 'connectionStatus' in p;
}

export async function createBankAccount(
  params: WithConnParams | WithoutConnParams,
  createConnection: boolean,
  trx?: Knex.Transaction,
): Promise<ApiResponse<WithConnResp | WithoutConnResp>> {
  const start = Date.now();
  const log = logger.child({
    op: 'createBankAccount',
    companyId: params.companyId,
    userId: params.createdById,
  });

  const companyUUID = await getCompanyUUID(params.companyId);
  const accountCurrency = await getCurrency(params.currencyCode);
  const at = await getAccountTypeByKey('ca_bank');
  if (!at?.id) throw new Error('Account type not found');
  const accountTypeId = at.id;

  const run = async (
    tx: Knex.Transaction,
  ): Promise<ApiResponse<WithConnResp | WithoutConnResp>> => {
    let existingConn: { id: string; bank_account_id: string | null } | undefined;

    if (createConnection) {
      if (!hasConn(params)) throw new Error('Missing provider fields for connection');
      const existingConn = await tx('bank_account_connections')
        .select('id', 'bank_account_id')
        .where({
          provider_id: params.providerId,
          provider_bank_account_id: params.providerBankAccountId,
        })
        .first()
        .forUpdate();

      if (existingConn?.bank_account_id) {
        const ba = await tx('bank_accounts')
          .select('id', 'coa_id')
          .where({ id: existingConn.bank_account_id })
          .first();
        if (!ba) throw new Error('Invariant: connection points to missing bank account');
        return successResponse('Bank account already exists', {
          coaId: ba.coa_id,
          bankAccountId: ba.id,
          connectionId: existingConn.id,
        });
      }
    }

    const company = await tx('companies')
      .select('reporting_currency_id')
      .where({ id: companyUUID })
      .first();
    if (!company) throw new Error('Company not found');

    let coaId: string;
    const coaName = params.displayName || params.accountName;
    try {
      const [row] = await tx('coa')
        .insert({
          code: params.coaCode ?? null,
          name: coaName,
          description: params.coaDescription,
          account_type_id: accountTypeId,
          currency_id: company.reporting_currency_id,
          company_id: companyUUID,
          created_by_id: params.createdById,
          updated_by_id: params.createdById,
          source: params.inputSource ?? 'user',
        })
        .returning<{ id: string }[]>('id');
      coaId = row.id;
    } catch (e: any) {
      if (e?.code !== '23505') throw e;
      const byCode =
        params.coaCode &&
        (await tx('coa')
          .select('id')
          .where({ code: params.coaCode, company_id: companyUUID })
          .first());
      const byName =
        !byCode &&
        (await tx('coa')
          .select('id')
          .where({ name: coaName, account_type_id: accountTypeId, company_id: companyUUID })
          .first());
      if (!byCode && !byName) throw new Error('Failed to create or locate COA');
      coaId = (byCode || byName)!.id;
    }

    // Create bank account entry
    let bankAccountId: string;
    try {
      const [row] = await tx('bank_accounts')
        .insert({
          display_name: params.displayName,
          account_name: params.accountName ?? params.displayName,
          account_type: params.accountType,
          account_number: params.accountNumber,
          business_or_personal: params.businessOrPersonal ?? null,
          bank_id: params.bankId,
          currency_id: accountCurrency.id,
          company_id: companyUUID,
          coa_id: coaId,
          created_by_id: params.createdById,
          updated_by_id: params.createdById,
          metadata: params.bankAccountMetadata ?? {},
        })
        .returning<{ id: string }[]>('id');
      bankAccountId = row.id;
    } catch (e: any) {
      if (e?.code !== '23505') throw e;
      const existing = await tx('bank_accounts')
        .select('id')
        .where({
          company_id: companyUUID,
          bank_id: params.bankId,
          account_number: params.accountNumber,
        })
        .first();
      if (!existing) throw new Error('Failed to create or locate bank account');
      bankAccountId = existing.id;
    }

    if (!createConnection) {
      return successResponse('Bank account created', { coaId, bankAccountId });
    }

    const connectionId =
      existingConn?.id ??
      (await tx('bank_account_connections')
        .insert({
          provider_bank_account_id: (params as WithConnParams).providerBankAccountId,
          bank_account_id: bankAccountId,
          provider_id: (params as WithConnParams).providerId,
          status: bankAccountId ? 'active' : (params as WithConnParams).connectionStatus,
          created_by_id: params.createdById,
          connected_at: tx.fn.now(),
          raw_metadata: (params as WithConnParams).rawConnectionData ?? {},
          company_bank_credential_id: (params as WithConnParams).credentialId,
        })
        .onConflict(['provider_id', 'provider_bank_account_id'])
        .ignore()
        .returning<{ id: string }[]>('id')
        .then(async (rows) => {
          if (rows[0]) return rows[0].id;
          const existing = await tx('bank_account_connections')
            .select('id', 'bank_account_id')
            .where({
              provider_id: (params as WithConnParams).providerId,
              provider_bank_account_id: (params as WithConnParams).providerBankAccountId,
            })
            .first()
            .forUpdate();
          if (!existing) throw new Error('Failed to create or locate connection');
          if (!existing.bank_account_id) {
            const [upd] = await tx('bank_account_connections')
              .where({ id: existing.id })
              .update({
                bank_account_id: bankAccountId,
                status: (params as WithConnParams).connectionStatus,
              })
              .returning<{ id: string }[]>('id');
            return upd.id;
          }
          return existing.id;
        }));

    return successResponse('Bank account record created successfully', {
      coaId,
      bankAccountId,
      connectionId,
    });
  };
  try {
    const res = await (trx ? run(trx) : knexClient.transaction(run));
    log.info({ duration: Date.now() - start }, 'created');
    return res;
  } catch (error) {
    log.error(error);
    return errorResponse('Failed to create bank account');
  }
}

export async function createBankAccountWithConnection(
  params: WithConnParams,
  trx?: Knex.Transaction,
): Promise<ApiResponse<WithConnResp>> {
  return createBankAccount(params, true, trx) as Promise<ApiResponse<WithConnResp>>;
}

// Without connection
export async function createBankAccountWithoutConnection(
  params: WithoutConnParams,
  trx?: Knex.Transaction,
): Promise<ApiResponse<WithoutConnResp>> {
  return createBankAccount(params, false, trx);
}
