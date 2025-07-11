import type { Knex } from "knex";
import {
  CoaResponse,
  FetchCoaInput,
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
import { getCompanyUUID } from "../../shared/utils/random.utils";
import {
  camelToSnake,
  removeNullsShallow,
} from "../../shared/utils/formatting.utils";
import { knexClient } from "../../../knexClient";
import { generateCacheKey } from "../../shared/utils/string.utils";
import { redis } from "../../lib/redis";

// TODO: Invalidate coa cache on mutations
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

          "at.id as accountTypeId",
          "at.key as accountTypeKey",
          "at.label as accountTypeLabel",
          "at.report_code as reportCode",

          "ae.id as accountElementId",
          "ae.key as accountElementKey",
          "ae.label as accountElementLabel",

          "pae.id as parentAccountElementId",
          "pae.key as parentAccountElementKey",
          "pae.label as parentAccountElementLabel",

          "cur.id as accountCurrencyId",
          "cur.code as accountCurrencyCode",
          "cur.symbol as accountCurrencySymbol",

          "rc.id as reportingCurrencyId",
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

const coaCacheTTL = 60 * 60 * 2;
function coaCacheKey(companyId: string) {
  return generateCacheKey("coa:v1", companyId);
}

async function invalidateCoaCache(companyId: string) {
  const cacheKey = generateCacheKey("coa:v1", companyId);
  await redis.del(cacheKey);
}
