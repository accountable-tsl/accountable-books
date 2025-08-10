import { knexClient } from "../../../knexClient";
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import { ApiResponse } from "../../core/types/api.types";
import { fetchExchangeRate } from "../exchangeRates/exchangeRates.model";
import { categorizationStatus } from "../../core/types/core";
import type { Knex } from "knex";
import {
  CoaBalance,
  CoaBalanceOptions,
  BankBalance,
  GetBankAccountBalancesOptions,
} from "./balances.types";

/**
 * Fetches balances for one or more COA (Chart of Accounts) accounts owned by a company.
 *
 * By default, only active accounts are included. You can customize the result using the following options:
 *
 * @param companyId         – an external identifier (shortCode or UUID) for the company
 * @param options.onlyActive - If true (default), includes only active accounts. Set to false to include all accounts.
 * @param options.coaIds - An optional list of specific COA account IDs to fetch balances for.
 *                         All specified accounts must belong to the company; otherwise, an error is returned.
 * @param options.accountTypeIdsOrKeys – include only COAs whose account_type.id or account_type.key is in this list
 * @param options.excludeAccountTypeIdsOrKeys – exclude COAs whose account_type.id or key is in this list
 * @param options.includeSourceAmount – if true, also returns a `nativeBalance` (sum of `source_amount`)
 * Returns a map of COA account IDs to their respective balances.
 * @returns ApiResponse<{ [coaId: string]: CoaBalance }>
 */
export async function getCompanyCoaBalances(
  companyId: string,
  options: CoaBalanceOptions = {}
): Promise<ApiResponse<Record<string, CoaBalance>>> {
  if (!companyId?.trim()) {
    return errorResponse("Company ID is required");
  }

  const {
    onlyActive = true,
    coaIds = [],
    accountTypeIdsOrKeys = [],
    includeSourceAmount = false,
    excludeAccountTypeIdsOrKeys = [],
  } = options;

  // Validate conflicting filters
  if (
    accountTypeIdsOrKeys.length > 0 &&
    excludeAccountTypeIdsOrKeys.length > 0
  ) {
    const hasOverlap = accountTypeIdsOrKeys.some((id) =>
      excludeAccountTypeIdsOrKeys.includes(id)
    );
    if (hasOverlap) {
      return errorResponse("Cannot include and exclude the same account type");
    }
  }

  try {
    // Get the company's UUID
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse("Invalid company ID");
    }

    // If specific COA IDs are provided, verify they belong to the company
    let validatedCoaIds: string[] | undefined = undefined;

    if (coaIds.length > 0) {
      const uniqueIds = [...new Set(coaIds)];

      const ownedCoaIds = await knexClient("coa")
        .whereIn("id", uniqueIds)
        .andWhere("company_id", companyUUID)
        .pluck("id");

      if (ownedCoaIds.length !== uniqueIds.length) {
        const missingIds = uniqueIds.filter((id) => !ownedCoaIds.includes(id));
        return errorResponse(
          `Some COA accounts could not be validated: ${missingIds.join(", ")}`
        );
      }

      // Replace input with validated ids
      validatedCoaIds = ownedCoaIds;
    }

    // Build a base query to calculate account balances.
    // This query:
    // - Gets all non-deleted ledger entries for a specific company
    // - Joins with the chart of accounts (COA) to get account info
    // - Only includes active accounts (not deleted)
    // - Groups by account ID (coa_id) to get one row per account
    // - For each account, returns:
    //   - The account ID (coa_id)
    //   - The sum of all amounts as "reporting balance"
    const query = knexClient("ledger_entries as le")
      .join("coa", "le.coa_id", "coa.id")
      .where({
        "le.is_deleted": false,
        "le.company_id": companyUUID,

        "coa.is_deleted": false,
        "coa.company_id": companyUUID,
      })
      .groupBy("le.coa_id")
      .select("le.coa_id as coaId")
      .max("coa.name as accountName") // Use MAX to get the name without grouping
      .sum("le.amount as reportingBalance");

    // Only if includeSourceAmount is true:
    if (includeSourceAmount) {
      query.sum("le.source_amount as nativeBalance");
    }

    // Only if onlyActive is true and that is true by default:
    if (onlyActive) {
      query.where("coa.is_active", true);
    }

    // Apply COA ID filter if provided
    if (validatedCoaIds?.length) {
      query.whereIn("le.coa_id", validatedCoaIds);
    }

    // Join account types if needed for filtering
    const needsAccountTypeJoin =
      accountTypeIdsOrKeys.length > 0 || excludeAccountTypeIdsOrKeys.length > 0;

    if (needsAccountTypeJoin) {
      query.join("account_types", "coa.account_type_id", "account_types.id");
    }

    // Filter by account types (by name or ID)
    if (accountTypeIdsOrKeys.length > 0) {
      query.where(function () {
        this.whereIn("account_types.id", accountTypeIdsOrKeys).orWhereIn(
          "account_types.key",
          accountTypeIdsOrKeys
        );
      });
    }

    // Exclude specific account types
    if (excludeAccountTypeIdsOrKeys.length > 0) {
      query.whereNot(function () {
        this.whereIn("account_types.id", excludeAccountTypeIdsOrKeys).orWhereIn(
          "account_types.key",
          excludeAccountTypeIdsOrKeys
        );
      });
    }

    // Run the query
    const results = await query;

    // Build a balance map from the results
    const balanceMap: Record<string, CoaBalance> = {};
    for (const result of results) {
      if (!result.coaId) {
        console.warn("Query returned result without coaId:", result);
        continue;
      }

      balanceMap[result.coaId] = {
        accountName: result.accountName || "Unknown Account",
        reportingBalance: Number(result.reportingBalance) ?? 0,
        nativeBalance: includeSourceAmount
          ? Number(result.nativeBalance ?? 0)
          : undefined,
      };
    }

    return successResponse("COA balances fetched successfully", balanceMap);
  } catch (error) {
    return errorResponse("Error fetching COA balances", error);
  }
}

export async function getCompanyBankLedgerBalances(
  companyId: string
): Promise<ApiResponse<Record<string, CoaBalance>>> {
  return getCompanyCoaBalances(companyId, {
    accountTypeIdsOrKeys: ["ca_bank"],
    includeSourceAmount: true,
  });
}

/**
 * Returns balances for each active bank account in a company.
 *
 * - Balances are derived from BankTransaction amounts (`nativeBalance`)
 * - If the account's currency differs from the company's reporting currency,
 *   exchange rates are used to compute a `reportingBalance`.
 * - Accounts with no transactions are returned with 0 balances.
 *
 * @param companyId - External company identifier (UUID or shortCode)
 * @param options - Optional config (e.g., includeStats)
 * @returns A map of bank account IDs to their balances
 */
export async function getBankAccountBalances(
  knex: Knex.Transaction,
  companyId: string,
  options: GetBankAccountBalancesOptions = {}
): Promise<ApiResponse<Record<string, BankBalance>>> {
  if (!companyId) {
    return errorResponse("Company ID is required");
  }

  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse("Invalid company ID");
    }

    const { includeStats = false, bankAccountIds } = options;

    // Build base query with optional bank account ID filtering
    let transactionQuery = knex("bank_transactions as bt")
      .select("bt.bank_account_id", "bt.amount", "bt.categorization_status")
      .join("bank_accounts as ba", "bt.bank_account_id", "ba.id")
      .where({
        "bt.is_deleted": false,
        "ba.is_deleted": false,
        "ba.company_id": companyUUID,
      });

    // Add bank account ID filtering if specified
    if (bankAccountIds && bankAccountIds.length > 0) {
      transactionQuery = transactionQuery.whereIn(
        "bt.bank_account_id",
        bankAccountIds
      );
    }

    const transactions = await transactionQuery;
    const statusEnum = categorizationStatus.enum;
    const { categorized, auto_categorized, uncategorized } = statusEnum;

    // Aggregate balances and stats
    const groupedTx: Record<string, BankBalance> = {};
    for (const tx of transactions) {
      const bankId = tx.bank_account_id;
      const amount = Number(tx.amount);
      const status = tx.categorization_status;

      if (!groupedTx[bankId]) {
        groupedTx[bankId] = {
          nativeBalance: 0,
          reportingBalance: 0,
          ...(includeStats && {
            transactionCount: 0,
            categorizedCount: 0,
            uncategorizedCount: 0,
            autoCategorizedCount: 0,
          }),
        };
      }

      const group = groupedTx[bankId];
      group.nativeBalance = group.nativeBalance + amount;

      if (includeStats) {
        group.transactionCount!++;

        switch (status) {
          case categorized:
            group.categorizedCount!++;
            break;
          case auto_categorized:
            group.autoCategorizedCount!++;
            break;
          case uncategorized:
            group.uncategorizedCount!++;
            break;
        }
      }
    }

    // Build bank accounts query with same filtering logic
    let bankAccountsQuery = knex("bank_accounts as ba")
      .select(
        "ba.id as bankId",
        "ba.currency_id as currencyId",
        "c.reporting_currency_id as reportingCurrencyId"
      )
      .where("ba.is_deleted", false)
      .andWhere("ba.company_id", companyUUID)
      .join("companies as c", "ba.company_id", "c.id");

    // Apply same filtering to bank accounts query
    if (bankAccountIds && bankAccountIds.length > 0) {
      bankAccountsQuery = bankAccountsQuery.whereIn("ba.id", bankAccountIds);
    }

    const bankAccounts = await bankAccountsQuery;

    const exchangeRateCache = new Map<string, number>();

    // Process currency conversions
    for (const account of bankAccounts) {
      const { bankId, currencyId, reportingCurrencyId } = account;
      if (!groupedTx[bankId]) {
        groupedTx[bankId] = {
          nativeBalance: 0,
          reportingBalance: 0,
          ...(includeStats && {
            transactionCount: 0,
            categorizedCount: 0,
            uncategorizedCount: 0,
            autoCategorizedCount: 0,
          }),
        };
      }
      const group = groupedTx[bankId];

      let reportingBalance = group.nativeBalance;

      // Convert to reporting currency if necessary
      if (
        currencyId &&
        reportingCurrencyId &&
        currencyId !== reportingCurrencyId
      ) {
        const cacheKey = `${currencyId}-${reportingCurrencyId}`;

        if (!exchangeRateCache.has(cacheKey)) {
          try {
            const rateRes = await fetchExchangeRate(
              new Date(),
              currencyId,
              reportingCurrencyId,
              knex
            );

            if (!rateRes.success || !rateRes.data) {
              errorResponse("Exchange rate fetch failed", rateRes.error, {
                code: ErrorCode.GENERIC,
                report: true,
              });
            }

            const data = rateRes.data!;
            const rate = data.rate;

            if (!rateRes.success || !rate) {
              errorResponse("Exchange rate fetch failed", rateRes.error, {
                code: ErrorCode.GENERIC,
                report: true,
              });
            }

            exchangeRateCache.set(cacheKey, Number(rate.toString()));
          } catch (err) {
            // Continue gracefully, fallback to native
            // TODO: Return here instead
            console.warn("Exchange rate fetch failed", cacheKey, err);
            errorResponse(
              "Exchange rate fetch failed",
              { cacheKey, err },
              { code: ErrorCode.GENERIC, report: true }
            );
          }
        }

        const rate = exchangeRateCache.get(cacheKey);
        if (rate) reportingBalance = group.nativeBalance * Number(rate);
      }

      group.reportingBalance = reportingBalance;
    }

    return successResponse("Bank balances fetched successfully", groupedTx);
  } catch (error) {
    return errorResponse("Failed to fetch bank account balances", error);
  }
}

export async function convertAmountToReportingCurrency(
  amount: number,
  currencyId: string,
  reportingCurrencyId: string
): Promise<ApiResponse<number>> {
  try {
    const rate = await fetchExchangeRate(
      new Date(),
      currencyId,
      reportingCurrencyId
    );

    if (!rate.success || !rate.data) {
      return errorResponse(rate.message || "Failed to fetch exchange rate");
    }

    const convertedAmount = Number(amount) * Number(rate.data.rate);
    return successResponse("Amount converted successfully", convertedAmount);
  } catch (error) {
    return errorResponse("Failed to convert amount", error);
  }
}
