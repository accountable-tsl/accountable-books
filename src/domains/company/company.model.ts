import type { Knex } from "knex";
import {
  Company,
  newCompany,
  newCompanyInput,
  NewCompanyInput,
} from "./company.types";
import { ApiResponse } from "../../core/types/api.types";
import {
  camelToSnake,
  snakeToCamel,
} from "../../shared/utils/formatting.utils";
import {
  errorResponse,
  successResponse,
  throwError,
} from "../../shared/utils/response.utils";
import generateSecureShortCode from "../../shared/utils/crypto.utils";

export const createCompany = async (
  knexTrx: Knex.Transaction,
  input: NewCompanyInput
): Promise<ApiResponse> => {
  const snakeInput = camelToSnake(input);
  const validateInput = newCompanyInput.safeParse(snakeInput);

  if (!validateInput.success) {
    return errorResponse("Invalid input", validateInput.error.flatten());
  }

  if (!input.created_by_id) {
    return errorResponse("UserID is required");
  }
  const { assigned_firm_id } = validateInput.data;

  try {
    const userExists = await knexTrx("user")
      .where({ id: input.created_by_id })
      .first();

    if (!userExists) {
      return throwError("Unauthorized");
    }

    let firmId = assigned_firm_id || null;
    if (!firmId) {
      const [firm] = await knexTrx("accounting_firm")
        .where("is_platform", true)
        .select("id");

      if (!firm.id) {
        return throwError("Company must be assigned to a firm");
      }

      firmId = firm.id;
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
      return throwError("Unable to generate short code");
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
      return throwError("Unable to create company");
    }

    const firmAssignment = await knexTrx("firm_company").insert({
      company_id: company.id,
      accounting_firm_id: firmId,
    });

    const companyData = newCompany.safeParse(company);

    if (!firmAssignment) {
      return throwError("Unable to assign company to firm");
    }

    return successResponse("Company created successfully", companyData.data);
  } catch (error) {
    return errorResponse("Unable to create company", error);
  }
};

export const verifyCompanyDependenciesExist = async (
  knex: Knex,
  input: { reportingCurrencyId: string; countryId: string }
) => {
  const [currency, country] = await Promise.all([
    knex("currency").where({ id: input.reportingCurrencyId }).first(),
    knex("country").where({ id: input.countryId }).first(),
  ]);

  if (!currency)
    throw new Error(`Currency ${input.reportingCurrencyId} not found`);
  if (!country) throw new Error(`Country ${input.countryId} not found`);
};
