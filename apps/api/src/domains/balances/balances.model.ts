import type { Knex } from 'knex';
import { z } from 'zod';

import type { ApiResponse } from '../../core/types/api.types.js';
import { knexClient as knex, knexClient } from '../../db/knexClient.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { determineExchangeRate } from '../exchangeRates/exchangeRates.utils.js';
import {
  enqueueBankBalance,
  enqueueGLBalance,
} from './balance-recalc.queue.js';

// Validation schemas
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');

// Bank Balance Queries

/**
 * Get current balance for a single bank account
 * Used in: Bank account details, reconciliation
 */
export async function getCurrentBankBalance({
  companyId,
  bankAccountId,
  trx,
}: {
  companyId: string;
  bankAccountId: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    bankAccountId: string;
    nativeBalance: string; // In bank's native currency
    asOfTime: Date;
    currencyCode: string;
  }>
> {
  try {
    const companyUUID = await getCompanyUUID(companyId, trx);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    const result = await (trx || knexClient)(
      'bank_account_current_native_balances as bab',
    )
      .select('bab.native_balance', 'bab.as_of_time', 'c.code as currency_code')
      .join('bank_accounts as ba', 'bab.bank_account_id', 'ba.id')
      .join('currencies as c', 'ba.currency_id', 'c.id')
      .where({
        'bab.company_id': companyUUID,
        'bab.bank_account_id': bankAccountId,
      })
      .first();

    if (!result) {
      return errorResponse(
        `Bank account balance not found for account ${bankAccountId}`,
      );
    }

    return successResponse('Bank account balance retrieved', {
      bankAccountId,
      nativeBalance: result.native_balance,
      asOfTime: result.as_of_time,
      currencyCode: result.currency_code,
    });
  } catch (error) {
    return errorResponse('Failed to get bank account balance', error);
  }
}

/**
 * Get current balances for all bank accounts
 * Used in: Dashboard, bank account listings
 */
export async function getAllBankBalances({
  companyId,
  trx,
}: {
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<
    {
      bankAccountId: string;
      displayName: string;
      nativeBalance: string;
      currencyCode: string;
      asOfTime: Date;
    }[]
  >
> {
  try {
    const companyUUID = await getCompanyUUID(companyId, trx);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    const results = await (trx || knexClient)(
      'bank_account_current_native_balances as bab',
    )
      .select(
        'bab.bank_account_id',
        'bab.native_balance',
        'bab.as_of_time',
        'ba.display_name',
        'c.code as currency_code',
      )
      .join('bank_accounts as ba', 'bab.bank_account_id', 'ba.id')
      .join('currencies as c', 'ba.currency_id', 'c.id')
      .where({
        'bab.company_id': companyUUID,
        'ba.is_deleted': false,
      })
      .orderBy('ba.display_name');

    const balances = results.map((row: any) => ({
      bankAccountId: row.bank_account_id,
      displayName: row.display_name,
      nativeBalance: row.native_balance,
      currencyCode: row.currency_code,
      asOfTime: row.as_of_time,
    }));

    return successResponse('Bank balances retrieved', balances);
  } catch (error) {
    return errorResponse('Failed to get bank balances', error);
  }
}

/**
 * Get total cash in bank (sum of all bank account balances)
 * Used in: Dashboard summary cards
 * Converts all balances to company's reporting currency using exchange rates
 */
export async function getTotalCashInBank({
  companyId,
  trx,
}: {
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    totalInReportingCurrency: string;
    reportingCurrencyCode: string;
    asOfTime: Date;
    accountCount: number;
    conversionDetails: {
      currencyCode: string;
      originalBalance: string;
      convertedBalance: string;
      exchangeRate: number;
    }[];
  }>
> {
  const exec = async (tx: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, tx);
    if (!companyUUID) {
      throw new Error(`Company not found: ${companyId}`);
    }

    // First, get company's reporting currency (always required)
    const company = await tx('companies as comp')
      .select(
        'comp.reporting_currency_id',
        'comp_curr.code as reporting_currency_code',
      )
      .join(
        'currencies as comp_curr',
        'comp.reporting_currency_id',
        'comp_curr.id',
      )
      .where({
        'comp.id': companyUUID,
        'comp.is_deleted': false,
      })
      .first();

    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    // Get all bank balances with currency information
    const balances = await tx('bank_account_current_native_balances as bab')
      .select(
        'bab.native_balance',
        'bab.as_of_time',
        'ba.currency_id',
        'c.code as currency_code',
      )
      .join('bank_accounts as ba', 'bab.bank_account_id', 'ba.id')
      .join('currencies as c', 'ba.currency_id', 'c.id')
      .where({
        'bab.company_id': companyUUID,
        'ba.is_deleted': false,
      });

    if (balances.length === 0) {
      return successResponse('Total cash calculated', {
        totalInReportingCurrency: '0.0000000000',
        reportingCurrencyCode: company.reporting_currency_code,
        asOfTime: new Date(),
        accountCount: 0,
        conversionDetails: [],
      });
    }

    // Get current date for exchange rate lookup
    const currentDate = new Date();

    // Convert all balances to reporting currency
    const conversionDetails: any[] = [];
    let totalInReportingCurrency = 0;

    for (const balance of balances) {
      const originalBalance = parseFloat(balance.native_balance);

      if (balance.currency_id === company.reporting_currency_id) {
        // Same currency, no conversion needed
        totalInReportingCurrency += originalBalance;
        conversionDetails.push({
          currencyCode: balance.currency_code,
          originalBalance: balance.native_balance,
          convertedBalance: balance.native_balance,
          exchangeRate: 1,
        });
      } else {
        // Different currency, need to convert
        const exchangeRate = await determineExchangeRate({
          date: currentDate,
          fromCurrencyId: balance.currency_id,
          toCurrencyId: company.reporting_currency_id,
        });

        if (exchangeRate === null) {
          throw new Error(
            `Failed to get exchange rate for ${balance.currency_code} to ${company.reporting_currency_code}`,
          );
        }

        const convertedBalance = originalBalance * exchangeRate;
        totalInReportingCurrency += convertedBalance;

        conversionDetails.push({
          currencyCode: balance.currency_code,
          originalBalance: balance.native_balance,
          convertedBalance: convertedBalance.toFixed(10),
          exchangeRate: exchangeRate,
        });
      }
    }

    return successResponse('Total cash calculated with currency conversion', {
      totalInReportingCurrency: totalInReportingCurrency.toFixed(10),
      reportingCurrencyCode: company.reporting_currency_code,
      asOfTime: balances[0]?.as_of_time || new Date(),
      accountCount: balances.length,
      conversionDetails,
    });
  };

  try {
    if (trx) {
      // Use provided transaction - let caller handle rollback
      return await exec(trx);
    } else {
      // Create new transaction
      return await knexClient.transaction(exec);
    }
  } catch (error) {
    return errorResponse('Failed to calculate total cash in bank', error);
  }
}

// GL Balance Queries

/**
 * Get current balance for a single COA account
 * Used in: COA account details, reconciliation
 */
export async function getCurrentGLBalance({
  companyId,
  coaId,
  trx,
}: {
  companyId: string;
  coaId: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    coaId: string;
    reportingBalance: string; // In company's reporting currency
    asOfTime: Date;
  }>
> {
  try {
    const companyUUID = await getCompanyUUID(companyId, trx);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    const result = await (trx || knexClient)('gl_current_balances')
      .select('reporting_currency_balance', 'as_of_time')
      .where({
        company_id: companyUUID,
        coa_id: coaId,
      })
      .first();

    if (!result) {
      return errorResponse(`GL balance not found for COA ${coaId}`);
    }

    return successResponse('GL balance retrieved', {
      coaId,
      reportingBalance: result.reporting_currency_balance,
      asOfTime: result.as_of_time,
    });
  } catch (error) {
    return errorResponse('Failed to get GL balance', error);
  }
}

/**
 * Get current balances for multiple COA accounts
 * Used in: COA list, trial balance
 */
export async function getGLBalances({
  companyId,
  coaIds,
  trx,
}: {
  companyId: string;
  coaIds?: string[];
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<
    {
      coaId: string;
      accountCode: string;
      accountName: string;
      reportingBalance: string;
      asOfTime: Date;
    }[]
  >
> {
  try {
    const companyUUID = await getCompanyUUID(companyId, trx);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    const results = await (trx || knexClient)('gl_current_balances as glb')
      .select(
        'glb.coa_id',
        'glb.reporting_currency_balance',
        'glb.as_of_time',
        'coa.account_code',
        'coa.account_name',
      )
      .join('coa', 'glb.coa_id', 'coa.id')
      .where({
        'glb.company_id': companyUUID,
        'coa.is_deleted': false,
      })
      .whereIn('glb.coa_id', coaIds || [])
      .orderBy('coa.account_code');

    const balances = results.map((row: any) => ({
      coaId: row.coa_id,
      accountCode: row.account_code,
      accountName: row.account_name,
      reportingBalance: row.reporting_currency_balance,
      asOfTime: row.as_of_time,
    }));

    return successResponse('GL balances retrieved', balances);
  } catch (error) {
    return errorResponse('Failed to get GL balances', error);
  }
}

/**
 * Get balances grouped by account type
 * Used in: Financial statements, balance sheet preparation
 */
export async function getGLBalancesByType({
  companyId,
  accountTypeId,
  trx,
}: {
  companyId: string;
  accountTypeId?: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<
    {
      accountTypeId: string;
      accountTypeName: string;
      accounts: {
        coaId: string;
        accountCode: string;
        accountName: string;
        reportingBalance: string;
      }[];
      totalBalance: string;
    }[]
  >
> {
  try {
    const companyUUID = await getCompanyUUID(companyId, trx);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    let query = (trx || knexClient)('gl_current_balances as glb')
      .select(
        'at.id as account_type_id',
        'at.name as account_type_name',
        'glb.coa_id',
        'glb.reporting_currency_balance',
        'coa.account_code',
        'coa.account_name',
      )
      .join('coa', 'glb.coa_id', 'coa.id')
      .join('account_types as at', 'coa.account_type_id', 'at.id')
      .where({
        'glb.company_id': companyUUID,
        'coa.is_deleted': false,
        'at.is_deleted': false,
      });

    if (accountTypeId) {
      query = query.where('at.id', accountTypeId);
    }

    const results = await query.orderBy(['at.sort_order', 'coa.account_code']);

    // Group by account type
    const grouped = results.reduce(
      (acc: any, row: any) => {
        const typeId = row.account_type_id;
        if (!acc[typeId]) {
          acc[typeId] = {
            accountTypeId: typeId,
            accountTypeName: row.account_type_name,
            accounts: [],
            totalBalance: '0.0000000000',
          };
        }

        acc[typeId].accounts.push({
          coaId: row.coa_id,
          accountCode: row.account_code,
          accountName: row.account_name,
          reportingBalance: row.reporting_currency_balance,
        });

        // Add to total
        const currentTotal = parseFloat(acc[typeId].totalBalance);
        const accountBalance = parseFloat(row.reporting_currency_balance);
        acc[typeId].totalBalance = (currentTotal + accountBalance).toFixed(10);

        return acc;
      },
      {} as Record<string, any>,
    );

    return successResponse(
      'GL balances by type retrieved',
      Object.values(grouped),
    );
  } catch (error) {
    return errorResponse('Failed to get GL balances by type', error);
  }
}

// Historical Balance Queries

/**
 * Get bank balance history for reconciliation
 * Used in: Bank reconciliation workflow
 */
export async function getBankBalanceHistory({
  companyId,
  bankAccountId,
  fromDate,
  toDate,
  trx,
}: {
  companyId: string;
  bankAccountId: string;
  fromDate: string;
  toDate: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<
    {
      day: string;
      nativeBalance: string;
      transactionCount: number;
    }[]
  >
> {
  try {
    const companyUUID = await getCompanyUUID(companyId, trx);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    dateStringSchema.parse(fromDate);
    dateStringSchema.parse(toDate);

    const results = await (trx || knexClient)(
      'bank_account_daily_native_snapshots as bbs',
    )
      .select(
        'bbs.day',
        'bbs.closing_balance',
        knex.raw('COUNT(bt.id) as transaction_count'),
      )
      .leftJoin('bank_transactions as bt', function (this: any) {
        this.on('bt.bank_account_id', '=', 'bbs.bank_account_id')
          .andOn('bt.company_id', '=', 'bbs.company_id')
          .andOn(knex.raw('DATE(bt.transaction_date) = bbs.day'))
          .andOn('bt.is_deleted', '=', knex.raw('false'));
      })
      .where({
        'bbs.company_id': companyUUID,
        'bbs.bank_account_id': bankAccountId,
      })
      .whereBetween('bbs.day', [fromDate, toDate])
      .groupBy('bbs.day', 'bbs.closing_balance')
      .orderBy('bbs.day');

    const history = results.map((row: any) => ({
      day: row.day,
      nativeBalance: row.closing_balance,
      transactionCount: parseInt(row.transaction_count) || 0,
    }));

    return successResponse('Bank balance history retrieved', history);
  } catch (error) {
    return errorResponse('Failed to get bank balance history', error);
  }
}

/**
 * Get GL balance history for period comparison
 * Used in: Financial reports, period analysis
 */
export async function getGLBalanceHistory({
  companyId,
  coaId,
  fromDate,
  toDate,
  trx,
}: {
  companyId: string;
  coaId: string;
  fromDate: string;
  toDate: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<
    {
      day: string;
      reportingBalance: string;
      transactionCount: number;
    }[]
  >
> {
  try {
    const companyUUID = await getCompanyUUID(companyId, trx);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    dateStringSchema.parse(fromDate);
    dateStringSchema.parse(toDate);

    const results = await (trx || knexClient)(
      'gl_daily_balance_snapshots as gbs',
    )
      .select(
        'gbs.day',
        'gbs.closing_balance',
        knex.raw('COUNT(le.id) as transaction_count'),
      )
      .leftJoin('ledger_entries as le', function (this: any) {
        this.on('le.coa_id', '=', 'gbs.coa_id')
          .andOn('le.company_id', '=', 'gbs.company_id')
          .andOn(knex.raw('DATE(le.fs_date) = gbs.day'))
          .andOn('le.is_deleted', '=', knex.raw('false'));
      })
      .where({
        'gbs.company_id': companyUUID,
        'gbs.coa_id': coaId,
      })
      .whereBetween('gbs.day', [fromDate, toDate])
      .groupBy('gbs.day', 'gbs.reporting_currency_balance')
      .orderBy('gbs.day');

    const history = results.map((row: any) => ({
      day: row.day,
      reportingBalance: row.reporting_currency_balance,
      transactionCount: parseInt(row.transaction_count) || 0,
    }));

    return successResponse('GL balance history retrieved', history);
  } catch (error) {
    return errorResponse('Failed to get GL balance history', error);
  }
}

// Reconciliation Queries

/**
 * Compare bank balance vs linked COA balance
 * Used in: Bank reconciliation workflow
 */
export async function getBankReconciliationBalances({
  companyId,
  bankAccountId,
  trx,
}: {
  companyId: string;
  bankAccountId: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    bankBalance: {
      nativeBalance: string;
      nativeCurrencyCode: string;
      asOfTime: Date;
    };
    coaBalance: {
      reportingBalance: string;
      reportingCurrencyCode: string;
      asOfTime: Date;
      coaId: string | null;
    };
    difference: string | null; // Only if currencies match
  }>
> {
  try {
    const companyUUID = await getCompanyUUID(companyId, trx);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    // Get all data in one query with joins
    const result = await (trx || knexClient)(
      'bank_account_current_native_balances as bab',
    )
      .select(
        'bab.native_balance as bank_native_balance',
        'bab.as_of_time as bank_as_of_time',
        'ba.linked_coa_id',
        'ba.currency_id',
        'c.code as bank_currency_code',
        'comp.reporting_currency_id',
        'comp_curr.code as reporting_currency_code',
        'glb.reporting_currency_balance as coa_balance',
        'glb.as_of_time as coa_as_of_time',
      )
      .join('bank_accounts as ba', 'bab.bank_account_id', 'ba.id')
      .join('currencies as c', 'ba.currency_id', 'c.id')
      .join('companies as comp', 'bab.company_id', 'comp.id')
      .join(
        'currencies as comp_curr',
        'comp.reporting_currency_id',
        'comp_curr.id',
      )
      .leftJoin('gl_current_balances as glb', function () {
        this.on('glb.company_id', '=', 'bab.company_id').andOn(
          'glb.coa_id',
          '=',
          'ba.linked_coa_id',
        );
      })
      .where({
        'bab.company_id': companyUUID,
        'bab.bank_account_id': bankAccountId,
        'ba.is_deleted': false,
      })
      .first();

    if (!result) {
      return errorResponse(
        `Bank account or balance not found: ${bankAccountId}`,
      );
    }

    // Calculate difference if currencies match
    let difference = null;
    if (
      result.coa_balance &&
      result.bank_currency_code === result.reporting_currency_code
    ) {
      const bankBal = parseFloat(result.bank_native_balance);
      const coaBal = parseFloat(result.coa_balance);
      difference = (bankBal - coaBal).toFixed(10);
    }

    return successResponse('Bank reconciliation balances retrieved', {
      bankBalance: {
        nativeBalance: result.bank_native_balance,
        nativeCurrencyCode: result.bank_currency_code,
        asOfTime: result.bank_as_of_time,
      },
      coaBalance: {
        reportingBalance: result.coa_balance || '0.0000000000',
        reportingCurrencyCode: result.reporting_currency_code,
        asOfTime: result.coa_as_of_time || new Date(),
        coaId: result.linked_coa_id,
      },
      difference,
    });
  } catch (error) {
    return errorResponse('Failed to get bank reconciliation balances', error);
  }
}

// Trial Balance Query

/**
 * Get trial balance for a specific fiscal period
 * Uses period balances for performance optimization
 */
export async function getTrialBalance({
  companyId,
  fiscalYear,
  fiscalPeriod,
  periodType = 'monthly',
  trx,
}: {
  companyId: string;
  fiscalYear: number;
  fiscalPeriod: number;
  periodType?: 'monthly' | 'quarterly' | 'yearly';
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    period: {
      year: number;
      period: number;
      type: string;
      startDate: string;
      endDate: string;
    };
    accounts: {
      coaId: string;
      accountCode: string;
      accountName: string;
      accountType: string;
      openingBalance: string;
      periodDebits: string;
      periodCredits: string;
      closingBalance: string;
    }[];
    totals: {
      openingDebit: string;
      openingCredit: string;
      periodDebits: string;
      periodCredits: string;
      closingDebit: string;
      closingCredit: string;
    };
  }>
> {
  try {
    const companyUUID = await getCompanyUUID(companyId, trx);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    // Get period (DB returns snake_case)
    const period = await (trx || knexClient)('fiscal_calendar')
      .where({
        company_id: companyUUID,
        fiscal_year: fiscalYear,
        period_number: fiscalPeriod,
        period_type: periodType,
      })
      .first();

    if (!period) {
      return errorResponse(`Fiscal period not found`);
    }

    // Query period balances (DB returns snake_case)
    const balances = await (trx || knexClient)('gl_period_balances as pb')
      .join('coa as c', 'pb.coa_id', 'c.id')
      .join('account_types as at', 'c.account_type_id', 'at.id')
      .where({
        'pb.company_id': companyUUID,
        'pb.fiscal_year': fiscalYear,
        'pb.fiscal_period': fiscalPeriod,
        'pb.period_type': periodType,
        'c.is_deleted': false,
      })
      .select(
        'pb.coa_id',
        'c.account_code',
        'c.account_name',
        'at.name as account_type',
        'pb.opening_balance',
        'pb.period_debits',
        'pb.period_credits',
        'pb.closing_balance',
      )
      .orderBy('c.account_code');

    // Calculate totals
    const totals = balances.reduce(
      (acc, row) => {
        const opening = parseFloat(row.opening_balance);
        const debits = parseFloat(row.period_debits);
        const credits = parseFloat(row.period_credits);
        const closing = parseFloat(row.closing_balance);

        if (opening >= 0) acc.openingDebit += opening;
        else acc.openingCredit += Math.abs(opening);

        acc.periodDebits += debits;
        acc.periodCredits += credits;

        if (closing >= 0) acc.closingDebit += closing;
        else acc.closingCredit += Math.abs(closing);

        return acc;
      },
      {
        openingDebit: 0,
        openingCredit: 0,
        periodDebits: 0,
        periodCredits: 0,
        closingDebit: 0,
        closingCredit: 0,
      },
    );

    // Return camelCase response
    return successResponse('Trial balance retrieved', {
      period: {
        year: period.fiscal_year,
        period: period.period_number,
        type: period.period_type,
        startDate: period.start_date,
        endDate: period.end_date,
      },
      accounts: balances.map((row) => ({
        coaId: row.coa_id,
        accountCode: row.account_code,
        accountName: row.account_name,
        accountType: row.account_type,
        openingBalance: row.opening_balance,
        periodDebits: row.period_debits,
        periodCredits: row.period_credits,
        closingBalance: row.closing_balance,
      })),
      totals: {
        openingDebit: totals.openingDebit.toFixed(10),
        openingCredit: totals.openingCredit.toFixed(10),
        periodDebits: totals.periodDebits.toFixed(10),
        periodCredits: totals.periodCredits.toFixed(10),
        closingDebit: totals.closingDebit.toFixed(10),
        closingCredit: totals.closingCredit.toFixed(10),
      },
    });
  } catch (error) {
    return errorResponse('Failed to get trial balance', error);
  }
}

// Balance Recalculation Functions

// Configuration constants
const DEFAULT_MAX_ACCOUNTS = 1000;
const DEFAULT_MAX_COMPANIES = 10;

/**
 * Core function to recalculate bank balances with flexible filtering
 * Supports multiple companies, specific bank accounts, and missing balance detection
 */
export async function recalculateBankBalances({
  companyIds,
  bankAccountIds,
  recalcFrom,
  recalcTo,
  triggeredBy,
  options = {},
}: {
  companyIds?: string[];
  bankAccountIds?: string[];
  recalcFrom: string;
  recalcTo?: string;
  triggeredBy: string;
  options?: {
    maxAccounts?: number;
    maxCompanies?: number;
    onlyMissingBalances?: boolean;
  };
}): Promise<
  ApiResponse<{
    jobsQueued: number;
    accountsProcessed: number;
    accountsSkipped: number;
    companiesAffected: number;
    limitReached: boolean;
    jobs: Array<{ companyId: string; bankAccountId: string; jobId: string }>;
    recalcFrom: string;
  }>
> {
  try {
    // Validate inputs
    if (!companyIds?.length && !bankAccountIds?.length) {
      return errorResponse(
        'At least one of companyIds or bankAccountIds must be provided',
      );
    }

    const maxAccounts = options.maxAccounts || DEFAULT_MAX_ACCOUNTS;
    const maxCompanies = options.maxCompanies || DEFAULT_MAX_COMPANIES;
    const onlyMissingBalances = options.onlyMissingBalances || false;

    // Validate company limit
    if (companyIds && companyIds.length > maxCompanies) {
      return errorResponse(
        `Too many companies requested. Maximum is ${maxCompanies}, got ${companyIds.length}`,
      );
    }

    // Build query to get bank accounts
    let query = knexClient('bank_accounts as ba')
      .select('ba.id', 'ba.company_id')
      .where('ba.is_deleted', false);

    // Filter by company IDs if provided
    if (companyIds?.length) {
      // Convert company IDs to UUIDs
      const companyUUIDs = await Promise.all(
        companyIds.map((id) => getCompanyUUID(id)),
      );
      const validUUIDs = companyUUIDs.filter((uuid) => uuid !== null);

      if (validUUIDs.length === 0) {
        return errorResponse('No valid companies found');
      }

      query = query.whereIn('ba.company_id', validUUIDs);
    }

    // Filter by bank account IDs if provided
    if (bankAccountIds?.length) {
      if (bankAccountIds.length > maxAccounts) {
        return errorResponse(
          `Too many bank accounts requested. Maximum is ${maxAccounts}, got ${bankAccountIds.length}`,
        );
      }
      query = query.whereIn('ba.id', bankAccountIds);
    }

    // Filter for accounts with missing balances if requested
    if (onlyMissingBalances) {
      query = query
        .whereNotExists(
          knexClient('bank_account_current_native_balances as b')
            .select(knexClient.raw('1'))
            .whereRaw('b.bank_account_id = ba.id')
            .whereRaw('b.company_id = ba.company_id'),
        )
        .whereExists(
          knexClient('bank_transactions as bt')
            .select(knexClient.raw('1'))
            .whereRaw('bt.bank_account_id = ba.id')
            .where('bt.is_deleted', false),
        );
    }

    const bankAccounts = await query.clone().limit(maxAccounts);
    const totalCountRow = await query
      .clone()
      .clearSelect()
      .clearOrder()
      .count({ count: knexClient.raw('1') })
      .first();
    const totalCount = parseInt(String(totalCountRow?.count ?? 0), 10);
    const accountsSkipped = Math.max(0, totalCount - bankAccounts.length);

    if (bankAccounts.length === 0) {
      return successResponse('No bank accounts found to recalculate', {
        jobsQueued: 0,
        accountsProcessed: 0,
        accountsSkipped,
        companiesAffected: 0,
        limitReached: false,
        jobs: [],
        recalcFrom,
      });
    }

    // Track unique companies
    const companiesAffected = new Set(bankAccounts.map((acc) => acc.company_id))
      .size;

    // Enqueue recalculation for each bank account
    const jobs = [];
    for (const account of bankAccounts) {
      const job = await enqueueBankBalance({
        companyId: account.company_id,
        bankAccountId: account.id,
        recalcFrom,
        triggeredBy: triggeredBy as
          | 'transaction'
          | 'sync'
          | 'csv_upload'
          | 'soft_delete'
          | 'manual',
      });
      jobs.push({
        companyId: account.company_id,
        bankAccountId: account.id,
        jobId: job?.id || '',
      });
    }

    return successResponse('Bank balance recalculation queued', {
      jobsQueued: jobs.length,
      accountsProcessed: bankAccounts.length,
      accountsSkipped,
      companiesAffected,
      limitReached: accountsSkipped > 0,
      jobs,
      recalcFrom,
      recalcTo,
    });
  } catch (error) {
    return errorResponse('Failed to queue bank balance recalculation', error);
  }
}

/**
 * Manually trigger GL balance recalculation for a specific COA
 */
export async function recalculateGLBalance({
  companyId,
  coaId,
  recalcFrom,
  recalcTo,
  triggeredBy,
}: {
  companyId: string;
  coaId: string;
  recalcFrom: string;
  recalcTo?: string;
  triggeredBy: string;
}): Promise<
  ApiResponse<{
    jobId: string;
    coaId: string;
    recalcFrom: string;
    recalcTo?: string;
  }>
> {
  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    // Validate COA exists and belongs to company
    const coa = await knexClient('coa')
      .where('id', coaId)
      .where('company_id', companyUUID)
      .first();

    if (!coa) {
      return errorResponse('COA not found');
    }

    // Enqueue balance recalculation
    const job = await enqueueGLBalance({
      companyId: companyUUID,
      coaId,
      recalcFrom,
      recalcTo,
      triggeredBy: triggeredBy as
        | 'ledger_entry'
        | 'backfill'
        | 'soft_delete'
        | 'manual',
    });

    return successResponse('GL balance recalculation queued', {
      jobId: job?.id || '',
      coaId,
      recalcFrom,
      recalcTo,
    });
  } catch (error) {
    return errorResponse('Failed to queue GL balance recalculation', error);
  }
}

/**
 * Manually trigger bank balance recalculation for a specific bank account
 */
export async function recalculateBankBalance({
  companyId,
  bankAccountId,
  recalcFrom,
  recalcTo,
  triggeredBy,
}: {
  companyId: string;
  bankAccountId: string;
  recalcFrom: string;
  recalcTo?: string;
  triggeredBy: string;
}): Promise<
  ApiResponse<{
    jobId: string;
    bankAccountId: string;
    recalcFrom: string;
    recalcTo?: string;
  }>
> {
  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    // Validate bank account exists and belongs to company
    const bankAccount = await knexClient('bank_accounts')
      .where('id', bankAccountId)
      .where('company_id', companyUUID)
      .first();

    if (!bankAccount) {
      return errorResponse('Bank account not found');
    }

    // Enqueue balance recalculation
    const job = await enqueueBankBalance({
      companyId: companyUUID,
      bankAccountId,
      recalcFrom,
      recalcTo,
      triggeredBy: triggeredBy as
        | 'transaction'
        | 'sync'
        | 'csv_upload'
        | 'soft_delete'
        | 'manual',
    });

    return successResponse('Bank balance recalculation queued', {
      jobId: job?.id || '',
      bankAccountId,
      recalcFrom,
      recalcTo,
    });
  } catch (error) {
    return errorResponse('Failed to queue bank balance recalculation', error);
  }
}

/**
 * Core function to recalculate GL balances with flexible filtering
 * Supports multiple companies, specific COA accounts, and missing balance detection
 */
export async function recalculateGLBalances({
  companyIds,
  coaIds,
  recalcFrom,
  recalcTo,
  triggeredBy,
  options = {},
}: {
  companyIds?: string[];
  coaIds?: string[];
  recalcFrom: string;
  recalcTo?: string;
  triggeredBy: string;
  options?: {
    maxAccounts?: number;
    maxCompanies?: number;
    onlyMissingBalances?: boolean;
  };
}): Promise<
  ApiResponse<{
    jobsQueued: number;
    accountsProcessed: number;
    accountsSkipped: number;
    companiesAffected: number;
    limitReached: boolean;
    jobs: Array<{ companyId: string; coaId: string; jobId: string }>;
    recalcFrom: string;
  }>
> {
  try {
    // Validate inputs
    if (!companyIds?.length && !coaIds?.length) {
      return errorResponse(
        'At least one of companyIds or coaIds must be provided',
      );
    }

    const maxAccounts = options.maxAccounts || DEFAULT_MAX_ACCOUNTS;
    const maxCompanies = options.maxCompanies || DEFAULT_MAX_COMPANIES;
    const onlyMissingBalances = options.onlyMissingBalances || false;

    // Validate company limit
    if (companyIds && companyIds.length > maxCompanies) {
      return errorResponse(
        `Too many companies requested. Maximum is ${maxCompanies}, got ${companyIds.length}`,
      );
    }

    // Build query to get COA accounts
    let query = knexClient('coa')
      .select('coa.id', 'coa.company_id')
      .where('coa.is_deleted', false);

    // Filter by company IDs if provided
    if (companyIds?.length) {
      // Convert company IDs to UUIDs
      const companyUUIDs = await Promise.all(
        companyIds.map((id) => getCompanyUUID(id)),
      );
      const validUUIDs = companyUUIDs.filter((uuid) => uuid !== null);

      if (validUUIDs.length === 0) {
        return errorResponse('No valid companies found');
      }

      query = query.whereIn('coa.company_id', validUUIDs);
    }

    // Filter by COA IDs if provided
    if (coaIds?.length) {
      if (coaIds.length > maxAccounts) {
        return errorResponse(
          `Too many COA accounts requested. Maximum is ${maxAccounts}, got ${coaIds.length}`,
        );
      }
      query = query.whereIn('coa.id', coaIds);
    }

    // Filter for accounts with missing balances if requested
    if (onlyMissingBalances) {
      query = query
        .whereNotExists(
          knexClient('gl_current_balances as gb')
            .select(knexClient.raw('1'))
            .whereRaw('gb.coa_id = coa.id')
            .whereRaw('gb.company_id = coa.company_id'),
        )
        .whereExists(
          knexClient('ledger_entries as le')
            .select(knexClient.raw('1'))
            .whereRaw('le.coa_id = coa.id')
            .where('le.is_deleted', false),
        );
    }

    const coaAccounts = await query.clone().limit(maxAccounts);
    const totalCountRow = await query
      .clone()
      .clearSelect()
      .clearOrder()
      .count({ count: knexClient.raw('1') })
      .first();
    const totalCount = parseInt(String(totalCountRow?.count ?? 0), 10);
    const accountsSkipped = Math.max(0, totalCount - coaAccounts.length);

    if (coaAccounts.length === 0) {
      return successResponse('No COA accounts found to recalculate', {
        jobsQueued: 0,
        accountsProcessed: 0,
        accountsSkipped,
        companiesAffected: 0,
        limitReached: false,
        jobs: [],
        recalcFrom,
      });
    }

    // Track unique companies
    const companiesAffected = new Set(coaAccounts.map((acc) => acc.company_id))
      .size;

    // Enqueue recalculation for each COA
    const jobs = [];
    for (const coa of coaAccounts) {
      const job = await enqueueGLBalance({
        companyId: coa.company_id,
        coaId: coa.id,
        recalcFrom,
        triggeredBy: triggeredBy as
          | 'ledger_entry'
          | 'backfill'
          | 'soft_delete'
          | 'manual',
      });
      jobs.push({
        companyId: coa.company_id,
        coaId: coa.id,
        jobId: job?.id || '',
      });
    }

    return successResponse('GL balance recalculation queued', {
      jobsQueued: jobs.length,
      accountsProcessed: coaAccounts.length,
      accountsSkipped,
      companiesAffected,
      limitReached: accountsSkipped > 0,
      jobs,
      recalcFrom,
      recalcTo,
    });
  } catch (error) {
    return errorResponse('Failed to queue GL balance recalculation', error);
  }
}

/**
 * Trigger recalculation for all GL accounts in a single company
 * Wrapper function for backwards compatibility
 */
export async function recalculateAllGLBalances({
  companyId,
  recalcFrom,
  recalcTo,
  triggeredBy,
}: {
  companyId: string;
  recalcFrom: string;
  recalcTo?: string;
  triggeredBy: string;
}): Promise<
  ApiResponse<{
    jobsQueued: number;
    jobs: Array<{ coaId: string; jobId: string }>;
    recalcFrom: string;
    recalcTo?: string;
  }>
> {
  const result = await recalculateGLBalances({
    companyIds: [companyId],
    recalcFrom,
    recalcTo,
    triggeredBy,
  });

  if (!result.success || !result.data) {
    return result;
  }

  // Transform response to match old format
  return successResponse(result.message, {
    jobsQueued: result.data.jobsQueued,
    jobs: result.data.jobs.map((job) => ({
      coaId: job.coaId,
      jobId: job.jobId,
    })),
    recalcFrom: result.data.recalcFrom,
  });
}

/**
 * Trigger recalculation for specific COA account IDs
 */
export async function recalculateCoaBalances({
  coaIds,
  recalcFrom,
  triggeredBy,
}: {
  coaIds: string[];
  recalcFrom: string;
  triggeredBy: string;
}): Promise<
  ApiResponse<{
    jobsQueued: number;
    accountsProcessed: number;
    limitReached: boolean;
    jobs: Array<{ companyId: string; coaId: string; jobId: string }>;
    recalcFrom: string;
  }>
> {
  return recalculateGLBalances({
    coaIds,
    recalcFrom,
    triggeredBy,
  });
}

/**
 * Trigger recalculation for all GL accounts across multiple companies
 */
export async function recalculateMultipleCompaniesGLBalances({
  companyIds,
  recalcFrom,
  triggeredBy,
  maxCompanies,
}: {
  companyIds: string[];
  recalcFrom: string;
  triggeredBy: string;
  maxCompanies?: number;
}): Promise<
  ApiResponse<{
    jobsQueued: number;
    accountsProcessed: number;
    companiesAffected: number;
    limitReached: boolean;
    jobs: Array<{ companyId: string; coaId: string; jobId: string }>;
    recalcFrom: string;
  }>
> {
  return recalculateGLBalances({
    companyIds,
    recalcFrom,
    triggeredBy,
    options: { maxCompanies },
  });
}

/**
 * Trigger recalculation only for GL accounts missing balance entries
 * Only processes accounts that have ledger entries but no balance records
 */
export async function recalculateMissingGLBalances({
  companyId,
  recalcFrom,
  triggeredBy,
}: {
  companyId: string;
  recalcFrom: string;
  triggeredBy: string;
}): Promise<
  ApiResponse<{
    jobsQueued: number;
    accountsProcessed: number;
    jobs: Array<{ companyId: string; coaId: string; jobId: string }>;
    recalcFrom: string;
  }>
> {
  return recalculateGLBalances({
    companyIds: [companyId],
    recalcFrom,
    triggeredBy,
    options: { onlyMissingBalances: true },
  });
}

/**
 * Trigger recalculation for all bank accounts in a single company
 * Wrapper function for backwards compatibility
 */
export async function recalculateAllBankBalances({
  companyId,
  recalcFrom,
  recalcTo,
  triggeredBy,
}: {
  companyId: string;
  recalcFrom: string;
  recalcTo?: string;
  triggeredBy: string;
}): Promise<
  ApiResponse<{
    jobsQueued: number;
    jobs: Array<{ bankAccountId: string; jobId: string }>;
    recalcFrom: string;
    recalcTo?: string;
  }>
> {
  const result = await recalculateBankBalances({
    companyIds: [companyId],
    recalcFrom,
    recalcTo,
    triggeredBy,
  });

  if (!result.success || !result.data) {
    return result as any;
  }

  // Transform response to match old format
  return successResponse(result.message, {
    jobsQueued: result.data.jobsQueued,
    jobs: result.data.jobs.map((job) => ({
      bankAccountId: job.bankAccountId,
      jobId: job.jobId,
    })),
    recalcFrom: result.data.recalcFrom,
  });
}

/**
 * Trigger recalculation for specific bank account IDs
 */
export async function recalculateBankAccountBalances({
  bankAccountIds,
  recalcFrom,
  triggeredBy,
}: {
  bankAccountIds: string[];
  recalcFrom: string;
  triggeredBy: string;
}): Promise<
  ApiResponse<{
    jobsQueued: number;
    accountsProcessed: number;
    limitReached: boolean;
    jobs: Array<{ companyId: string; bankAccountId: string; jobId: string }>;
    recalcFrom: string;
  }>
> {
  return recalculateBankBalances({
    bankAccountIds,
    recalcFrom,
    triggeredBy,
  });
}

/**
 * Trigger recalculation for all bank accounts across multiple companies
 */
export async function recalculateMultipleCompaniesBankBalances({
  companyIds,
  recalcFrom,
  triggeredBy,
  maxCompanies,
}: {
  companyIds: string[];
  recalcFrom: string;
  triggeredBy: string;
  maxCompanies?: number;
}): Promise<
  ApiResponse<{
    jobsQueued: number;
    accountsProcessed: number;
    companiesAffected: number;
    limitReached: boolean;
    jobs: Array<{ companyId: string; bankAccountId: string; jobId: string }>;
    recalcFrom: string;
  }>
> {
  return recalculateBankBalances({
    companyIds,
    recalcFrom,
    triggeredBy,
    options: { maxCompanies },
  });
}

/**
 * Trigger recalculation only for bank accounts missing balance entries
 * Only processes accounts that have transactions but no balance records
 */
export async function recalculateMissingBankBalances({
  companyId,
  recalcFrom,
  triggeredBy,
}: {
  companyId: string;
  recalcFrom: string;
  triggeredBy: string;
}): Promise<
  ApiResponse<{
    jobsQueued: number;
    accountsProcessed: number;
    jobs: Array<{ companyId: string; bankAccountId: string; jobId: string }>;
    recalcFrom: string;
  }>
> {
  return recalculateBankBalances({
    companyIds: [companyId],
    recalcFrom,
    triggeredBy,
    options: { onlyMissingBalances: true },
  });
}

// /**
//  * Get current GL balance for a COA account
//  */
// export async function getCurrentGLBalance({
//   companyId,
//   coaId,
// }: {
//   companyId: string;
//   coaId: string;
// }): Promise<ApiResponse<{ coaId: string; balance: string; asOfTime: Date }>> {
//   try {
//     const companyUUID = await getCompanyUUID(companyId);
//     if (!companyUUID) {
//       return errorResponse(`Company not found: ${companyId}`);
//     }

//     const balance = await knexClient('gl_current_balances')
//       .where('company_id', companyUUID)
//       .where('coa_id', coaId)
//       .first();

//     if (!balance) {
//       return errorResponse('GL balance not found');
//     }

//     return successResponse('Current GL balance retrieved', {
//       coaId,
//       balance: balance.reporting_currency_balance,
//       asOfTime: balance.as_of_time,
//     });
//   } catch (error) {
//     return errorResponse('Failed to retrieve GL balance', error);
//   }
// }

// /**
//  * Get GL balance history for a COA account
//  */
// export async function getGLBalanceHistory({
//   companyId,
//   coaId,
//   fromDate,
//   toDate,
//   limit,
// }: {
//   companyId: string;
//   coaId: string;
//   fromDate?: string;
//   toDate?: string;
//   limit: number;
// }): Promise<
//   ApiResponse<{
//     coaId: string;
//     history: Array<{ day: string; balance: string }>;
//     count: number;
//   }>
// > {
//   try {
//     const companyUUID = await getCompanyUUID(companyId);
//     if (!companyUUID) {
//       return errorResponse(`Company not found: ${companyId}`);
//     }

//     let query = knexClient('gl_daily_balance_snapshots')
//       .where('company_id', companyUUID)
//       .where('coa_id', coaId)
//       .orderBy('day', 'desc')
//       .limit(limit);

//     if (fromDate) {
//       query = query.where('day', '>=', fromDate);
//     }
//     if (toDate) {
//       query = query.where('day', '<=', toDate);
//     }

//     const history = await query;

//     return successResponse('GL balance history retrieved', {
//       coaId,
//       history: history.map((h) => ({
//         day: h.day,
//         balance: h.reporting_currency_balance,
//       })),
//       count: history.length,
//     });
//   } catch (error) {
//     return errorResponse('Failed to retrieve GL balance history', error);
//   }
// }

// /**
//  * Get bank balance history for a bank account
//  */
// export async function getBankBalanceHistory({
//   companyId,
//   bankAccountId,
//   fromDate,
//   toDate,
//   limit,
// }: {
//   companyId: string;
//   bankAccountId: string;
//   fromDate?: string;
//   toDate?: string;
//   limit: number;
// }): Promise<
//   ApiResponse<{
//     bankAccountId: string;
//     history: Array<{ day: string; balance: string }>;
//     count: number;
//   }>
// > {
//   try {
//     const companyUUID = await getCompanyUUID(companyId);
//     if (!companyUUID) {
//       return errorResponse(`Company not found: ${companyId}`);
//     }

//     let query = knexClient('bank_account_daily_native_snapshots')
//       .where('company_id', companyUUID)
//       .where('bank_account_id', bankAccountId)
//       .orderBy('day', 'desc')
//       .limit(limit);

//     if (fromDate) {
//       query = query.where('day', '>=', fromDate);
//     }
//     if (toDate) {
//       query = query.where('day', '<=', toDate);
//     }

//     const history = await query;

//     return successResponse('Bank balance history retrieved', {
//       bankAccountId,
//       history: history.map((h) => ({
//         day: h.day,
//         balance: h.native_balance,
//       })),
//       count: history.length,
//     });
//   } catch (error) {
//     return errorResponse('Failed to retrieve bank balance history', error);
//   }
// }
