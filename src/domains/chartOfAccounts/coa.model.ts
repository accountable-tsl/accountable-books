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
import { chunkArray, getCompanyUUID } from "../../shared/utils/random.utils";
import {
  camelToSnake,
  removeNullsShallow,
} from "../../shared/utils/formatting.utils";
import { knexClient } from "../../../knexClient";
import { redis } from "../../lib/redis";
import {
  getAccountTypeByKey,
  getFullAccountMeta,
} from "../account/account.registry";

// TODO: Invalidate coa cache on mutations
const coaCacheTTL = 60 * 60 * 2;

const generateCoaCacheKey = ({ companyUUID }: { companyUUID: string }) =>
  `coa:v1:${companyUUID}`;

async function invalidateCoaCache({ companyUUID }: { companyUUID: string }) {
  const cacheKey = generateCoaCacheKey({ companyUUID });
  await redis.del(cacheKey);
}

/**
 * Validate input
 * Get the company's UUID
 * Get the company's reporting currency
 * Get account type ids for all coa records, we receive keys as input
 * All good? insert data into coa
 *
 * Any bad data, return error
 * This should not be used for the creation of bank accounts coa
 * @param param0
 * @returns
 */

export const createCoa = async ({
  data,
  userId,
  companyId,
  trx,
}: {
  data: NewCoaInputCamel[];
  userId: string;
  companyId: string;
  trx?: Knex.Transaction;
}) => {
  // Validate input
  const snakeData = camelToSnake(data);
  const validate = newCoaInput.array().safeParse(snakeData);
  if (!validate.success)
    return errorResponse(`Invalid input`, validate.error?.message);
  const coaRecords = validate.data;

  const query = async (tx: Knex.Transaction) => {
    const errors: string[] = [];
    const recordsToInsert: NewCoa[] = [];

    // Get company details
    const company: { id: string; reportingCurrencyId: string } = await tx(
      "companies"
    )
      .select("id", "reporting_currency_id as reportingCurrencyId")
      .where("short_code", companyId)
      .first();

    if (!company || !company.id || !company.reportingCurrencyId) {
      return errorResponse("Company not found");
    }

    const { id: companyUUID, reportingCurrencyId } = company;

    // Get the account type ids for all coa records, then build insert data
    const accountMeta = await getFullAccountMeta();
    const typeMap = accountMeta.accountTypesByKey;

    const missingTypes = coaRecords
      .filter((record) => !typeMap.get(record.account_type_key))
      .map((record) => record.account_type_key);

    if (missingTypes.length > 0) {
      return errorResponse("Invalid account types found", {
        invalidTypes: [...new Set(missingTypes)],
      });
    }

    for (const record of coaRecords) {
      const type = typeMap.get(record.account_type_key);
      if (!type || !type.id) {
        errors.push(`Account type not found: ${record.account_type_key}`);
        continue;
      }

      recordsToInsert.push({
        name: record.name,
        locked: record.locked,
        source: record.source,
        created_by_id: userId,
        updated_by_id: userId,
        company_id: companyUUID,
        currency_id: reportingCurrencyId,
        account_type_id: type.id,
        ...(record.code ? { code: record.code } : {}),
        ...(record.description ? { description: record.description } : {}),
      });
    }

    if (errors.length)
      return errorResponse("Failed to create chart of accounts", errors);

    // Invalidate coa cache
    // await invalidateCoaCache({ companyUUID });

    // Batch and insert
    const batchedRecords = chunkArray(recordsToInsert, 500); // Split into chunks of 500
    let totalInserted = 0;

    for (const batch of batchedRecords) {
      const res = await tx("coa").insert(batch);
      totalInserted += res.length;
    }

    return successResponse(
      `Successfully created ${totalInserted} account${
        totalInserted > 1 ? "s" : ""
      }`,
      totalInserted
    );
  };

  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);
    if (result.success) {
      await invalidateCoaCache({ companyUUID: result.data.companyUUID });
    }

    return result;
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
  ids: accountIds,
  codes: accountCodes,
  active,
  accountTypeKeys: keys,
  includeDeleted = false,
  trx,
}: FetchCoaInput): Promise<ApiResponse<CoaResponse>> => {
  if (!receivedCompanyId) return errorResponse("Company ID is required");

  const ids = accountIds || [];
  const codes = accountCodes || [];
  const accountTypeKeys = keys || [];

  const coaQuery = async (tx: Knex.Transaction, companyId: string) => {
    return (
      tx("coa")
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
          tx.raw(
            `(EXISTS (SELECT 1 FROM ledger_entries WHERE coa_id = coa.id)) as "hasTransactions"`
          ),
        ])
        .where("coa.company_id", companyId)
        .modify((qb) => {
          if (ids?.length) qb.whereIn("coa.id", ids);
          if (codes?.length) qb.whereIn("coa.code", codes);
          if (active !== undefined) qb.where("coa.is_active", active);
          if (accountTypeKeys?.length) qb.where("at.key", accountTypeKeys);
          if (includeDeleted === false)
            qb.where("coa.is_deleted", includeDeleted);
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
          "CASE WHEN coa.is_deleted = true THEN 2 " +
            "WHEN coa.is_active = false THEN 1 " +
            "ELSE 0 END, " +
            "CASE WHEN at.key = 'ca_bank' THEN 0 ELSE 1 END, " +
            "at.key ASC, " +
            "coa.code ASC"
        )
    );
  };

  const enhanceCoa = (coa: any) => ({
    ...coa,
    canDelete: !coa.isLocked && !coa.hasTransactions && !coa.isDeleted,
  });

  const query = async (trx: Knex.Transaction, companyId: string) => {
    const coa = await coaQuery(trx, companyId);
    return coa.map(enhanceCoa);
  };

  try {
    const companyUUID = await getCompanyUUID(receivedCompanyId);
    if (!companyUUID) return errorResponse("Invalid company identifier");

    const hasFilters =
      ids.length > 0 ||
      codes.length > 0 ||
      active !== undefined ||
      accountTypeKeys.length > 0;

    const cacheKey = generateCoaCacheKey({ companyUUID });

    if (!hasFilters) {
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
    if (!hasFilters && includeDeleted && result.length > 0) {
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

  const cacheKey = generateCoaCacheKey({ companyUUID });
  await invalidateCoaCache({ companyUUID });

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
    tx: Knex.Transaction
  ): Promise<UpdateCoaResponse> => {
    // Fetch existing COA records with account type information
    // Fetch existing COA records with account type information
    const existingCoaRecords = await tx("coa")
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
      await invalidateCoaCache({ companyUUID });
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

      if (u?.code !== undefined) updateData.code = u.code;
      if (u.description !== undefined) updateData.description = u.description;
      if (u?.name !== undefined) updateData.name = u.name;
      if (u.accountTypeId !== undefined)
        updateData.account_type_id = u.accountTypeId;
      if (u.isActive !== undefined) updateData.is_active = u.isActive;
      if (u.isDeleted !== undefined) {
        updateData.is_deleted = u.isDeleted;
        if (u.isDeleted) {
          updateData.is_active = false;
          updateData.deleted_at = now;
        }
      }
      if (operation === "delete") {
        await tx("coa").where({ id: u.id }).delete();
      } else {
        await tx("coa").where({ id: u.id }).update(updateData);
      }
    }
  };

  if (trx) {
    await executeUpdate(trx);
  } else {
    await knexClient.transaction(executeUpdate);
  }
}
