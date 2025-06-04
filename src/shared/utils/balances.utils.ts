import Decimal from "decimal.js";
import { getCompanyUUID } from "./random.utils";
import { errorResponse, successResponse } from "./response.utils";
import { ApiResponse } from "../../core/types/api.types";
import knexClient from "../../../knexClient";

interface CoaBalance {
  accountName: string;
  reportingBalance: Decimal;
  nativeBalance?: Decimal;
}

interface CoaBalanceOptions {
  onlyActive?: boolean;
  coaIds?: string[]; // filter for specific COA accounts
  accountTypeIdsOrKeys?: string[];
  excludeAccountTypeIdsOrKeys?: string[];
  includeSourceAmount?: boolean;
}

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
        reportingBalance: new Decimal(result.reportingBalance ?? 0),
        nativeBalance: includeSourceAmount
          ? new Decimal(result.nativeBalance ?? 0)
          : undefined,
      };
    }

    return successResponse("COA balances fetched successfully", balanceMap);
  } catch (error) {
    return errorResponse("Error fetching COA balances", error);
  }
}

interface BankLedgerBalance {
  reportingBalance: Decimal;
  nativeBalance: Decimal;
}

interface BankLedgerBalanceOptions {
  onlyActive?: boolean;
  coaIds?: string[];
}

/**
 * Fetches balances for all (or some) Bank-type COA accounts owned by a company.
 *
 * For each bank account, returns:
 * - `reportingBalance`: the sum of `amount` (in reporting currency)
 * - `nativeBalance`: the sum of `source_amount` (in the bank account's native currency)
 *
 * By default, includes all bank accounts (active and inactive). You can:
 * - Pass `onlyActive: true` to include only active accounts
 * - Pass `coaIds: string[]` to get balances for specific accounts (ownership validated)
 */
export async function getCompanyBankLedgerBalances(
  companyId: string,
  options: BankLedgerBalanceOptions = { onlyActive: true, coaIds: [] }
): Promise<ApiResponse<Record<string, BankLedgerBalance>>> {
  try {
    // Get the company's UUID
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse("Invalid company ID");
    }

    // If specific COA IDs are provided, verify they belong to the company and are Bank accounts
    if (options.coaIds?.length) {
      const uniqueIds = [...new Set(options.coaIds)];

      const ownedBankCoaIds = await knexClient("coa")
        .join("account_types", "coa.account_type_id", "account_types.id")
        .whereIn("coa.id", uniqueIds)
        .andWhere("coa.company_id", companyUUID)
        .andWhere("account_types.name", "Bank")
        .pluck("coa.id");

      if (ownedBankCoaIds.length !== uniqueIds.length) {
        return errorResponse(
          "One or more COA accounts are invalid or not Bank accounts owned by the company"
        );
      }

      // Replace input with validated ids
      options.coaIds = ownedBankCoaIds;
    }

    // Build a base query to calculate Bank ledger balances.
    // This query:
    // - Filters for non-deleted ledger entries & bank accounts
    // - Joins COA and AccountType to filter only Bank accounts
    // - Filters by the company's UUID
    // - Groups results by coa_id (one row per account)
    // - Returns:
    //   - coa_id
    //   - Sum of amount (as reportingBalance)
    //   - Sum of source_amount (as nativeBalance)
    const query = knexClient("ledger_entries as le")
      .join("coa", "le.coa_id", "coa.id")
      .join("account_types", "coa.account_type_id", "account_types.id")
      .where("le.is_deleted", false)
      .where("coa.company_id", companyUUID)
      .where("coa.is_deleted", false)
      .where("account_types.name", "Bank")
      .groupBy("le.coa_id")
      .select("le.coa_id")
      .sum("le.amount as reportingBalance")
      .sum("le.source_amount as nativeBalance");

    // Apply active account filter if requested
    if (options.onlyActive) {
      query.andWhere("coa.is_active", true);
    }

    // Apply COA ID filter if provided
    if (options.coaIds?.length) {
      query.andWhere("le.coa_id", "in", options.coaIds);
    }

    // Run the query
    const results = await query;

    // Format the result as a map of { coaId: { reportingBalance, nativeBalance } }
    const balanceMap: Record<string, BankLedgerBalance> = {};
    for (const row of results) {
      balanceMap[row.coa_id] = {
        reportingBalance: new Decimal(row.reportingBalance ?? 0),
        nativeBalance: new Decimal(row.nativeBalance ?? 0),
      };
    }

    return successResponse(
      "Bank ledger balances fetched successfully",
      balanceMap
    );
  } catch (error) {
    return errorResponse("Error fetching bank ledger balances", error);
  }
}
