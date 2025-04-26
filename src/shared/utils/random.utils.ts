import knex from "../../../knexClient";
import { getIdentifierType } from "./formatting.utils";
import { ensure } from "./response.utils";

export const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const getCompanyUUID = async (identifier: string): string => {
  const idType = getIdentifierType(identifier);
  if (idType === "uuid") return identifier;

  const company = await knex("companies")
    .select("id")
    .where("short_code", identifier)
    .first();

  ensure(company, "Invalid company identifier");

  return company.id;
};
