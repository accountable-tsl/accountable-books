import type { Knex } from "knex";
import { knexClient } from "../../../db/knexClient.js";
import { AppError } from "../../../shared/utils/response.utils.js";

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

  const query = knex("bank_provider_mappings")
    .where({ provider_id: providerId })
    .andWhereRaw("LOWER(raw_provider_data->>'institution') LIKE LOWER(?)", [
      `%${institutionName}%`,
    ])
    .andWhereRaw("raw_provider_data->>'type' = ?", [institutionType]);

  if (bankCode == null) {
    query.andWhereRaw("raw_provider_data->>'bank_code' IS NULL");
  } else {
    query.andWhereRaw("raw_provider_data->>'bank_code' = ?", [bankCode]);
  }

  const bankMapping = await query.first();

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
