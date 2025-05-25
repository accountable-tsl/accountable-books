import type { Knex } from "knex";
import { newCoa, NewCoa } from "./coa.types";
import { ApiResponse } from "../../core/types/api.types";
import {
  AppError,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { DEFAULT_ACCOUNT_TYPE_IDS, mustHaveAccounts } from "./coa.constants";
import { accountTypeIds } from "../../shared/constants/account.constants";
import { isProd } from "../../config/env";

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
  trx: Knex,
  companyId: string,
  userId: string,
  currencyId: string
): Promise<ApiResponse> => {
  const defaultAccounts: NewCoa[] = mustHaveAccounts.map((acc) => {
    return {
      ...acc,
      company_id: companyId,
      created_by_id: userId,
      currency_id: currencyId,
      locked: true,
      source: "template",
    };
  });

  const existingLockedAccounts = await trx("coa")
    .where({
      company_id: companyId,
      locked: true,
    })
    .whereIn("account_type_id", Object.values(DEFAULT_ACCOUNT_TYPE_IDS))
    .select("account_type_id");

  const existingAccountTypeIds = new Set(
    existingLockedAccounts.map((acc) => acc.account_type_id)
  );

  const accountsToCreate = defaultAccounts.filter(
    (acc) => !existingAccountTypeIds.has(acc.account_type_id)
  );

  if (!accountsToCreate.length)
    return successResponse("No accounts to create", null);

  const validatedAccounts = newCoa.array().safeParse(accountsToCreate);
  if (!validatedAccounts.success) {
    throw new AppError(
      "Failed to validate default accounts",
      validatedAccounts.error.flatten()
    );
  }
  let inserted;
  if (validatedAccounts.success) {
    inserted = await trx("coa").insert(validatedAccounts.data).returning("*");
  }

  if (!inserted || inserted.length === 0) {
    return errorResponse("Failed to insert default chart of accounts records");
  }
  return successResponse("Must-have accounts successfully inserted", inserted);
};
