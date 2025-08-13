import type { Knex } from "knex";
import { knexClient } from "../../../knexClient";
import { getIdentifierType } from "../../shared/utils/formatting.utils";
import { AppError } from "../../shared/utils/response.utils";

type CompanyIdentifierResult = {
  id: string;
  short_code: string;
};

export const getCompanyIdentifiers = async (
  identifier: string,
  trx?: Knex.Transaction
): Promise<CompanyIdentifierResult> => {
  const trimmedId = identifier.trim();
  if (!trimmedId || trimmedId.length > 50)
    throw new AppError("Invalid company identifier");

  const knex = trx || knexClient;

  const idType = getIdentifierType(trimmedId);

  const company = await knex("companies")
    .select("id", "short_code")
    .where(idType === "uuid" ? { id: trimmedId } : { short_code: trimmedId })
    .timeout(1000)
    .first();

  if (!company) throw new AppError("Company not found");

  return { id: company.id, short_code: company.short_code };
};
