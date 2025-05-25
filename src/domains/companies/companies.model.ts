import type { Knex } from "knex";
import {
  Company,
  getCompanyResponse,
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
  AppError,
  ErrorCode,
  errorResponse,
  successResponse,
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
      throw new AppError(
        "Unauthorized",
        `Non existent user trying to create company ${input.legal_name} with userId: ${input.created_by_id}`,
        true
      );
    }

    let firmId = assigned_firm_id || null;
    if (!firmId) {
      const [firm] = await knexTrx("accounting_firms")
        .where("is_platform", true)
        .select("id");

      if (!firm.id) {
        throw new AppError("Company must be assigned to a firm");
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
      throw new AppError("Unable to generate short code", input, true);
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
        accounting_basis:
          validateInput.data.accounting_basis ??
          (validateInput.data.type === "individual"
            ? "modified_cash_basis"
            : "modified_accrual_basis"),
        is_demo_company: validateInput.data.is_demo_company || false,
      })
      .returning("*");

    if (!company) {
      throw new AppError("Unable to create company");
    }

    const firmAssignment = await knexTrx("firms_companies").insert({
      company_id: company.id,
      accounting_firm_id: firmId,
    });

    const companyData = newCompany.safeParse(company);

    if (!firmAssignment) {
      throw new AppError("Unable to assign company to firm");
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
  user: {
    id: string;
    firstname: string;
    lastname?: string;
    email: string;
    status: string;
    currentCompanyId: string;
  },
  newCompanyId: string
) => {
  try {
    // Update this formula later
    const companyId = await getCompanyUUID(newCompanyId);

    const role = await knexClient("users_companies_roles")
      .where({
        user_id: user.id,
        company_id: companyId,
        is_deleted: false,
      })
      .select("company_id", "role_id")
      .first();

    if (!role) {
      return errorResponse("User not authorized for this company");
    }

    await knexClient("users")
      .where("id", user.id)
      .update("last_active_company_id", companyId);

    const { accessToken, refreshToken } = generateAuthTokens({
      sub: user.id,
      currentCompanyId: companyId,
      email: user.email,
      firstname: user.firstname,
      status: user.status,
      lastname: user.lastname,
    });

    return successResponse("Company switched successfully", {
      accessToken,
      refreshToken,
      user: { ...user, currentCompanyId: companyId },
    });
  } catch (error) {
    return errorResponse("Something went wrong", error);
  }
};

const companyFields = [
  "companies.short_code as id",
  "companies.legal_name as legalName",
  "companies.display_name as displayName",
  "companies.address as address",
  "companies.type as companyType",
  "companies.logo_url as companyLogo",
  "companies.logo_key as companyLogoKey",
  "companies.description as description",
  "companies.website as website",
  "companies.industry as industry",
  "companies.team_size as companySize",
  "companies.revenue as revenue",
  "companies.year_end_day as yearEndDay",
  "companies.year_end_month as yearEndMonth",
  "companies.registration_number as companyRegistrationNumber",
  "companies.tax_id as companyTaxId",
  "companies.country_id as countryId",
  "countries.code as countryCode",
  "countries.name as countryName",
  "countries.phone_code as countryPhoneCode",
  "countries.flag as countryFlag",
  "countries.continent as countryContinent",

  "companies.reporting_framework as reportingFramework",
  "companies.accounting_basis as accountingBasis",
  "companies.is_onboarding_complete as isOnboardingComplete",
  "companies.is_demo_company as isDemoCompany",

  "companies.reporting_currency_id as reportingCurrencyId",
  "currencies.code as reportingCurrencyCode",
  "currencies.name as reportingCurrencyName",
  "currencies.symbol as reportingCurrencySymbol",
  "companies.created_by_id as createdById",

  // accounting firm fields
  "companies.assigned_firm_id as assignedFirmId",
  "accounting_firms.display_name as assignedFirmName",
  "accounting_firms.slug as assignedFirmSlug",
  "accounting_firms.is_platform as assignedFirmIsPlatform",
  "accounting_firms.logo_url as assignedFirmLogo",
  "accounting_firms.logo_key as assignedFirmLogoKey",
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

    return successResponse<getCompanyResponse[]>(
      "Successfully retrieved all companies",
      snakeToCamel(result)
    );
  } catch (error: any) {
    return errorResponse("An unexpected error occured", error?.message);
  }
};

export const getSingleCompany = async (
  identifier: string
): Promise<ApiResponse<getCompanyResponse>> => {
  try {
    const companyId = await getCompanyUUID(identifier);
    if (!companyId) {
      return errorResponse(
        `Invalid company identifier: ${identifier}`,
        undefined,
        ErrorCode.INVALID_CREDENTIALS
      );
    }

    const company = await knexClient("companies")
      .select(companyFields)
      .leftJoin("countries", "companies.country_id", "countries.id")
      .leftJoin(
        "currencies",
        "companies.reporting_currency_id",
        "currencies.id"
      )
      .innerJoin(
        "accounting_firms",
        "companies.assigned_firm_id",
        "accounting_firms.id"
      )
      .where("companies.id", companyId)
      .first();

    if (!company)
      return errorResponse(`Error retrieving company with ID ${identifier}`);

    return successResponse<getCompanyResponse>(
      `Successfully retrieved details for company`,
      company
    );
  } catch (error) {
    return errorResponse("Error retrieving company details");
  }
};
