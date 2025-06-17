import type { Knex } from "knex";
import {
  newCoa,
  NewCoa,
  newCoaInput,
  NewCoaInput,
  NewCoaInputCamel,
} from "./coa.types";
import { ApiResponse } from "../../core/types/api.types";
import {
  AppError,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { DEFAULT_ACCOUNT_TYPE_IDS, mustHaveAccounts } from "./coa.constants";
import { accountTypeIds } from "../../shared/constants/account.constants";
import Decimal from "decimal.js";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import { hasAccessToCompany } from "../userCompanyRole/userCompanyRole.model";
import { camelToSnake } from "../../shared/utils/formatting.utils";
import { knexClient } from "../../../knexClient";

export const createCoa = async ({
  companyId,
  userId,
  input,
  trx,
}: {
  companyId: string;
  userId: string;
  input: (NewCoaInputCamel | NewCoaInput)[];
  trx?: Knex.Transaction;
}): Promise<ApiResponse> => {
  const knexInstance = trx || knexClient;
  // Validate input
  const snakeCasedInput = camelToSnake(input);
  const validatedInput = newCoaInput.array().safeParse(snakeCasedInput);

  if (!validatedInput.success) {
    return errorResponse(
      "Invalid input provided",
      validatedInput.error.flatten()
    );
  }

  if (validatedInput.data.length === 0) {
    return errorResponse("No data provided for creating chart of accounts");
  }

  // Get actual company UUID
  const companyUUID = await getCompanyUUID(companyId);
  if (!companyUUID) {
    return errorResponse("Invalid company ID");
  }

  // Get company reporting currency which serves as account currency
  const company = await knexInstance("companies")
    .select("reporting_currency_id")
    .where("id", companyUUID)
    .first();

  if (!company || !company.reporting_currency_id) {
    return errorResponse("Unable to retrieve reporting currency");
  }

  // Check that user has access to company
  const hasAccess = await hasAccessToCompany({
    userId,
    companyId: companyUUID,
  });
  if (!hasAccess.success || !hasAccess.data?.hasAccess) {
    return errorResponse(hasAccess.message || "Unauthorized");
  }

  const typeIds = new Set<string>();
  const typeKeys = new Set<string>();
  const typeLabels = new Set<string>();

  for (const item of validatedInput.data) {
    if (item.account_type_id) typeIds.add(item.account_type_id);
    if (item.account_type_key) typeKeys.add(item.account_type_key);
    if (item.account_type_label) typeLabels.add(item.account_type_label);
  }

  // Build query dynamically to avoid empty whereIn arrays
  let rawTypes: { id: string; key: string; label: string }[] = [];

  if (typeIds.size > 0 || typeKeys.size > 0 || typeLabels.size > 0) {
    rawTypes = await knexInstance("account_types")
      .select("id", "key", "label")
      .where((builder) => {
        if (typeIds.size > 0) {
          builder.whereIn("id", Array.from(typeIds));
        }
        if (typeKeys.size > 0) {
          builder.orWhereIn("key", Array.from(typeKeys));
        }
        if (typeLabels.size > 0) {
          builder.orWhereIn("label", Array.from(typeLabels));
        }
      });
  }

  const typeMap = new Map<string, string>();
  for (const t of rawTypes) {
    if (t.id) typeMap.set(t.id, t.id);
    if (t.key) typeMap.set(t.key, t.id);
    if (t.label) typeMap.set(t.label, t.id);
  }

  const toInsert: NewCoa[] = [];

  for (const coa of validatedInput.data) {
    let resolvedTypeId =
      typeMap.get(coa.account_type_id || "") ||
      typeMap.get(coa.account_type_key || "") ||
      typeMap.get(coa.account_type_label || "");

    if (!resolvedTypeId) {
      return errorResponse(`Invalid or unknown account type for "${coa.name}"`);
    }

    const {
      account_type_key,
      account_type_label,
      account_type_id,
      ...validCoaFields
    } = coa;

    toInsert.push({
      ...validCoaFields,
      account_type_id: resolvedTypeId,
      currency_id: company?.reporting_currency_id,
      company_id: companyUUID,
      created_by_id: userId,
      updated_by_id: userId,
    });
  }

  const executeWithTransaction = async (tx: Knex.Transaction) => {
    const inserted = await tx("coa").insert(toInsert).returning("*");
    return inserted;
  };
  try {
    const insertedRecords = trx
      ? await executeWithTransaction(trx)
      : await knexInstance.transaction(executeWithTransaction);

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
