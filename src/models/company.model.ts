import type { Knex } from "knex";
import { ApiResponse } from "../types/generic";
import { newCompanyInput, NewCompanyInput } from "../types/db.type";
import generateSecureShortCode, {
  camelToSnake,
  errorResponse,
  snakeToCamel,
  successResponse,
} from "../utils/utils";

export const createCompany = async (
  knexTrx: Knex.Transaction,
  input: NewCompanyInput
): Promise<ApiResponse> => {
  const snakeInput = camelToSnake(input);
  const validateInput = newCompanyInput.safeParse(snakeInput);

  if (!validateInput.success) {
    return errorResponse("Invalid input", validateInput.error.flatten());
  }

  try {
    const userExists = await knexTrx("user")
      .where({ id: validateInput.data.created_by_id })
      .first();

    if (!userExists) {
      return errorResponse("Unauthorized");
    }

    let short_code: string;
    let exists;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      short_code = generateSecureShortCode();
      exists = await knexTrx("company").where({ short_code }).first();
      attempts++;
    } while (exists && attempts < maxAttempts);

    if (!short_code) {
      return errorResponse("Unable to generate short code");
    }

    const [company] = await knexTrx("company")
      .insert({
        ...validateInput.data,
        display_name:
          validateInput.data.display_name || validateInput.data.legal_name,
        short_code,
        year_end_day: validateInput.data.year_end_day || 31,
        year_end_month: validateInput.data.year_end_month || 12,
        reporting_framework: validateInput.data.reporting_framework || "ifrs",
        created_by_id: userExists.id,
      })
      .returning("*");

    if (!company) {
      return errorResponse("Unable to create company");
    }

    return successResponse(
      "Company created successfully",
      snakeToCamel(company)
    );
  } catch (error) {
    return errorResponse("Unable to create company", error);
  }
};
