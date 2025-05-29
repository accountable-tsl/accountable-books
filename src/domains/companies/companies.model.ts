import type { Knex } from "knex";
import {
  fieldToColumnMap,
  GetCompanyResponse,
  newCompany,
  newCompanyInput,
  NewCompanyInput,
  UpdateCompanySchema,
  updateCompanySchema,
} from "./companies.types";
import { ApiResponse } from "../../core/types/api.types";
import {
  camelToSnake,
  getIdentifierType,
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
import { RoleName } from "../../core/types/db.type";

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
      const [firm] = await knexTrx("accounting_firms as af")
        .join("companies as c", "af.company_id", "c.id")
        .where("c.is_platform", true)
        .select("af.company_id as id");

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
        last_updated_by_id: userExists.id,
        accounting_basis:
          validateInput.data.accounting_basis ??
          (validateInput.data.type === "individual"
            ? "modified_cash_basis"
            : "modified_accrual_basis"),
        is_demo_company: validateInput.data.is_demo_company || false,
        industry:
          validateInput.data.industry ||
          validateInput.data.type === "accounting_firm"
            ? "Professional Services - Accounting Firm"
            : null,
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
  "companies.onboarding_status as onboardingStatus",
  "companies.is_demo_company as isDemoCompany",

  "companies.reporting_currency_id as reportingCurrencyId",
  "currencies.code as reportingCurrencyCode",
  "currencies.name as reportingCurrencyName",
  "currencies.symbol as reportingCurrencySymbol",
  "companies.created_by_id as createdById",

  // accounting firm fields
  "companies.assigned_firm_id as assignedFirmId",
  "accounting_firms.slug as assignedFirmSlug",
  "firm_meta.display_name as assignedFirmName",
  "firm_meta.is_platform as assignedFirmIsPlatform",
  "firm_meta.logo_url as assignedFirmLogo",
  "firm_meta.logo_key as assignedFirmLogoKey",
];
export const fetchCompanies = async (
  identifier?: string
  // userId?: string,
  // pageSize?: number,
  // page?: number
): Promise<ApiResponse<GetCompanyResponse[] | GetCompanyResponse>> => {
  try {
    const query = knexClient("companies")
      .select(companyFields)
      .leftJoin("countries", "companies.country_id", "countries.id")
      .leftJoin(
        "currencies",
        "companies.reporting_currency_id",
        "currencies.id"
      )
      .leftJoin(
        "accounting_firms",
        "companies.assigned_firm_id",
        "accounting_firms.company_id"
      )
      .leftJoin(
        "companies as firm_meta",
        "accounting_firms.company_id",
        "firm_meta.id"
      );

    if (identifier) {
      const companyId = await getCompanyUUID(identifier);
      if (!companyId) {
        return errorResponse(
          `Invalid company identifier: ${identifier}`,
          undefined,
          ErrorCode.INVALID_CREDENTIALS
        );
      }

      query.where("companies.id", companyId).first();
    }

    const result = await query;

    if (!result || (Array.isArray(result) && result.length === 0)) {
      return errorResponse(
        `Error retrieving ${identifier ? "company" : "companies"}`
      );
    }

    const data = snakeToCamel(result);

    return successResponse<GetCompanyResponse[]>(
      identifier
        ? "Successfully retrieved company"
        : "Successfully retrieved all companies",
      data
    );
  } catch (error: any) {
    return errorResponse("An unexpected error occured", error?.message);
  }
};

export const getCompanies = () => fetchCompanies();

export const getSingleCompany = (id: string) => fetchCompanies(id);

export const updateCompany = async (
  identifier: string,
  payload: UpdateCompanySchema,
  userId: string
): Promise<ApiResponse<GetCompanyResponse>> => {
  try {
    const companyId = await getCompanyUUID(identifier);

    if (!companyId) {
      return errorResponse(
        `Invalid company identifier: ${identifier}`,
        undefined,
        ErrorCode.INVALID_CREDENTIALS
      );
    }

    // Check user's role on this company
    const roleRecord = await knexClient("users_companies_roles")
      .where({ user_id: userId, company_id: companyId, is_deleted: false })
      .select("role_id", "name")
      .first();

    if (!roleRecord) {
      return errorResponse(
        "You are not authorized to update this company",
        undefined,
        ErrorCode.UNAUTHORIZED
      );
    }

    const allowedRoles: RoleName[] = ["super_admin", "admin"];
    if (!allowedRoles.includes(roleRecord.name))
      return errorResponse(
        "You are not authorized to update company details",
        undefined,
        ErrorCode.FORBIDDEN
      );

    const validInput = updateCompanySchema.safeParse(payload);
    if (!validInput.success) {
      return errorResponse(`Invalid input: ${validInput.error.message}`);
    }

    const dbUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue;
      const column = fieldToColumnMap[key as keyof GetCompanyResponse];
      if (column)
        dbUpdates[column] =
          value === null || (typeof value === "string" && value.trim() === "")
            ? null
            : value;
    }

    if (Object.keys(dbUpdates).length === 0) {
      return errorResponse("Nothing to update – no valid fields supplied");
    }

    const [updatedRow] = await knexClient("companies")
      .where("id", companyId)
      .update({ ...dbUpdates, last_updated_by_id: userId })
      .returning("*");

    if (!updatedRow) {
      return errorResponse("Error updating company details");
    }

    if (
      updatedRow.type === "accounting_firm" &&
      (validInput.data.slug || validInput.data.firmType)
    ) {
      await knexClient("accounting_firms")
        .where("company_id", companyId)
        .update({
          slug: validInput.data.slug,
          firm_type: validInput.data.firmType,
        });
    }

    const refreshed = await getSingleCompany(companyId);
    const refreshedData = Array.isArray(refreshed.data)
      ? refreshed.data[0]
      : refreshed.data;

    if (!refreshedData) {
      return errorResponse(
        "Company not found after update",
        refreshed,
        undefined,
        true
      );
    }

    return successResponse(
      "Successfully updated company details",
      refreshedData
    );
  } catch (error) {
    return errorResponse("Error updating company details");
  }
};
