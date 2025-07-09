import type { Knex } from "knex";
import { knexClient } from "../../../../knexClient";
import { AppError } from "../../../shared/utils/response.utils";

export async function resolveBankFromMonoDetails({
  providerId,
  institutionName,
  bankCode,
  institutionType,
  trx,
}: {
  providerId: string;
  institutionName: string;
  bankCode: string;
  institutionType: string;
  trx?: Knex.Transaction;
}): Promise<{ bankId: string }> {
  const knex = trx || knexClient;

  const bankMapping = await knex("bank_provider_mappings")
    .where({ provider_id: providerId })
    .andWhereRaw("LOWER(raw_provider_data->>'name') LIKE LOWER(?)", [
      `%${institutionName}%`,
    ])
    .andWhereRaw("raw_provider_data->>'bank_code' = ?", [bankCode])
    .andWhereRaw("data->>'type' = ?", [institutionType])
    .first();

  if (!bankMapping?.bank_id) {
    throw new AppError("Bank resolution failed", {
      providerId,
      institutionName,
      bankCode,
      institutionType,
    });
  }

  return { bankId: bankMapping.bank_id };
}
