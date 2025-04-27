import knex from "../../../knexClient";
import { NODE_ENV } from "../../config/env";
import { getIdentifierType } from "./formatting.utils";
import { ensure } from "./response.utils";

export const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const getCompanyUUID = async (identifier: string): Promise<string> => {
  const trimmedId = identifier.trim();
  ensure(trimmedId, "Missing or empty company identifier");

  const idType = getIdentifierType(trimmedId);

  console.log("Looking up company:", { trimmedId, idType });

  const query = knex("companies")
    .select<{ id: string }>("id")
    .where(idType === "uuid" ? { id: trimmedId } : { short_code: trimmedId })
    .timeout(5000);

  const company = await query.first();

  ensure(company, "Invalid company identifier");
  console.log("Found company:", company.id);

  return company.id;
};
