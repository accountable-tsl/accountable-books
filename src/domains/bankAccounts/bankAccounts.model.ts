import {
  ErrorCode,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { knexClient } from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import {
  BankAccountWithMeta,
  CompanyBankingSnapshot,
  newBankAccountInput,
  NewBankAccountInput,
} from "./bankAccounts.types";
// import Decimal from "decimal.js";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import {
  camelToSnake,
  snakeToCamel,
} from "../../shared/utils/formatting.utils";
import { createCoa } from "../chartOfAccounts/coa.model";
import { coaSource } from "../chartOfAccounts/coa.types";
import { hasAccessToCompany } from "../userCompanyRole/userCompanyRole.model";
import type { Knex } from "knex";

const bankRespFields = [
  "ba.id as id",
  "ba.display_name as displayName",
  "ba.account_type as accountType",
  "ba.account_number as accountNumber",
  "ba.coa_id as coaId",
  "ba.currency_id as currencyId",
  "ba.bank_id as bankId",
  "ba.company_id as companyId",

  "b.display_name as bankName",
  "b.logo_url as bankLogo",

  "cur.name as currencyName",
  "cur.symbol as currencySymbol",
  "cur.code as currencyCode",

  "rc.id as reportingCurrencyId",
  "rc.name as reportingCurrencyName",
  "rc.symbol as reportingCurrencySymbol",
  "rc.code as reportingCurrencyCode",

  "c.reporting_currency_id",

  "coa.name as coaName",
  "coa.code as coaCode",
  "at.label as coaTypeLabel",
  "at.key as coaTypeKey",
];
export const getCompanyBankAccountsWithMetadata = async (
  companyId: string
): Promise<ApiResponse<BankAccountWithMeta[]>> => {
  if (!companyId) return errorResponse("Company ID is required");
  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse("Invalid company ID");
    }

    const result = await knexClient("bank_accounts as ba")
      .select(bankRespFields)
      .where("ba.company_id", companyUUID)
      .andWhere("ba.is_deleted", false)
      .join("banks as b", "ba.bank_id", "b.id")
      .join("currencies as cur", "ba.currency_id", "cur.id")
      .join("companies as c", "ba.company_id", "c.id")
      .join("currencies as rc", "c.reporting_currency_id", "rc.id")
      .join("coa", "ba.coa_id", "coa.id")
      .leftJoin("account_types as at", "coa.account_type_id", "at.id");

    if (!result || result.length === 0) {
      return successResponse("No bank accounts found", []);
    } else {
      return successResponse("Bank accounts fetched successfully", result);
    }
  } catch (error) {
    return errorResponse("Failed to fetch bank accounts", error);
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
  companyId: string
): Promise<ApiResponse<CompanyBankingSnapshot>> {
  if (!companyId) return errorResponse("Company ID is required");

  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse("Invalid company ID");
    }
    // We'll build out each part (1. metadata, 2. balances, 3. transaction stats) step-by-step below.
    // TODO: Fetch all bank accounts with relevant metadata
    // TODO: Fetch balances from bank_transactions and ledger_entries
    // TODO: Fetch categorization stats per bank account
    // TODO: Combine and summarize into the final response

    const bankAccountRows = await getCompanyBankAccountsWithMetadata(companyId);
    if (!bankAccountRows.success) {
      return errorResponse("Failed to fetch bank accounts", bankAccountRows);
    }
    if (bankAccountRows.data && bankAccountRows.data.length === 0) {
      return successResponse("No bank accounts found", {
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

    return successResponse("Banking snapshot fetched", {
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
    return errorResponse("Failed to fetch company banking snapshot", err);
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
  trx?: Knex.Transaction;
}): Promise<ApiResponse<BankAccountWithMeta>> {
  const knexInstance = input.trx || knexClient;
  const { data: inputData, userId, companyId } = input;
  if (!companyId) return errorResponse("Company ID is required");
  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse("Invalid company ID");
    }

    const validatedInput = newBankAccountInput.safeParse(
      camelToSnake(inputData)
    );
    if (!validatedInput.success) {
      return errorResponse(
        `Invalid input provided`,
        validatedInput.error.flatten()
      );
    }

    const { data } = validatedInput;

    // Check that user has access to company or is super admin
    const hasAccess = await hasAccessToCompany({
      userId,
      companyId: companyUUID,
    });

    if (!hasAccess.success || !hasAccess.data?.hasAccess) {
      return errorResponse(
        hasAccess.message || "You do not have access to this company"
      );
    }

    // Check if bank and currency ids are valid
    const [bank, currency] = await Promise.all([
      knexInstance("banks").select("id").where("id", data.bank_id).first(),
      knexInstance("currencies")
        .select("id")
        .where("id", data.currency_id)
        .first(),
    ]);

    if (!bank)
      return errorResponse("The selected bank cannot be verified", undefined, {
        code: ErrorCode.NOT_FOUND,
      });
    if (!currency) return errorResponse("Invalid currency");

    // Check that bank account does not already exist
    const existing = await knexInstance("bank_accounts")
      .select("id")
      .where({
        company_id: companyUUID,
        bank_id: data.bank_id,
        account_number: data.account_number,
      })
      .first();

    if (existing) {
      return errorResponse("Bank account already exists");
    }

    // Create chart of account (aka ledger) for the bank account
    const coaInput = {
      code: data.account_code,
      name: data.display_name,
      account_type_key: "ca_bank",
      source: data.source || coaSource.enum.user,
    };

    const existingCoa = await knexInstance("coa")
      .select("id")
      .where({
        company_id: companyUUID,
        name: coaInput.name,
      })
      .first();

    if (existingCoa) {
      return errorResponse(
        `A chart of account with the name "${coaInput.name}" ${coaInput.code ? `and code "${coaInput.code}"` : ""} already exists in this company`,
        undefined,
        { code: ErrorCode.CONFLICT }
      );
    }

    const executeWithTransaction = async (tx: Knex.Transaction) => {
      const coa = await createCoa({
        companyId: companyUUID,
        userId,
        input: [coaInput],
        trx: tx,
      });

      if (!coa.success) {
        return coa;
      }

      const coaId = coa.data?.[0]?.id;
      if (!coaId) {
        return errorResponse("Failed to create coa for bank");
      }

      // Create new bank account
      const [newBankAccount] = await tx("bank_accounts")
        .insert({
          display_name: data.display_name,
          account_name: data.account_name || data.display_name,
          account_type: data.account_type,
          account_number: data.account_number,
          bank_id: data.bank_id,
          currency_id: data.currency_id,
          company_id: companyUUID,
          coa_id: coaId,
          created_by_id: userId,
          updated_by_id: userId,
        })
        .returning("*");

      if (!newBankAccount) {
        return errorResponse("Failed to create bank account record");
      }

      const [newBankAccountDetails] = await tx("bank_accounts as ba")
        .select(bankRespFields)
        .where("ba.id", newBankAccount.id)
        .join("banks as b", "ba.bank_id", "b.id")
        .join("currencies as cur", "ba.currency_id", "cur.id")
        .join("companies as c", "ba.company_id", "c.id")
        .join("currencies as rc", "c.reporting_currency_id", "rc.id")
        .join("coa", "ba.coa_id", "coa.id")
        .leftJoin("account_types as at", "coa.account_type_id", "at.id");

      return successResponse(
        "Bank account created successfully",
        snakeToCamel(newBankAccountDetails)
      );
    };

    if (input.trx) {
      return await executeWithTransaction(input.trx);
    } else {
      return await knexInstance.transaction(executeWithTransaction);
    }
  } catch (error) {
    return errorResponse(
      "An unexpected error occurred while creating the bank account",
      error
    );
  }
}
