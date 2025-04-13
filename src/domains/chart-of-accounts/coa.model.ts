import type { Knex } from "knex";
import { newCoa, NewCoa } from "./coa.types";
import { ApiResponse } from "../../core/types/api.types";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { DEFAULT_ACCOUNT_TYPE_IDS } from "./coa.constants";
import { accountTypeIds } from "../../shared/constants/account.constants";

export const createCoa = async (
  knex: Knex,
  input: NewCoa[]
): Promise<ApiResponse> => {
  const validatedInput = newCoa.array().safeParse(input);

  if (!validatedInput.success) {
    return errorResponse(
      "Invalid input provided",
      validatedInput.error.flatten()
    );
  }

  if (validatedInput.data.length === 0) {
    return errorResponse("No data provided for creating chart of accounts");
  }

  try {
    const insertedRecords = await knex.transaction(async (trx) => {
      const inserted = await trx("coa")
        .insert(validatedInput.data)
        .returning("*");
      return inserted;
    });

    if (!insertedRecords || insertedRecords.length === 0) {
      return errorResponse("Failed to insert any chart of accounts records");
    }
    return successResponse(
      "Chart of accounts created successfully",
      insertedRecords
    );
  } catch (error) {
    return errorResponse("Failed to create chart of accounts", error);
  }
};

export const createDefaultAccounts = async (
  trx: Knex.Transaction,
  companyId: string,
  userId: string,
  currencyId: string
) => {
  const mustHaveAccounts = [
    {
      company_id: companyId,
      created_by_id: userId,
      currency_id: currencyId,
      name: "Trade Receivables",
      description: "Amount due from customers",
      account_type_id:
        accountTypeIds.ca_trade_receivable ||
        DEFAULT_ACCOUNT_TYPE_IDS.tradeReceivables,
      is_active: true,
    },
    {
      company_id: companyId,
      created_by_id: userId,
      currency_id: currencyId,
      name: "Trade Payables",
      description: "Amounts owed to suppliers",
      account_type_id:
        accountTypeIds.cl_trade_payable ||
        DEFAULT_ACCOUNT_TYPE_IDS.tradePayables,
      is_active: true,
    },
    {
      company_id: companyId,
      created_by_id: userId,
      currency_id: currencyId,
      name: "Owner Equity",
      description: "Initial investment or funding",
      account_type_id:
        accountTypeIds.eq_contributed_capital ||
        DEFAULT_ACCOUNT_TYPE_IDS.ownersEquity,
      is_active: true,
    },
  ];

  const validatedMustHaveAcc = newCoa.array().safeParse(mustHaveAccounts);
  if (!validatedMustHaveAcc.success) {
    throw new Error("Failed to validate must-have accounts");
  }

  return trx("coa").insert(validatedMustHaveAcc.data).returning("*");
};
