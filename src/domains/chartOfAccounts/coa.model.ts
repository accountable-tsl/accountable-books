import type { Knex } from "knex";
import {
  Coa,
  CoaResponse,
  coaUpdateInput,
  CoaUpdateInput,
  CoaUpdateOptions,
  FetchCoaInput,
  newCoa,
  NewCoa,
  newCoaInput,
  NewCoaInput,
  NewCoaInputCamel,
  ResolvedCoaUpdateInput,
  SimpleCoaRecord,
  updateCoaAction,
  UpdateCoaAction,
  UpdateCoaResponse,
} from "./coa.types";
import { ApiResponse } from "../../core/types/api.types";
import {
  AppError,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { DEFAULT_ACCOUNT_TYPE_IDS, mustHaveAccounts } from "./coa.constants";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import {
  camelToSnake,
  removeNullsShallow,
} from "../../shared/utils/formatting.utils";
import { knexClient } from "../../../knexClient";
import { generateCacheKey } from "../../shared/utils/string.utils";
import { redis } from "../../lib/redis";
import { getAccountTypeByKey } from "../account/account.registry";

// TODO: Invalidate coa cache on mutations
const coaCacheTTL = 60 * 60 * 2;
function coaCacheKey(companyUUID: string) {
  return generateCacheKey("coa:v1", companyUUID);
}

async function invalidateCoaCache(companyId: string) {
  const cacheKey = generateCacheKey("coa:v1", companyId);
  await redis.del(cacheKey);
}

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
  const companyUUID = await getCompanyUUID(companyId, trx);
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

    // Invalidate coa cache
    await invalidateCoaCache(companyUUID);
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

export const fetchCompanyCoa = async ({
  companyId: receivedCompanyId,
  id,
  code,
  active,
  accountTypeKey,
  trx,
}: FetchCoaInput): Promise<ApiResponse<CoaResponse>> => {
  if (!receivedCompanyId) return errorResponse("Company ID is required");

  const coaQuery = async (trx: Knex | Knex.Transaction, companyId: string) => {
    return (
      trx("coa")
        .select([
          "coa.id as id",
          "coa.code as code",
          "coa.name as name",
          "coa.description as description",
          "coa.is_active as isActive",
          "coa.locked as isLocked",
          "coa.is_deleted as isDeleted",
          "coa.source as source",

          // "at.id as accountTypeId",
          "at.key as accountTypeKey",
          "at.label as accountTypeLabel",
          "at.report_code as reportCode",

          // "ae.id as accountElementId",
          "ae.key as accountElementKey",
          "ae.label as accountElementLabel",

          // "pae.id as parentAccountElementId",
          "pae.key as parentAccountElementKey",
          "pae.label as parentAccountElementLabel",

          // "cur.id as accountCurrencyId",
          "cur.code as accountCurrencyCode",
          "cur.symbol as accountCurrencySymbol",

          // "rc.id as reportingCurrencyId",
          "rc.code as reportingCurrencyCode",
          "rc.symbol as reportingCurrencySymbol",

          "fs.us_gaap_label as gaapFsLabel",
          "fs.ifrs_label as ifrsFsLabel",

          "c.reporting_framework as reportingFramework",
          trx.raw(
            `(EXISTS (SELECT 1 FROM ledger_entries WHERE coa_id = coa.id)) as "hasTransactions"`
          ),
        ])
        .where("coa.company_id", companyId)
        .modify((qb) => {
          if (id) qb.where("coa.id", id);
          if (code) qb.where("coa.code", code);
          if (active !== undefined) qb.where("coa.is_active", active);
          if (accountTypeKey) qb.where("at.key", accountTypeKey);
        })
        .join("account_types as at", "coa.account_type_id", "at.id")
        .join("account_elements as ae", "at.account_element_id", "ae.id")
        .leftJoin("account_elements as pae", "ae.parent_id", "pae.id")
        .join("currencies as cur", "coa.currency_id", "cur.id")
        .join("companies as c", "coa.company_id", "c.id")
        .join("currencies as rc", "c.reporting_currency_id", "rc.id")
        .join(
          "financial_statements as fs",
          "ae.financial_statement_id",
          "fs.id"
        )
        // Sort by bank accounts first, then by account code for consistent ordering
        .orderByRaw(
          "CASE WHEN at.key = 'ca_bank' THEN 0 ELSE 1 END, at.key ASC, coa.code ASC"
        )
    );
  };

  const enhanceCoa = (coa: any) => ({
    ...coa,
    isArchived: coa.isDeleted,
    canDelete: !coa.isLocked && !coa.hasTransactions && !coa.isDeleted,
  });

  const query = async (trx: Knex | Knex.Transaction, companyId: string) => {
    const coa = await coaQuery(trx, companyId);
    return coa.map(enhanceCoa);
  };

  try {
    const companyUUID = await getCompanyUUID(receivedCompanyId);
    if (!companyUUID) return errorResponse("Invalid company identifier");

    const isUnfiltered =
      !id && !code && active === undefined && !accountTypeKey;
    const cacheKey = coaCacheKey(companyUUID);

    if (isUnfiltered) {
      const cached = await redis.get(cacheKey);

      if (cached) {
        try {
          const parsedData = JSON.parse(cached);
          return successResponse(
            "Successfully retrieved chart of accounts",
            parsedData
          );
        } catch (e) {
          console.warn("Failed to parse cached COA", { cacheKey, error: e });
        }
      }
    }

    const res = trx
      ? await query(trx, companyUUID)
      : await knexClient.transaction((trx) => query(trx, companyUUID));

    const result = removeNullsShallow(res);
    if (isUnfiltered && result.length > 0) {
      await redis.set(cacheKey, JSON.stringify(result), "EX", coaCacheTTL);
    }

    return successResponse("Successfully retrieved chart of accounts", result);
  } catch (error) {
    return errorResponse("Failed to retrieve chart of accounts", error);
  }
};

/**
 * --------------------
 * Update chart of accounts
 * --------------------
 */
export const editCoa = async ({
  updates,
  companyId,
  userId,
  trx,
}: {
  updates: CoaUpdateInput[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}) => {
  return updateChartOfAccounts({
    updates,
    options: {
      companyId,
      updatedById: userId,
      operation: updateCoaAction.enum.edit,
    },
    trx,
  });
};

export const archiveCoa = async ({
  accountIds,
  companyId,
  userId,
  trx,
}: {
  accountIds: string[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}) => {
  const updates = accountIds.map(
    (id) =>
      ({
        id,
        isActive: false,
      }) satisfies CoaUpdateInput
  );

  return updateChartOfAccounts({
    updates,
    options: {
      companyId,
      updatedById: userId,
      operation: updateCoaAction.enum.archive,
    },
    trx,
  });
};

export const unarchiveCoa = async ({
  accountIds,
  companyId,
  userId,
  trx,
}: {
  accountIds: string[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}) => {
  const updates = accountIds.map(
    (id) =>
      ({
        id,
        isActive: true,
      }) satisfies CoaUpdateInput
  );

  return updateChartOfAccounts({
    updates,
    options: {
      companyId,
      updatedById: userId,
      operation: updateCoaAction.enum.unarchive,
    },
    trx,
  });
};

export const deleteCoa = async ({
  accountIds,
  companyId,
  userId,
  trx,
}: {
  accountIds: string[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}) => {
  const updates = accountIds.map(
    (id) =>
      ({
        id,
        isDeleted: true,
      }) satisfies CoaUpdateInput
  );

  return updateChartOfAccounts({
    updates,
    options: {
      companyId,
      updatedById: userId,
      operation: updateCoaAction.enum.delete,
    },
    trx,
  });
};
/**
 * Update chart of accounts
 * Bulk delete is permitted
 * Bulk archive is permitted
 * Bulk unarchive is permitted
 * Bulk data edit is not permitted
 * Locked accounts cannot be archived or deleted
 * For now, coa for bank accounts cannot be archived or deleted (identified by account type key 'ca_bank')
 * Account type cannot be changed for locked accounts, and coa for bank accounts
 * Only editable fields are code, name, description, account type (conditionally)...
 * and is_active, is_deleted, for archiving and deleting as permitted by the above constraints...
 * and updated_by_id, updated_at, deleted_at for logging
 *
 * Update across companies is not permitted, so companyId is required
 * Remember to invalidate cache
 */

const updateChartOfAccounts = async ({
  updates,
  options,
  trx,
}: {
  updates: CoaUpdateInput[];
  options: CoaUpdateOptions;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<UpdateCoaResponse>> => {
  const { companyId, updatedById, operation } = options;
  // Get actual company UUID
  const companyUUID = await getCompanyUUID(companyId, trx);
  if (!companyUUID) {
    return errorResponse("Invalid company ID");
  }

  const cacheKey = coaCacheKey(companyUUID);

  // Validate input
  const validatedInput = coaUpdateInput.array().safeParse(updates);
  if (!validatedInput.success) {
    return errorResponse(
      "Invalid input provided",
      validatedInput.error.flatten()
    );
  }

  if (validatedInput.data.length === 0) {
    return errorResponse("No data provided for updating chart of accounts");
  }

  // Extract IDs for batch query
  const coaIds = validatedInput.data.map((item) => item.id);
  const results: UpdateCoaResponse = {
    updatedAccounts: [],
    errors: [],
  };

  const executeWithTransaction = async (
    trx: Knex.Transaction
  ): Promise<UpdateCoaResponse> => {
    // Fetch existing COA records with account type information
    const existingCoaRecords = await trx("coa")
      .select([
        "coa.id",
        "coa.name",
        "coa.code",
        "coa.description",
        "coa.is_active as isActive",
        "coa.locked as isLocked",
        "coa.is_deleted as isDeleted",
        "coa.account_type_id as accountTypeId",
        "at.key as accountTypeKey",
        "at.label as accountTypeLabel",
      ])
      .join("account_types as at", "coa.account_type_id", "at.id")
      .whereIn("coa.id", coaIds)
      .andWhere("coa.company_id", companyUUID);

    if (existingCoaRecords.length !== coaIds.length) {
      throw new Error(
        "One or more COA records not found or do not belong to this company"
      );
    }

    // Create lookup map for efficiency
    const accountMap = new Map<string, SimpleCoaRecord>();
    existingCoaRecords.forEach((acc) => accountMap.set(acc.id, acc));

    // Validate and process each update
    const validUpdates: Array<CoaUpdateInput> = [];
    for (const item of validatedInput.data) {
      const existing = accountMap.get(item.id);

      if (!existing) {
        results.errors.push({
          id: item.id,
          error: "Account not found or not in specified company",
        });
        continue;
      }

      const newAccountType = item.accountTypeKey
        ? await getAccountTypeByKey(item.accountTypeKey)
        : undefined;

      const { accountTypeKey, ...rest } = item;
      const resolvedItem: ResolvedCoaUpdateInput = {
        ...rest,
        // ...(operation === "archive" ? { isActive: false } : {}),
        // ...(operation === "unarchive" ? { isActive: true } : {}),
        // ...(operation === "delete" ? { isDeleted: true } : {}),
        ...(accountTypeKey && newAccountType
          ? { accountTypeId: newAccountType.id }
          : {}),
      };

      const validation = validateUpdateRules({
        update: resolvedItem,
        existing,
        operation,
      });

      if (!validation.isValid) {
        results.errors.push({ id: item.id, error: validation.error });
        continue;
      }

      validUpdates.push(item);
    }

    // Perform bulk update if there are valid updates
    if (validUpdates.length > 0) {
      await performBulkUpdate({ validUpdates, updatedById, operation, trx });

      results.updatedAccounts = validUpdates.map((u) => ({
        id: u.id,
        name: u.name,
      }));

      // Invalidate cache after successful update
      await invalidateCoaCache(cacheKey);
    }

    return results;
  };

  try {
    const result = trx
      ? await executeWithTransaction(trx)
      : await knexClient.transaction(executeWithTransaction);

    return successResponse("Chart of accounts updated successfully", result);
  } catch (error) {
    return errorResponse("Failed to update chart of accounts", error);
  }
};

function validateUpdateRules({
  update,
  existing,
  operation,
}: {
  update: CoaUpdateInput;
  existing: SimpleCoaRecord;
  operation: UpdateCoaAction;
}): {
  isValid: boolean;
  error: string;
} {
  // Check if account is locked for archive/delete operations
  if (
    existing.isLocked &&
    (operation === "archive" || operation === "delete")
  ) {
    return {
      isValid: false,
      error: "Locked accounts cannot be archived or deleted",
    };
  }

  // Check if bank account for archive/delete operations
  if (
    existing.accountTypeKey === "ca_bank" &&
    (operation === "archive" || operation === "delete")
  ) {
    return {
      isValid: false,
      error: "Bank accounts cannot be archived or deleted",
    };
  }

  // Check account type change restrictions
  const newAccountTypeKey = update?.accountTypeKey;
  const oldAccountTypeKey = existing?.accountTypeKey;

  if (newAccountTypeKey && newAccountTypeKey !== oldAccountTypeKey) {
    if (existing.isLocked) {
      return {
        isValid: false,
        error: "Account type cannot be changed for locked accounts",
      };
    }
    if (oldAccountTypeKey === "ca_bank") {
      return {
        isValid: false,
        error: "Account type cannot be changed for bank accounts",
      };
    }
  }

  return { isValid: true, error: "" };
}

async function performBulkUpdate({
  validUpdates,
  updatedById,
  operation,
  trx,
}: {
  validUpdates: Array<ResolvedCoaUpdateInput>;
  updatedById: string;
  operation: UpdateCoaAction;
  trx?: Knex.Transaction;
}): Promise<void> {
  const now = new Date();

  const executeUpdate = async (tx: Knex.Transaction) => {
    for (const u of validUpdates) {
      const updateData: Partial<Coa> = {
        updated_by_id: updatedById,
        updated_at: now,
      };

      if (u?.code) updateData.code = u.code;
      if (u?.name) updateData.name = u.name;
      if (u?.description) updateData.description = u.description;
      if (u.accountTypeId) updateData.account_type_id = u.accountTypeId;
      if (u.isActive) updateData.is_active = u.isActive;
      if (u.isDeleted !== undefined) {
        updateData.is_deleted = u.isDeleted;
        if (u.isDeleted) {
          updateData.deleted_at = now;
        }
      }

      await tx("coa").where({ id: u.id }).update(updateData);
    }
  };

  if (trx) {
    await executeUpdate(trx);
  } else {
    await knexClient.transaction(executeUpdate);
  }
}
