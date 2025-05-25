import knexClient from "../../../knexClient";
import { getIdentifierType } from "../../shared/utils/formatting.utils";
import { AppError, ensure } from "../../shared/utils/response.utils";

type CompanyIdentifierResult = {
  id: string;
  short_code: string;
};

export const getCompanyIdentifiers = async (
  identifier: string
): Promise<CompanyIdentifierResult> => {
  const trimmedId = identifier.trim();
  if (!trimmedId || trimmedId.length > 50)
    throw new AppError("Invalid company identifier");

  const idType = getIdentifierType(trimmedId);

  const company = await knexClient("companies")
    .select("id", "short_code")
    .where(idType === "uuid" ? { id: trimmedId } : { short_code: trimmedId })
    .timeout(1000)
    .first();

  if (!company) throw new AppError("Company not found");

  return { id: company.id, short_code: company.short_code };
};
