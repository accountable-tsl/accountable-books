import knexClient from "../../../knexClient";
import { errorResponse } from "../../shared/utils/response.utils";

const bankRespFields = [
  "ba.id as id",
  "ba.display_name as displayName",
  "ba.account_type as accountType",
  "ba.account_number as accountNumber",
  "ba.company_id as companyId",
  "ba.created_by_id as createdById",

  "ba.bank_id as bankId",
  "b.name as bankName",

  "ba.currency_id as currencyId",
  "c.name as currencyName",
  "c.symbol as currencySymbol",
  "c.code as currencyCode",

  "ba.coa_id as coaId",
  "coa.name as bankAccountCoaName",
];
export async function getBankAccounts(companyId: string) {
  if (!companyId) return errorResponse("Company ID is required");

  try {
    const bankAccounts = await knexClient("bank_accounts as ba")
      .select(bankRespFields)
      .innerJoin("banks as b", "ba.bank_id", "b.id")
      .innerJoin("currencies as c", "ba.currency_id", "c.id")
      .innerJoin("coa", "ba.coa_id", "coa.id")
      .where("ba.company_id", companyId);
  } catch (error) {}
}
