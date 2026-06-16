import type { Knex } from 'knex';
import { formatInTimeZone } from 'date-fns-tz';
import { Decimal } from 'decimal.js';
import { z } from 'zod';

import { knexClient as knex, knexClient } from '../../db/knexClient.js';
import { isValidYMD, toYMD } from '../../shared/utils/date.utils.js';
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

import type { ApiResponse } from '../../core/types/api.types.js';
import type { FiscalPeriodType } from '../reporting/fiscal-calendar/fiscal-calendar.types.js';

// Validation schemas
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');

const TRIAL_BALANCE_GL_SCALE = 3;

type TrialBalanceFreshness = 'fresh' | 'stale' | 'missing';

type TrialBalanceAccountFreshness = TrialBalanceFreshness;

type TrialBalanceResponse = {
  period: {
    kind: 'fiscal_period' | 'date_range';
    fiscalYear: number | null;
    periodNumber: number | null;
    periodType: FiscalPeriodType | 'custom';
    startDate: string;
    endDate: string;
    requestedStartDate: string;
    requestedEndDate: string;
    effectiveStartDate: string;
    effectiveEndDate: string;
    status: 'open' | 'closed' | 'locked' | 'mixed';
    defaulted: boolean;
    isFutureRange: boolean;
    isOpenRange: boolean;
  };
  currency: {
    code: string;
    minorUnit: number;
  };
  accounts: Array<{
    coaId: string;
    accountCode: string | null;
    accountName: string;
    accountTypeKey: string;
    accountTypeLabel: string;
    financialStatementKey: string;
    normalSide: 'debit' | 'credit';
    signedOpeningBalance: string;
    openingDebit: string;
    openingCredit: string;
    periodDebit: string;
    periodCredit: string;
    signedClosingBalance: string;
    closingDebit: string;
    closingCredit: string;
    transactionCount: number;
    calculatedAt: string | null;
    hasPeriodBalance: boolean;
    freshness: TrialBalanceAccountFreshness;
  }>;
  totals: {
    openingDebit: string;
    openingCredit: string;
    periodDebit: string;
    periodCredit: string;
    closingDebit: string;
    closingCredit: string;
  };
  checks: {
    opening: { balanced: boolean; difference: string };
    movement: { balanced: boolean; difference: string };
    closing: { balanced: boolean; difference: string };
  };
  freshness: {
    status: TrialBalanceFreshness;
    calculatedAtMin: string | null;
    calculatedAtMax: string | null;
    missingCoaIds: string[];
    staleCoaIds: string[];
    generatedAt: string;
  };
};

type TrialBalancePeriodRow = {
  fiscal_year: number;
  period_number: number;
  period_type: FiscalPeriodType;
  start_date: string | Date;
  end_date: string | Date;
  status: 'open' | 'closed' | 'locked';
};

type TrialBalanceCompanyContext = {
  id: string;
  default_timezone: string;
  currency_code: string;
  minor_unit: number;
};

type TrialBalanceCoaRow = {
  coa_id: string;
  account_code: string | null;
  account_name: string;
  is_active: boolean;
  is_deleted: boolean;
  account_type_key: string;
  account_type_label: string;
  normal_side: 'debit' | 'credit';
  financial_statement_key: string;
};

type TrialBalancePeriodBalanceRow = {
  coa_id: string;
  opening_balance: string | number;
  period_debits: string | number;
  period_credits: string | number;
  closing_balance: string | number;
  transaction_count: number;
  calculated_at: Date | string;
};

type TrialBalanceActivityRow = {
  coa_id: string;
  posted_entry_count: string | number;
  latest_balance_impact_at: Date | string | null;
};

type TrialBalancePriorSnapshotRow = {
  coa_id: string;
  day: string | Date;
  closing_balance: string | number;
  calculated_at: Date | string;
};

type TrialBalanceRangeMovementRow = {
  coa_id: string;
  period_debits: string | number;
  period_credits: string | number;
  net_movement: string | number;
  transaction_count: string | number;
  latest_balance_impact_at: Date | string | null;
};

type TrialBalancePriorActivityRow = {
  coa_id: string;
  posted_entry_count: string | number;
  latest_balance_impact_at: Date | string | null;
};

type RefreshTrialBalanceResponse = {
  period: TrialBalanceResponse['period'];
  freshnessBeforeRefresh: TrialBalanceResponse['freshness'];
  accountsTargeted: number;
  jobsQueued: number;
  jobs: Array<{
    coaId: string;
    jobId: string;
    recalcFrom: string;
  }>;
};

const TRIAL_BALANCE_EXCLUDED_OPERATIONAL_SOURCES = ['annual_close'];

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
    asOfDate: string;
    calculatedAt: Date;
  }>
> {
  try {
    const companyUUID = await getCompanyUUID(companyId, trx);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    const result = await (trx || knexClient)('gl_current_balances')
      .select('reporting_currency_balance', 'as_of_date', 'calculated_at')
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
      asOfDate: result.as_of_date,
      calculatedAt: result.calculated_at,
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
      asOfDate: string;
      calculatedAt: Date;
    }[]
  >
> {
  try {
    const companyUUID = await getCompanyUUID(companyId, trx);
    if (!companyUUID) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    const query = (trx || knexClient)('gl_current_balances as glb')
      .select(
        'glb.coa_id',
        'glb.reporting_currency_balance',
        'glb.as_of_date',
        'glb.calculated_at',
        'coa.account_code',
        'coa.account_name',
      )
      .join('coa', 'glb.coa_id', 'coa.id')
      .where({
        'glb.company_id': companyUUID,
        'coa.is_deleted': false,
      })
      .orderBy('coa.account_code');

    if (coaIds?.length) {
      query.whereIn('glb.coa_id', coaIds);
    }

    const rows = await query;

    const balances = rows.map((row: any) => ({
      coaId: row.coa_id,
      accountCode: row.account_code,
      accountName: row.account_name,
      reportingBalance: row.reporting_currency_balance,
      asOfDate: row.as_of_date,
      calculatedAt: row.calculated_at,
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
      .select('gbs.day', 'gbs.closing_balance', 'gbs.transaction_count')
      .where({
        'gbs.company_id': companyUUID,
        'gbs.coa_id': coaId,
      })
      .whereBetween('gbs.day', [fromDate, toDate])
      .orderBy('gbs.day');

    const history = results.map((row: any) => ({
      day: row.day,
      reportingBalance: row.closing_balance,
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
      asOfDate: string | null;
      calculatedAt: Date | null;
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
        'glb.as_of_date as coa_as_of_date',
        'glb.calculated_at as coa_calculated_at',
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
        asOfDate: result.coa_as_of_date ?? null,
        calculatedAt: result.coa_calculated_at ?? null,
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
  periodNumber,
  periodType = 'monthly',
  includeZeroBalances = true,
  asOfDate,
  fromDate,
  toDate,
  trx,
}: {
  companyId: string;
  fiscalYear?: number;
  fiscalPeriod?: number;
  periodNumber?: number;
  periodType?: FiscalPeriodType;
  includeZeroBalances?: boolean;
  asOfDate?: string;
  fromDate?: string;
  toDate?: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<TrialBalanceResponse>> {
  try {
    const queryable = trx || knexClient;
    const company = await getTrialBalanceCompanyContext(companyId, trx);
    if (!company) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    if (fromDate !== undefined || toDate !== undefined) {
      if (!fromDate || !toDate) {
        return errorResponse('fromDate and toDate are required together');
      }

      if (
        fiscalYear !== undefined ||
        fiscalPeriod !== undefined ||
        periodNumber !== undefined
      ) {
        return errorResponse(
          'Date-range trial balance cannot be combined with fiscal period selectors',
        );
      }

      return await getDateRangeTrialBalance({
        company,
        fromDate,
        toDate,
        includeZeroBalances,
        queryable,
      });
    }

    const resolvedPeriodNumber = resolveTrialBalancePeriodNumber({
      fiscalPeriod,
      periodNumber,
    });

    const { period, defaulted } = await resolveTrialBalancePeriod({
      company,
      fiscalYear,
      periodNumber: resolvedPeriodNumber,
      periodType,
      asOfDate,
      trx,
    });

    if (!period) {
      return errorResponse(`Fiscal period not found`);
    }

    const startDate = toYMD(period.start_date);
    const endDate = toYMD(period.end_date);

    const coaRows = await getTrialBalanceCoas({
      companyId: company.id,
      queryable,
    });
    const periodBalanceRows = await getTrialBalancePeriodRows({
      companyId: company.id,
      fiscalYear: period.fiscal_year,
      periodNumber: period.period_number,
      periodType: period.period_type,
      queryable,
    });
    const activityRows = await getTrialBalanceActivityRows({
      companyId: company.id,
      startDate,
      endDate,
      queryable,
    });
    const priorSnapshotRows = await getTrialBalancePriorSnapshots({
      companyId: company.id,
      startDate,
      queryable,
    });
    const fiscalYearStart = await getFiscalYearStartDate({
      companyId: company.id,
      fiscalYear: period.fiscal_year,
      queryable,
    });

    const periodBalanceByCoa = new Map(
      periodBalanceRows.map((row) => [row.coa_id, row]),
    );
    const activityByCoa = new Map(activityRows.map((row) => [row.coa_id, row]));
    const priorSnapshotByCoa = new Map(
      priorSnapshotRows.map((row) => [row.coa_id, row]),
    );
    const coaById = new Map(coaRows.map((row) => [row.coa_id, row]));

    const allCoaIds = new Set<string>();
    for (const coa of coaRows) {
      if (!coa.is_deleted && coa.is_active) allCoaIds.add(coa.coa_id);
    }
    for (const row of periodBalanceRows) allCoaIds.add(row.coa_id);
    for (const row of activityRows) allCoaIds.add(row.coa_id);
    for (const row of priorSnapshotRows) allCoaIds.add(row.coa_id);

    const accounts = Array.from(allCoaIds)
      .map((coaId) => {
        const coa = coaById.get(coaId);
        if (!coa) return null;

        const balance = periodBalanceByCoa.get(coaId);
        const activity = activityByCoa.get(coaId);
        const priorSnapshot = priorSnapshotByCoa.get(coaId);
        const isFiscalYearStart = fiscalYearStart === startDate;
        const expectedOpening = shouldExpectTrialBalanceOpening({
          priorSnapshot,
          isBalanceSheetAccount: coa.financial_statement_key === 'bs',
          isFiscalYearStart,
        });

        const amountSet = getTrialBalanceAmounts(balance);
        const freshness = getTrialBalanceAccountFreshness({
          balance,
          activity,
          priorSnapshot,
          expectedOpening,
        });
        const hasNonZeroValue = hasAnyNonZeroTrialBalanceAmount(amountSet);
        const hasPostedActivity = Number(activity?.posted_entry_count ?? 0) > 0;

        if (
          !includeZeroBalances &&
          !hasNonZeroValue &&
          !hasPostedActivity &&
          freshness === 'fresh'
        ) {
          return null;
        }

        return buildTrialBalanceAccount({
          coa,
          amountSet,
          balance,
          freshness,
          minorUnit: company.minor_unit,
        });
      })
      .filter((account): account is TrialBalanceResponse['accounts'][number] =>
        Boolean(account),
      )
      .sort(compareTrialBalanceAccounts);

    const totals = calculateTrialBalanceTotals(accounts, company.minor_unit);
    const missingCoaIds = accounts
      .filter((account) => account.freshness === 'missing')
      .map((account) => account.coaId);
    const staleCoaIds = accounts
      .filter((account) => account.freshness === 'stale')
      .map((account) => account.coaId);
    const calculatedAtValues = accounts
      .map((account) => account.calculatedAt)
      .filter((value): value is string => Boolean(value))
      .sort();

    const freshnessStatus: TrialBalanceFreshness = missingCoaIds.length
      ? 'missing'
      : staleCoaIds.length
        ? 'stale'
        : 'fresh';

    return successResponse('Trial balance retrieved', {
      period: {
        kind: 'fiscal_period',
        fiscalYear: period.fiscal_year,
        periodNumber: period.period_number,
        periodType: period.period_type,
        startDate,
        endDate,
        requestedStartDate: startDate,
        requestedEndDate: endDate,
        effectiveStartDate: startDate,
        effectiveEndDate: endDate,
        status: period.status,
        defaulted,
        isFutureRange: false,
        isOpenRange: period.status === 'open',
      },
      currency: {
        code: company.currency_code,
        minorUnit: company.minor_unit,
      },
      accounts,
      totals: totals.formatted,
      checks: {
        opening: buildTrialBalanceCheck(
          totals.raw.openingDebit,
          totals.raw.openingCredit,
        ),
        movement: buildTrialBalanceCheck(
          totals.raw.periodDebit,
          totals.raw.periodCredit,
        ),
        closing: buildTrialBalanceCheck(
          totals.raw.closingDebit,
          totals.raw.closingCredit,
        ),
      },
      freshness: {
        status: freshnessStatus,
        calculatedAtMin: calculatedAtValues[0] ?? null,
        calculatedAtMax:
          calculatedAtValues[calculatedAtValues.length - 1] ?? null,
        missingCoaIds,
        staleCoaIds,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return errorResponse('Failed to get trial balance', error);
  }
}

async function getDateRangeTrialBalance({
  company,
  fromDate,
  toDate,
  includeZeroBalances,
  queryable,
}: {
  company: TrialBalanceCompanyContext;
  fromDate: string;
  toDate: string;
  includeZeroBalances: boolean;
  queryable: Knex | Knex.Transaction;
}): Promise<ApiResponse<TrialBalanceResponse>> {
  if (!isValidYMD(fromDate) || !isValidYMD(toDate)) {
    return errorResponse('fromDate and toDate must be real YYYY-MM-DD dates');
  }

  if (fromDate > toDate) {
    return errorResponse('fromDate must be on or before toDate');
  }

  const companyToday = formatInTimeZone(
    new Date(),
    company.default_timezone,
    'yyyy-MM-dd',
  );
  const effectiveEndDate = toDate > companyToday ? companyToday : toDate;
  if (fromDate > effectiveEndDate) {
    return errorResponse(
      'Date range starts after the current data-through date',
    );
  }

  const coaRows = await getTrialBalanceCoas({
    companyId: company.id,
    queryable,
  });
  const movementRows = await getTrialBalanceRangeMovementRows({
    companyId: company.id,
    startDate: fromDate,
    endDate: effectiveEndDate,
    queryable,
  });
  const priorSnapshotRows = await getTrialBalancePriorSnapshots({
    companyId: company.id,
    startDate: fromDate,
    queryable,
  });
  const priorActivityRows = await getTrialBalancePriorActivityRows({
    companyId: company.id,
    startDate: fromDate,
    queryable,
  });
  const rangeStatus = await getTrialBalanceRangeStatus({
    companyId: company.id,
    startDate: fromDate,
    endDate: effectiveEndDate,
    queryable,
  });
  const fiscalYearStart = await getFiscalYearStartForDate({
    companyId: company.id,
    date: fromDate,
    queryable,
  });

  const movementByCoa = new Map(movementRows.map((row) => [row.coa_id, row]));
  const priorSnapshotByCoa = new Map(
    priorSnapshotRows.map((row) => [row.coa_id, row]),
  );
  const priorActivityByCoa = new Map(
    priorActivityRows.map((row) => [row.coa_id, row]),
  );
  const coaById = new Map(coaRows.map((row) => [row.coa_id, row]));

  const allCoaIds = new Set<string>();
  for (const coa of coaRows) {
    if (!coa.is_deleted && coa.is_active) allCoaIds.add(coa.coa_id);
  }
  for (const row of movementRows) allCoaIds.add(row.coa_id);
  for (const row of priorSnapshotRows) allCoaIds.add(row.coa_id);
  for (const row of priorActivityRows) allCoaIds.add(row.coa_id);

  const accounts = Array.from(allCoaIds)
    .map((coaId) => {
      const coa = coaById.get(coaId);
      if (!coa) return null;

      const movement = movementByCoa.get(coaId);
      const priorSnapshot = priorSnapshotByCoa.get(coaId);
      const priorActivity = priorActivityByCoa.get(coaId);
      const isBalanceSheetAccount = coa.financial_statement_key === 'bs';
      const canUseTemporaryOpening =
        !isBalanceSheetAccount &&
        fiscalYearStart !== null &&
        fiscalYearStart < fromDate &&
        priorSnapshot !== undefined &&
        toYMD(priorSnapshot.day) >= fiscalYearStart;

      const opening =
        isBalanceSheetAccount || canUseTemporaryOpening
          ? toDecimal(priorSnapshot?.closing_balance ?? 0)
          : new Decimal(0);
      const periodDebit = toDecimal(movement?.period_debits ?? 0);
      const periodCredit = toDecimal(movement?.period_credits ?? 0);
      const movementDelta = toDecimal(movement?.net_movement ?? 0);
      const closing = opening.plus(movementDelta);
      const amountSet = {
        opening,
        periodDebit,
        periodCredit,
        closing,
      };
      const transactionCount = Number(movement?.transaction_count ?? 0);
      const freshness = getDateRangeAccountFreshness({
        isBalanceSheetAccount,
        priorSnapshot,
        priorActivity,
      });
      const hasNonZeroValue = hasAnyNonZeroTrialBalanceAmount(amountSet);
      const hasPostedActivity = transactionCount > 0;

      if (
        !includeZeroBalances &&
        !hasNonZeroValue &&
        !hasPostedActivity &&
        freshness === 'fresh'
      ) {
        return null;
      }

      const calculatedAt = latestDateValue([
        priorSnapshot?.calculated_at,
        movement?.latest_balance_impact_at,
      ]);
      const balance =
        hasNonZeroValue || hasPostedActivity || calculatedAt
          ? {
              coa_id: coaId,
              opening_balance: opening.toString(),
              period_debits: periodDebit.toString(),
              period_credits: periodCredit.toString(),
              closing_balance: closing.toString(),
              transaction_count: transactionCount,
              calculated_at: calculatedAt ?? new Date(0).toISOString(),
            }
          : undefined;

      return buildTrialBalanceAccount({
        coa,
        amountSet,
        balance,
        freshness,
        minorUnit: company.minor_unit,
      });
    })
    .filter((account): account is TrialBalanceResponse['accounts'][number] =>
      Boolean(account),
    )
    .sort(compareTrialBalanceAccounts);

  const totals = calculateTrialBalanceTotals(accounts, company.minor_unit);
  const missingCoaIds = accounts
    .filter((account) => account.freshness === 'missing')
    .map((account) => account.coaId);
  const staleCoaIds = accounts
    .filter((account) => account.freshness === 'stale')
    .map((account) => account.coaId);
  const calculatedAtValues = accounts
    .map((account) => account.calculatedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  const freshnessStatus: TrialBalanceFreshness = missingCoaIds.length
    ? 'missing'
    : staleCoaIds.length
      ? 'stale'
      : 'fresh';
  const isFutureRange = toDate > effectiveEndDate;

  return successResponse('Trial balance retrieved', {
    period: {
      kind: 'date_range',
      fiscalYear: null,
      periodNumber: null,
      periodType: 'custom',
      startDate: fromDate,
      endDate: effectiveEndDate,
      requestedStartDate: fromDate,
      requestedEndDate: toDate,
      effectiveStartDate: fromDate,
      effectiveEndDate,
      status: rangeStatus,
      defaulted: false,
      isFutureRange,
      isOpenRange: isFutureRange || rangeStatus !== 'closed',
    },
    currency: {
      code: company.currency_code,
      minorUnit: company.minor_unit,
    },
    accounts,
    totals: totals.formatted,
    checks: {
      opening: buildTrialBalanceCheck(
        totals.raw.openingDebit,
        totals.raw.openingCredit,
      ),
      movement: buildTrialBalanceCheck(
        totals.raw.periodDebit,
        totals.raw.periodCredit,
      ),
      closing: buildTrialBalanceCheck(
        totals.raw.closingDebit,
        totals.raw.closingCredit,
      ),
    },
    freshness: {
      status: freshnessStatus,
      calculatedAtMin: calculatedAtValues[0] ?? null,
      calculatedAtMax:
        calculatedAtValues[calculatedAtValues.length - 1] ?? null,
      missingCoaIds,
      staleCoaIds,
      generatedAt: new Date().toISOString(),
    },
  });
}

export async function refreshTrialBalance({
  companyId,
  fiscalYear,
  fiscalPeriod,
  periodNumber,
  periodType = 'monthly',
  asOfDate,
  fromDate,
  toDate,
  includeFreshAccounts = false,
  trx,
}: {
  companyId: string;
  fiscalYear?: number;
  fiscalPeriod?: number;
  periodNumber?: number;
  periodType?: FiscalPeriodType;
  asOfDate?: string;
  fromDate?: string;
  toDate?: string;
  includeFreshAccounts?: boolean;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<RefreshTrialBalanceResponse>> {
  try {
    const trialBalance = await getTrialBalance({
      companyId,
      fiscalYear,
      fiscalPeriod,
      periodNumber,
      periodType,
      includeZeroBalances: true,
      asOfDate,
      fromDate,
      toDate,
      trx,
    });

    if (!trialBalance.success || !trialBalance.data) {
      return errorResponse(trialBalance.message, trialBalance.error);
    }

    const company = await getTrialBalanceCompanyContext(companyId, trx);
    if (!company) {
      return errorResponse(`Company not found: ${companyId}`);
    }

    const targetAccounts = trialBalance.data.accounts.filter((account) =>
      includeFreshAccounts ? true : account.freshness !== 'fresh',
    );

    if (targetAccounts.length === 0) {
      return successResponse('Trial balance is already fresh', {
        period: trialBalance.data.period,
        freshnessBeforeRefresh: trialBalance.data.freshness,
        accountsTargeted: 0,
        jobsQueued: 0,
        jobs: [],
      });
    }

    const queryable = trx || knexClient;
    const earliestImpactByCoa = await getEarliestBalanceImpactDates({
      companyId: company.id,
      coaIds: targetAccounts.map((account) => account.coaId),
      periodEndDate: trialBalance.data.period.endDate,
      queryable,
    });

    const jobs: RefreshTrialBalanceResponse['jobs'] = [];
    for (const account of targetAccounts) {
      const recalcFrom =
        earliestImpactByCoa.get(account.coaId) ??
        trialBalance.data.period.startDate;
      const job = await enqueueGLBalance({
        companyId: company.id,
        coaId: account.coaId,
        recalcFrom,
        triggeredBy: 'manual',
      });

      if (job?.id) {
        jobs.push({
          coaId: account.coaId,
          jobId: job.id,
          recalcFrom,
        });
      }
    }

    return successResponse('Trial balance refresh queued', {
      period: trialBalance.data.period,
      freshnessBeforeRefresh: trialBalance.data.freshness,
      accountsTargeted: targetAccounts.length,
      jobsQueued: jobs.length,
      jobs,
    });
  } catch (error) {
    return errorResponse('Failed to refresh trial balance', error);
  }
}

function resolveTrialBalancePeriodNumber({
  fiscalPeriod,
  periodNumber,
}: {
  fiscalPeriod?: number;
  periodNumber?: number;
}): number | undefined {
  if (
    fiscalPeriod !== undefined &&
    periodNumber !== undefined &&
    fiscalPeriod !== periodNumber
  ) {
    throw new Error('fiscalPeriod and periodNumber cannot conflict');
  }

  return periodNumber ?? fiscalPeriod;
}

async function getTrialBalanceCompanyContext(
  companyId: string,
  trx?: Knex.Transaction,
): Promise<TrialBalanceCompanyContext | null> {
  const queryable = trx || knexClient;
  const companyUUID = await getCompanyUUID(companyId, trx);
  if (!companyUUID) return null;

  const row = await queryable('companies as c')
    .join('currencies as cur', 'c.reporting_currency_id', 'cur.id')
    .where({ 'c.id': companyUUID, 'c.is_deleted': false })
    .select(
      'c.id',
      'c.default_timezone',
      'cur.code as currency_code',
      'cur.minor_unit',
    )
    .first<TrialBalanceCompanyContext>();

  return row ?? null;
}

async function resolveTrialBalancePeriod({
  company,
  fiscalYear,
  periodNumber,
  periodType,
  asOfDate,
  trx,
}: {
  company: TrialBalanceCompanyContext;
  fiscalYear?: number;
  periodNumber?: number;
  periodType: FiscalPeriodType;
  asOfDate?: string;
  trx?: Knex.Transaction;
}): Promise<{ period: TrialBalancePeriodRow | null; defaulted: boolean }> {
  const queryable = trx || knexClient;

  if (fiscalYear !== undefined || periodNumber !== undefined) {
    if (fiscalYear === undefined || periodNumber === undefined) {
      throw new Error('fiscalYear and periodNumber are required together');
    }

    const period = await queryable('fiscal_calendar')
      .where({
        company_id: company.id,
        fiscal_year: fiscalYear,
        period_number: periodNumber,
        period_type: periodType,
      })
      .select(
        'fiscal_year',
        'period_number',
        'period_type',
        queryable.raw('start_date::text as start_date'),
        queryable.raw('end_date::text as end_date'),
        'status',
      )
      .first<TrialBalancePeriodRow>();

    return { period: period ?? null, defaulted: false };
  }

  const date =
    asOfDate ??
    formatInTimeZone(new Date(), company.default_timezone, 'yyyy-MM-dd');
  if (!isValidYMD(date)) {
    throw new Error('asOfDate must be a real YYYY-MM-DD date');
  }

  const period = await queryable('fiscal_calendar')
    .where({
      company_id: company.id,
      period_type: periodType,
    })
    .where('start_date', '<=', date)
    .where('end_date', '>=', date)
    .select(
      'fiscal_year',
      'period_number',
      'period_type',
      queryable.raw('start_date::text as start_date'),
      queryable.raw('end_date::text as end_date'),
      'status',
    )
    .first<TrialBalancePeriodRow>();

  return { period: period ?? null, defaulted: true };
}

async function getTrialBalanceCoas({
  companyId,
  queryable,
}: {
  companyId: string;
  queryable: Knex | Knex.Transaction;
}): Promise<TrialBalanceCoaRow[]> {
  return await queryable('coa as c')
    .join('account_types as at', 'c.account_type_id', 'at.id')
    .join('account_elements as ae', 'at.account_element_id', 'ae.id')
    .join('financial_statements as fs', 'ae.financial_statement_id', 'fs.id')
    .where('c.company_id', companyId)
    .select(
      'c.id as coa_id',
      'c.code as account_code',
      'c.name as account_name',
      'c.is_active',
      'c.is_deleted',
      'at.key as account_type_key',
      'at.label as account_type_label',
      'ae.default_side as normal_side',
      'fs.key as financial_statement_key',
    );
}

async function getTrialBalancePeriodRows({
  companyId,
  fiscalYear,
  periodNumber,
  periodType,
  queryable,
}: {
  companyId: string;
  fiscalYear: number;
  periodNumber: number;
  periodType: FiscalPeriodType;
  queryable: Knex | Knex.Transaction;
}): Promise<TrialBalancePeriodBalanceRow[]> {
  return await queryable('gl_period_balances')
    .where({
      company_id: companyId,
      fiscal_year: fiscalYear,
      period_number: periodNumber,
      period_type: periodType,
    })
    .select(
      'coa_id',
      'opening_balance',
      'period_debits',
      'period_credits',
      'closing_balance',
      'transaction_count',
      'calculated_at',
    );
}

async function getTrialBalanceActivityRows({
  companyId,
  startDate,
  endDate,
  queryable,
}: {
  companyId: string;
  startDate: string;
  endDate: string;
  queryable: Knex | Knex.Transaction;
}): Promise<TrialBalanceActivityRow[]> {
  return await queryable('ledger_entries as le')
    .join('ledger_transactions as lt', function () {
      this.on('le.ledger_transaction_id', 'lt.id').andOn(
        'le.company_id',
        'lt.company_id',
      );
    })
    .where('le.company_id', companyId)
    .whereBetween('le.fs_date', [startDate, endDate])
    .groupBy('le.coa_id')
    .select('le.coa_id')
    .select(
      queryable.raw(
        "COUNT(*) FILTER (WHERE lt.status = 'posted')::int AS posted_entry_count",
      ),
    )
    .select(
      queryable.raw(
        // Supersession is balance-impacting even though the old entries are
        // preserved. A superseded transaction no longer contributes to active
        // balances, so its superseded_at timestamp must stale prior summaries.
        `MAX(
          GREATEST(
            le.created_at,
            lt.created_at,
            COALESCE(lt.superseded_at, lt.created_at)
          )
        ) AS latest_balance_impact_at`,
      ),
    );
}

async function getTrialBalancePriorSnapshots({
  companyId,
  startDate,
  queryable,
}: {
  companyId: string;
  startDate: string;
  queryable: Knex | Knex.Transaction;
}): Promise<TrialBalancePriorSnapshotRow[]> {
  const result = await queryable.raw<{ rows: TrialBalancePriorSnapshotRow[] }>(
    `
      SELECT DISTINCT ON (coa_id)
        coa_id,
        day,
        closing_balance,
        calculated_at
      FROM gl_daily_balance_snapshots
      WHERE company_id = ?
        AND day < ?::date
      ORDER BY coa_id, day DESC
    `,
    [companyId, startDate],
  );

  return result.rows;
}

async function getTrialBalanceRangeMovementRows({
  companyId,
  startDate,
  endDate,
  queryable,
}: {
  companyId: string;
  startDate: string;
  endDate: string;
  queryable: Knex | Knex.Transaction;
}): Promise<TrialBalanceRangeMovementRow[]> {
  return await queryable('ledger_entries as le')
    .join('ledger_transactions as lt', function () {
      this.on('le.ledger_transaction_id', 'lt.id').andOn(
        'le.company_id',
        'lt.company_id',
      );
    })
    .where('le.company_id', companyId)
    .where('lt.status', 'posted')
    .whereNotIn(
      'lt.transaction_source',
      TRIAL_BALANCE_EXCLUDED_OPERATIONAL_SOURCES,
    )
    .whereBetween('le.fs_date', [startDate, endDate])
    .groupBy('le.coa_id')
    .select('le.coa_id')
    .select(
      queryable.raw(
        `COALESCE(
          SUM(abs(le.amount)) FILTER (WHERE le.transaction_side = 'debit'),
          0
        ) AS period_debits`,
      ),
    )
    .select(
      queryable.raw(
        `COALESCE(
          SUM(abs(le.amount)) FILTER (WHERE le.transaction_side = 'credit'),
          0
        ) AS period_credits`,
      ),
    )
    .select(
      queryable.raw(
        `COALESCE(
          SUM(
            CASE
              WHEN le.transaction_side = 'debit' THEN abs(le.amount)
              ELSE -abs(le.amount)
            END
          ),
          0
        ) AS net_movement`,
      ),
    )
    .select(queryable.raw('COUNT(*)::int AS transaction_count'))
    .select(
      queryable.raw(
        `MAX(
          GREATEST(
            le.created_at,
            lt.created_at,
            COALESCE(lt.superseded_at, lt.created_at)
          )
        ) AS latest_balance_impact_at`,
      ),
    );
}

async function getTrialBalancePriorActivityRows({
  companyId,
  startDate,
  queryable,
}: {
  companyId: string;
  startDate: string;
  queryable: Knex | Knex.Transaction;
}): Promise<TrialBalancePriorActivityRow[]> {
  return await queryable('ledger_entries as le')
    .join('ledger_transactions as lt', function () {
      this.on('le.ledger_transaction_id', 'lt.id').andOn(
        'le.company_id',
        'lt.company_id',
      );
    })
    .where('le.company_id', companyId)
    .where('lt.status', 'posted')
    .whereNotIn(
      'lt.transaction_source',
      TRIAL_BALANCE_EXCLUDED_OPERATIONAL_SOURCES,
    )
    .where('le.fs_date', '<', startDate)
    .groupBy('le.coa_id')
    .select('le.coa_id')
    .select(queryable.raw('COUNT(*)::int AS posted_entry_count'))
    .select(
      queryable.raw(
        `MAX(
          GREATEST(
            le.created_at,
            lt.created_at,
            COALESCE(lt.superseded_at, lt.created_at)
          )
        ) AS latest_balance_impact_at`,
      ),
    );
}

async function getTrialBalanceRangeStatus({
  companyId,
  startDate,
  endDate,
  queryable,
}: {
  companyId: string;
  startDate: string;
  endDate: string;
  queryable: Knex | Knex.Transaction;
}): Promise<TrialBalanceResponse['period']['status']> {
  const rows = await queryable('fiscal_calendar')
    .where({
      company_id: companyId,
      period_type: 'monthly',
    })
    .where('start_date', '<=', endDate)
    .where('end_date', '>=', startDate)
    .distinct<{ status: 'open' | 'closed' | 'locked' }[]>('status');

  if (rows.length === 0) return 'open';
  if (rows.length === 1) return rows[0]!.status;
  return 'mixed';
}

async function getFiscalYearStartDate({
  companyId,
  fiscalYear,
  queryable,
}: {
  companyId: string;
  fiscalYear: number;
  queryable: Knex | Knex.Transaction;
}): Promise<string | null> {
  const yearly = await queryable('fiscal_calendar')
    .where({
      company_id: companyId,
      fiscal_year: fiscalYear,
      period_type: 'yearly',
      period_number: 1,
    })
    .select(queryable.raw('start_date::text as start_date'))
    .first<{ start_date: string | Date }>();

  return yearly ? toYMD(yearly.start_date) : null;
}

async function getFiscalYearStartForDate({
  companyId,
  date,
  queryable,
}: {
  companyId: string;
  date: string;
  queryable: Knex | Knex.Transaction;
}): Promise<string | null> {
  const yearly = await queryable('fiscal_calendar')
    .where({
      company_id: companyId,
      period_type: 'yearly',
      period_number: 1,
    })
    .where('start_date', '<=', date)
    .where('end_date', '>=', date)
    .select(queryable.raw('start_date::text as start_date'))
    .first<{ start_date: string | Date }>();

  return yearly ? toYMD(yearly.start_date) : null;
}

async function getEarliestBalanceImpactDates({
  companyId,
  coaIds,
  periodEndDate,
  queryable,
}: {
  companyId: string;
  coaIds: string[];
  periodEndDate: string;
  queryable: Knex | Knex.Transaction;
}): Promise<Map<string, string>> {
  if (coaIds.length === 0) return new Map();

  const rows = await queryable('ledger_entries as le')
    .join('ledger_transactions as lt', function () {
      this.on('le.ledger_transaction_id', 'lt.id').andOn(
        'le.company_id',
        'lt.company_id',
      );
    })
    .where('le.company_id', companyId)
    .where('lt.status', 'posted')
    .whereIn('le.coa_id', coaIds)
    .where('le.fs_date', '<=', periodEndDate)
    .groupBy('le.coa_id')
    .select('le.coa_id')
    .select<{ coa_id: string; earliest_fs_date: string }[]>(
      queryable.raw('MIN(le.fs_date)::text AS earliest_fs_date'),
    );

  return new Map(rows.map((row) => [row.coa_id, toYMD(row.earliest_fs_date)]));
}

function shouldExpectTrialBalanceOpening({
  priorSnapshot,
  isBalanceSheetAccount,
  isFiscalYearStart,
}: {
  priorSnapshot?: TrialBalancePriorSnapshotRow;
  isBalanceSheetAccount: boolean;
  isFiscalYearStart: boolean;
}): boolean {
  if (!priorSnapshot) return false;
  if (toDecimal(priorSnapshot.closing_balance).isZero()) return false;

  return isBalanceSheetAccount || !isFiscalYearStart;
}

function getTrialBalanceAmounts(balance?: TrialBalancePeriodBalanceRow) {
  return {
    opening: toDecimal(balance?.opening_balance ?? 0),
    periodDebit: toDecimal(balance?.period_debits ?? 0),
    periodCredit: toDecimal(balance?.period_credits ?? 0),
    closing: toDecimal(balance?.closing_balance ?? 0),
  };
}

function getTrialBalanceAccountFreshness({
  balance,
  activity,
  priorSnapshot,
  expectedOpening,
}: {
  balance?: TrialBalancePeriodBalanceRow;
  activity?: TrialBalanceActivityRow;
  priorSnapshot?: TrialBalancePriorSnapshotRow;
  expectedOpening: boolean;
}): TrialBalanceAccountFreshness {
  const postedEntryCount = Number(activity?.posted_entry_count ?? 0);
  if (!balance) {
    return postedEntryCount > 0 || expectedOpening ? 'missing' : 'fresh';
  }

  const calculatedAt = new Date(balance.calculated_at).getTime();
  const latestActivityAt = activity?.latest_balance_impact_at
    ? new Date(activity.latest_balance_impact_at).getTime()
    : null;

  if (latestActivityAt !== null && latestActivityAt > calculatedAt) {
    return 'stale';
  }

  if (expectedOpening && priorSnapshot) {
    const openingCalculatedAt = new Date(priorSnapshot.calculated_at).getTime();
    if (openingCalculatedAt > calculatedAt) return 'stale';
  }

  return 'fresh';
}

function getDateRangeAccountFreshness({
  isBalanceSheetAccount,
  priorSnapshot,
  priorActivity,
}: {
  isBalanceSheetAccount: boolean;
  priorSnapshot?: TrialBalancePriorSnapshotRow;
  priorActivity?: TrialBalancePriorActivityRow;
}): TrialBalanceAccountFreshness {
  if (!isBalanceSheetAccount) return 'fresh';

  const priorEntryCount = Number(priorActivity?.posted_entry_count ?? 0);
  if (priorEntryCount === 0) return 'fresh';
  if (!priorSnapshot) return 'missing';

  const latestPriorImpactAt = priorActivity?.latest_balance_impact_at
    ? new Date(priorActivity.latest_balance_impact_at).getTime()
    : null;
  if (
    latestPriorImpactAt !== null &&
    latestPriorImpactAt > new Date(priorSnapshot.calculated_at).getTime()
  ) {
    return 'stale';
  }

  return 'fresh';
}

function latestDateValue(values: Array<Date | string | null | undefined>) {
  const timestamps = values
    .filter((value): value is Date | string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function hasAnyNonZeroTrialBalanceAmount(
  amountSet: ReturnType<typeof getTrialBalanceAmounts>,
) {
  return (
    !amountSet.opening.isZero() ||
    !amountSet.periodDebit.isZero() ||
    !amountSet.periodCredit.isZero() ||
    !amountSet.closing.isZero()
  );
}

function buildTrialBalanceAccount({
  coa,
  amountSet,
  balance,
  freshness,
  minorUnit,
}: {
  coa: TrialBalanceCoaRow;
  amountSet: ReturnType<typeof getTrialBalanceAmounts>;
  balance?: TrialBalancePeriodBalanceRow;
  freshness: TrialBalanceAccountFreshness;
  minorUnit: number;
}): TrialBalanceResponse['accounts'][number] {
  const opening = splitSignedAmount(amountSet.opening);
  const closing = splitSignedAmount(amountSet.closing);

  return {
    coaId: coa.coa_id,
    accountCode: coa.account_code,
    accountName: coa.account_name,
    accountTypeKey: coa.account_type_key,
    accountTypeLabel: coa.account_type_label,
    financialStatementKey: coa.financial_statement_key,
    normalSide: coa.normal_side,
    signedOpeningBalance: formatInternalAmount(amountSet.opening),
    openingDebit: formatDisplayAmount(opening.debit, minorUnit),
    openingCredit: formatDisplayAmount(opening.credit, minorUnit),
    periodDebit: formatDisplayAmount(amountSet.periodDebit, minorUnit),
    periodCredit: formatDisplayAmount(amountSet.periodCredit, minorUnit),
    signedClosingBalance: formatInternalAmount(amountSet.closing),
    closingDebit: formatDisplayAmount(closing.debit, minorUnit),
    closingCredit: formatDisplayAmount(closing.credit, minorUnit),
    transactionCount: Number(balance?.transaction_count ?? 0),
    calculatedAt: balance
      ? new Date(balance.calculated_at).toISOString()
      : null,
    hasPeriodBalance: Boolean(balance),
    freshness,
  };
}

function compareTrialBalanceAccounts(
  a: TrialBalanceResponse['accounts'][number],
  b: TrialBalanceResponse['accounts'][number],
): number {
  const aCode = a.accountCode ?? '';
  const bCode = b.accountCode ?? '';
  if (aCode !== bCode) return aCode.localeCompare(bCode);
  return a.accountName.localeCompare(b.accountName);
}

function calculateTrialBalanceTotals(
  accounts: TrialBalanceResponse['accounts'],
  minorUnit: number,
) {
  const raw = accounts.reduce(
    (acc, account) => ({
      openingDebit: acc.openingDebit.plus(account.openingDebit),
      openingCredit: acc.openingCredit.plus(account.openingCredit),
      periodDebit: acc.periodDebit.plus(account.periodDebit),
      periodCredit: acc.periodCredit.plus(account.periodCredit),
      closingDebit: acc.closingDebit.plus(account.closingDebit),
      closingCredit: acc.closingCredit.plus(account.closingCredit),
    }),
    {
      openingDebit: new Decimal(0),
      openingCredit: new Decimal(0),
      periodDebit: new Decimal(0),
      periodCredit: new Decimal(0),
      closingDebit: new Decimal(0),
      closingCredit: new Decimal(0),
    },
  );

  return {
    raw,
    formatted: {
      openingDebit: formatDisplayAmount(raw.openingDebit, minorUnit),
      openingCredit: formatDisplayAmount(raw.openingCredit, minorUnit),
      periodDebit: formatDisplayAmount(raw.periodDebit, minorUnit),
      periodCredit: formatDisplayAmount(raw.periodCredit, minorUnit),
      closingDebit: formatDisplayAmount(raw.closingDebit, minorUnit),
      closingCredit: formatDisplayAmount(raw.closingCredit, minorUnit),
    },
  };
}

function buildTrialBalanceCheck(debit: Decimal, credit: Decimal) {
  const difference = debit.minus(credit);
  return {
    balanced: difference.isZero(),
    difference: formatInternalAmount(difference),
  };
}

function splitSignedAmount(value: Decimal): {
  debit: Decimal;
  credit: Decimal;
} {
  if (value.gte(0)) {
    return { debit: value, credit: new Decimal(0) };
  }

  return { debit: new Decimal(0), credit: value.abs() };
}

function toDecimal(value: string | number): Decimal {
  return new Decimal(value || 0).toDecimalPlaces(TRIAL_BALANCE_GL_SCALE);
}

function formatInternalAmount(value: Decimal): string {
  return value
    .toDecimalPlaces(TRIAL_BALANCE_GL_SCALE)
    .toFixed(TRIAL_BALANCE_GL_SCALE);
}

function formatDisplayAmount(
  value: Decimal | string,
  minorUnit: number,
): string {
  return new Decimal(value || 0).toDecimalPlaces(minorUnit).toFixed(minorUnit);
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
        | 'supersession'
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
            .join(
              'ledger_transactions as lt',
              'lt.id',
              'le.ledger_transaction_id',
            )
            .select(knexClient.raw('1'))
            .whereRaw('le.coa_id = coa.id')
            .where('lt.status', 'posted'),
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
          | 'supersession'
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
