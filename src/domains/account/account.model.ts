import type { Knex } from "knex";
import { knexClient } from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import {
  AccountClassificationMetadata,
  AccountElementDTO,
  AccountTypeDTO,
  FinancialStatementDTO,
} from "./account.types";
import { generateCacheKey } from "../../shared/utils/string.utils";
import { redis } from "../../lib/redis";

// TODO: Invalidate cache on mutations
const CACHE_KEY = generateCacheKey("accountClassificationMeta", "v1");
const CACHE_TTL = 60 * 60 * 12; // 12 hours

export async function invalidateAccountClassificationCache(): Promise<void> {
  await redis.del(CACHE_KEY);
}

export async function getAccountClassificationMeta(
  trx?: Knex.Transaction
): Promise<ApiResponse<AccountClassificationMetadata>> {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      const result = JSON.parse(cached) as AccountClassificationMetadata;
      return successResponse(
        "Account classification metadata retrieved from cache",
        result
      );
    }
    const query = async (
      knex: Knex | Knex.Transaction
    ): Promise<AccountClassificationMetadata> => {
      const rawAccountTypes = await knex("account_types as at")
        .innerJoin("account_elements as ae", "at.account_element_id", "ae.id")
        .select(
          "at.id as id",
          "at.key as key",
          "at.label as label",
          "at.description as description",
          "at.report_code as reportCode",
          "ae.id as elementId",
          "ae.key as elementKey"
        )
        .where("at.is_deleted", false);

      const accountTypes: AccountTypeDTO[] = rawAccountTypes.map(
        (r) =>
          ({
            key: r.key,
            label: r.label,
            description: r.description,
            reportCode: r.reportCode,
            elementKey: r.elementKey,
          }) as const satisfies AccountTypeDTO
      );

      const rawElements = await knex("account_elements as ae")
        .innerJoin("account_elements as pae", "ae.parent_id", "pae.id")
        .innerJoin(
          "financial_statements as fs",
          "ae.financial_statement_id",
          "fs.id"
        )
        .select(
          "ae.id as id",
          "ae.key as key",
          "ae.label as label",
          "ae.description as description",
          "ae.default_side as defaultSide",
          "ae.report_code as reportCode",
          "pae.key as parentKey",
          "fs.key as fsKey"
        )
        .where("ae.is_deleted", false);

      const accountElements: AccountElementDTO[] = rawElements.map(
        (r) =>
          ({
            key: r.key,
            label: r.label,
            description: r.description,
            reportCode: r.reportCode,
            defaultSide: r.defaultSide,
            parentElementKey: r.parentKey,
            financialStatementKey: r.fsKey,
          }) satisfies AccountElementDTO
      );

      const rawFS = await knex("financial_statements as fs").select(
        "fs.id as id",
        "fs.key as key",
        "fs.default_label as label",
        "fs.us_gaap_label as usGaapLabel",
        "fs.ifrs_label as ifrsLabel"
      );

      const financialStatements: FinancialStatementDTO[] = rawFS.map(
        (r) =>
          ({
            key: r.key,
            defaultLabel: r.label,
            usGaapLabel: r.usGaapLabel,
            ifrsLabel: r.ifrsLabel,
          }) satisfies FinancialStatementDTO
      );

      return {
        accountTypes,
        accountElements,
        financialStatements,
      };
    };

    const result = trx ? await query(trx) : await knexClient.transaction(query);

    await redis.set(CACHE_KEY, JSON.stringify(result), "EX", CACHE_TTL);

    return successResponse(
      "Account classification metadata successfully retrieved",
      result
    );
  } catch (error) {
    return errorResponse("Failed to retrieve account types", error);
  }
}
