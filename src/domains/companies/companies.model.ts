import type { Knex } from "knex";
import {
  Company,
  newCompany,
  newCompanyInput,
  NewCompanyInput,
} from "./companies.types";
import { ApiResponse } from "../../core/types/api.types";
import {
  camelToSnake,
  snakeToCamel,
} from "../../shared/utils/formatting.utils";
import {
  ensure,
  errorResponse,
  successResponse,
  throwError,
} from "../../shared/utils/response.utils";
import generateSecureShortCode from "../../shared/utils/crypto.utils";
import knexClient from "../../../knexClient";
import { generateAuthTokens } from "../../features/auth/auth.utils";
import { getCompanyUUID } from "../../shared/utils/random.utils";

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
    const userExists = await knexTrx("users")
      .where({ id: input.created_by_id })
      .first();

    if (!userExists) {
      return throwError("Unauthorized");
    }

    let firmId = assigned_firm_id || null;
    if (!firmId) {
      const [firm] = await knexTrx("accounting_firms")
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
      exists = await knexTrx("companies").where({ short_code }).first();
      attempts++;
    } while (exists && attempts < maxAttempts);

    if (!short_code) {
      return throwError("Unable to generate short code");
    }

    const [company] = await knexTrx("companies")
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

    const firmAssignment = await knexTrx("firms_companies").insert({
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
    knex("currencies").where({ id: input.reportingCurrencyId }).first(),
    knex("countries").where({ id: input.countryId }).first(),
  ]);

  if (!currency)
    throw new Error(`Currency ${input.reportingCurrencyId} not found`);
  if (!country) throw new Error(`Country ${input.countryId} not found`);
};

export const switchCompany = async (
  userId: string,
  companyIdentifier: string
) => {
  try {
    const companyId = await getCompanyUUID(companyIdentifier);

    const role = await knexClient("users_companies_roles")
      .where({
        user_id: userId,
        company_id: companyId,
        is_deleted: false,
      })
      .select("company_id", "role_id")
      .first();

    if (!role) {
      return errorResponse("User not authorized for this company");
    }

    await knexClient("users")
      .where("id", userId)
      .update("last_active_company_id", companyId);

    const { accessToken, refreshToken } = generateAuthTokens({
      id: userId,
      currentCompanyId: companyId,
    });

    return successResponse("Company switched successfully", {
      accessToken,
      refreshToken,
      user: { id: userId, currentCompanyId: companyId },
    });
  } catch (error) {
    return errorResponse("Something went wrong", error);
  }
};

const companyFields = [
  "companies.id",
  "companies.legal_name as legalName",
  "companies.display_name as displayName",
  "companies.short_code as shortCode",
  "companies.address as address",
  "companies.type as companyType",
  "companies.logo_url as companyLogo",
  "companies.description as description",
  "companies.website as website",
  "companies.industry as industry",
  "companies.team_size as companySize",
  "companies.revenue as revenue",
  "companies.year_end_day as yearEndDay",
  "companies.year_end_month as yearEndMonth",
  "companies.registration_number as companyRegistrationNumber",
  "companies.tax_id as companyTaxId",
  "companies.assigned_firm_id as assignedFirmId",
  "companies.country_id as countryId",
  "countries.code as countryCode",
  "countries.name as countryName",
  "countries.phone_code as countryPhoneCode",
  "countries.flag as countryFlag",
  "countries.continent as countryContinent",
  "companies.reporting_currency_id as reportingCurrencyId",
  "currencies.code as reportingCurrencyCode",
  "currencies.name as reportingCurrencyName",
  "currencies.symbol as reportingCurrencySymbol",
  "companies.created_by_id as createdById",
];
export const getCompanies = async (
  userId?: string,
  pageSize?: number,
  page?: number
) => {
  try {
    const result = await knexClient("companies")
      .select(companyFields)
      .leftJoin("countries", "companies.country_id", "countries.id")
      .leftJoin(
        "currencies",
        "companies.reporting_currency_id",
        "currencies.id"
      );

    if (!result.length) {
      return errorResponse("Error retrieving companies");
    }

    return successResponse(
      "Successfully retrieved all companies",
      snakeToCamel(result)
    );
  } catch (error: any) {
    return errorResponse("An unexpected error occured", error?.message);
  }
};

export const getSingleCompany = async (identifier: string) => {
  try {
    const companyId = await getCompanyUUID(identifier);
    ensure(companyId, "Forbidden");

    const company = await knexClient("companies")
      .select(companyFields)
      .leftJoin("countries", "companies.country_id", "countries.id")
      .leftJoin(
        "currencies",
        "companies.reporting_currency_id",
        "currencies.id"
      )
      .where("companies.id", companyId)
      .first();

    if (!company)
      return errorResponse(`Company with ID ${identifier} not found`);

    return successResponse(
      `Successfully retrieved details for company`,
      company
    );
  } catch (error) {
    errorResponse("Error retrieving company details");
  }
};
