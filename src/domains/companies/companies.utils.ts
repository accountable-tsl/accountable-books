import knexClient from "../../../knexClient";
import { getIdentifierType } from "../../shared/utils/formatting.utils";
import { ensure } from "../../shared/utils/response.utils";

type CompanyIdentifierResult = {
  id: string;
  short_code: string;
};

export const getCompanyIdentifiers = async (
  identifier: string
): Promise<CompanyIdentifierResult> => {
  const trimmedId = identifier.trim();
  ensure(trimmedId, "Missing or empty company identifier");

  const idType = getIdentifierType(trimmedId);

  const company = await knexClient("companies")
    .select("id", "short_code")
    .where(idType === "uuid" ? { id: trimmedId } : { short_code: trimmedId })
    .timeout(1000)
    .first();

  ensure(company, "Invalid company identifier");

  return { id: company.id, short_code: company.short_code };
};
