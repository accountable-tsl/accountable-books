import type { Knex } from "knex";
import {
  CompanyFilters,
  companyType,
  FetchCompaniesOptions,
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
  isValidUUID,
  snakeToCamel,
} from "../../shared/utils/formatting.utils";
import {
  AppError,
  ErrorCode,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import generateSecureShortCode from "../../shared/utils/crypto.utils";
import { knexClient } from "../../../knexClient";
import {
  buildAuthContext,
  generateAuthTokens,
} from "../../features/auth/auth.utils";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import { updateFirm } from "../accountingFirms/firms.model";
import { AuthUserContext } from "../../features/auth/auth.types";
import { hasAccessToCompany } from "../userRoles/userRoles.model";
import { redis } from "../../lib/redis";
import { createInitialCompanyOnboardingState } from "../../features/onboarding/onboarding.utils";

/**
 * Creates a new company in the database.
 *
 * This function validates the given company input, ensuring that all required fields are present
 * and correctly formatted. It checks that the user attempting to create the company exists and
 * assigns the company to a firm if not already assigned. The function generates a unique short code
 * for the company if not provided, initializes the onboarding state, and inserts the company data
 * into the database. It also handles assigning the company to a firm and returns a success or error
 * response based on the operation outcome.
 *
 * @param {Knex.Transaction} knexTrx - The transaction object for database operations.
 * @param {NewCompanyInput} input - The input data for the company to be created.
 * @returns {Promise<ApiResponse>} A promise that resolves to an ApiResponse with the result of the
 * company creation operation.
 * @throws {AppError} Throws an error if the user is unauthorized, if a short code cannot be
 * generated, if the company cannot be created, or if the company cannot be assigned to a firm.
 */

export const createCompany = async (
  knexTrx: Knex.Transaction,
  input: NewCompanyInput
): Promise<ApiResponse<any>> => {
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
      const [firm] = await knexTrx("accounting_firms_meta as af")
        .join("companies as c", "af.company_id", "c.id")
        .where("c.is_platform", true)
        .select("af.company_id as id");

      firmId = firm.id;
      if (!firmId) {
        throw new AppError("Company must be assigned to a firm");
      }
    }

    let short_code: string;
    let exists;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      short_code = input.short_code || generateSecureShortCode();
      exists = await knexTrx("companies").where({ short_code }).first();
      attempts++;
    } while (exists && attempts < maxAttempts);

    if (!short_code) {
      throw new AppError("Unable to generate short code", input, true);
    }

    const initialOnboardingState = createInitialCompanyOnboardingState();

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
        onboarding_state: initialOnboardingState,
      })
      .returning("*");

    if (!company) {
      throw new AppError("Unable to create company");
    }

    const firmAssignment = await knexTrx("client_firm_assignments").insert({
      client_company_id: company.id,
      accounting_firm_company_id: firmId,
      created_by_id: userExists.id,
      updated_by_id: userExists.id,
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
  { user, newCompanyId }: { user: AuthUserContext; newCompanyId: string } // The company they wish to switch to
): Promise<ApiResponse<any>> => {
  try {
    const companyUUID = await getCompanyUUID(newCompanyId);
    // Get company details
    const company = await knexClient("companies")
      .select("is_demo_company")
      .where({ is_deleted: false, id: companyUUID })
      .first();

    if (!company) {
      return errorResponse("Company not found");
    }

    console.log(company);

    // Grant demo access if needed
    if (company.is_demo_company) {
      const accessGranted = await grantAccessToCompany({
        companyId: companyUUID,
        userId: user.id,
        roleName: "demo_user",
      });

      console.log({ accessGranted });
    }

    // Confirm access
    const accessCheck = await hasAccessToCompany({
      userId: user.id,
      companyId: companyUUID,
    });

    console.log({ accessCheck });
    if (!accessCheck.data?.hasAccess) {
      return errorResponse("You do not have access to this company");
    }

    // Update user's last active company
    if (!company.is_demo_company) {
      await knexClient("users")
        .where("id", user.id)
        .update("last_active_company_id", companyUUID);
    }

    const userData = {
      sub: user.id,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      status: user.status,
      currentCompanyId: companyUUID,
    };
    console.log(userData);
    // Generate new tokens reflecting the new active company
    const { accessToken, refreshToken } = generateAuthTokens(userData);

    // Store refresh token in Redis
    await redis.sadd(`refreshTokens:${user.id}`, refreshToken);
    await redis.expire(`refreshTokens:${user.id}`, 604800); // 7 days

    const authContext = await buildAuthContext(userData);

    return successResponse("Company switched successfully", {
      accessToken,
      refreshToken,
      user: authContext.user,
      company: authContext.company,
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
  "companies.created_by_id as createdById",
  "companies.created_at as createdAt",

  "countries.code as countryCode",
  "countries.name as countryName",
  "countries.phone_code as countryPhoneCode",
  "countries.flag as countryFlag",
  "countries.continent as countryContinent",

  "companies.reporting_framework as reportingFramework",
  "companies.accounting_basis as accountingBasis",
  "companies.onboarding_state as onboardingState",
  "companies.is_demo_company as isDemoCompany",

  "companies.reporting_currency_id as reportingCurrencyId",
  "currencies.code as reportingCurrencyCode",
  "currencies.name as reportingCurrencyName",
  "currencies.symbol as reportingCurrencySymbol",

  // accounting firm fields
  "companies.assigned_firm_id as assignedFirmId",
  "accounting_firms_meta.slug as assignedFirmSlug",
  "firm_meta.display_name as assignedFirmName",
  "firm_meta.is_platform as assignedFirmIsPlatform",
  "firm_meta.logo_url as assignedFirmLogo",
  "firm_meta.logo_key as assignedFirmLogoKey",
];

/**
 * Retrieves one or more companies based on the given identifiers or filters.
 *
 * @param options - Options for fetching companies.
 * @param options.identifiers - List of company identifiers (short codes or UUIDs).
 * @param options.filters - Filters to apply to the query.
 * @param options.filters.companyType - List of company types to filter by.
 * @param options.filters.country - Filter by country code (2-character ISO code) or country ID.
 * @param options.filters.assignedFirm - Filter by assigned firm identifier (short code or UUID).
 * @param options.filters.isDemoCompany - Filter by whether the company is a demo company.
 *
 * @returns An ApiResponse containing the retrieved companies.
 */
export const fetchCompanies = async ({
  identifiers,
  filters,
}: FetchCompaniesOptions = {}): Promise<ApiResponse<GetCompanyResponse[]>> => {
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
        "accounting_firms_meta",
        "companies.assigned_firm_id",
        "accounting_firms_meta.company_id"
      )
      .leftJoin(
        "companies as firm_meta",
        "accounting_firms_meta.company_id",
        "firm_meta.id"
      ); // Get actual firm details from companies table (since firms are also companies)

    if (identifiers?.length) {
      const companyIds = [];

      for (const identifier of identifiers) {
        const companyId = await getCompanyUUID(identifier);
        if (!companyId) {
          return errorResponse(
            `Invalid company identifier: ${identifier}`,
            undefined,
            { code: ErrorCode.INVALID_CREDENTIALS }
          );
        }

        companyIds.push(companyId);
      }

      query.whereIn("companies.id", companyIds);
    }

    if (filters) {
      if (filters.companyType?.length) {
        if (
          filters.companyType.every((type) =>
            companyType.options.includes(type)
          )
        ) {
          query.whereIn("companies.type", filters.companyType);
        } else {
          return errorResponse(
            `Invalid company type(s): ${filters.companyType}`
          );
        }
      }

      if (filters.country) {
        if (filters.country.length === 2) {
          query.where("countries.code", filters.country);
        } else {
          query.where("companies.country_id", filters.country);
        }
      }

      if (typeof filters.assignedFirm === "string") {
        if (isValidUUID(filters.assignedFirm)) {
          query.where("companies.assigned_firm_id", filters.assignedFirm);
        } else if (filters.assignedFirm.length <= 20) {
          query.where("accounting_firms_meta.slug", filters.assignedFirm);
        } else {
          return errorResponse(
            `Invalid assigned firm identifier: ${filters.assignedFirm}`
          );
        }
      }

      if (typeof filters?.isDemoCompany !== "undefined") {
        query.where("companies.is_demo_company", filters.isDemoCompany);
      } else {
        query.where("companies.is_demo_company", false); // Exclude demo companies by default
      }
    }

    const result = await query;

    if (!result || (Array.isArray(result) && result.length === 0)) {
      return errorResponse(
        `No ${identifiers?.length === 1 ? "company matches" : "companies match"} the provided input`
      );
    }

    const data = snakeToCamel(result);

    return successResponse<GetCompanyResponse[]>(
      identifiers?.length === 1
        ? `Successfully retrieved company`
        : filters
          ? `Successfully retrieved filtered companies`
          : `Successfully retrieved all companies`,
      data
    );
  } catch (error: any) {
    return errorResponse("An unexpected error occured", error?.message);
  }
};

export const getCompanies = (options?: FetchCompaniesOptions) =>
  fetchCompanies(options ?? {});

export const getCompaniesByIds = async (
  ids: string[]
): Promise<ApiResponse<GetCompanyResponse[]>> => {
  if (!ids || ids.length === 0) {
    return errorResponse("No company identifiers provided", null);
  }

  return fetchCompanies({ identifiers: ids });
};

export const getSingleCompany = async (
  id: string
): Promise<ApiResponse<GetCompanyResponse>> => {
  const res = await fetchCompanies({ identifiers: [id] });

  if (!res.success || !res.data || res.data.length === 0) {
    return errorResponse(res.message, null);
  }

  return successResponse<GetCompanyResponse>(
    "Successfully retrieved company",
    res.data[0]
  );
};

export const updateCompany = async (
  identifier: string,
  payload: UpdateCompanySchema,
  userId: string,
  knex?: Knex.Transaction
): Promise<ApiResponse<GetCompanyResponse>> => {
  const db = knex || knexClient;

  try {
    const companyId = await getCompanyUUID(identifier);
    if (!companyId) {
      return errorResponse(
        `Invalid company identifier: ${identifier}`,
        undefined,
        { code: ErrorCode.INVALID_CREDENTIALS }
      );
    }

    const result = await db.transaction(async (trx) => {
      // Implement later if needed
      // Check user's role on this company
      // const roleRecord = await trx("user_company_roles")
      //   .where({ user_id: userId, company_id: companyId })
      //   .where("user_company_roles.is_deleted", false)
      //   .where("roles.is_deleted", false)
      //   .join("roles", "user_company_roles.role_id", "roles.id")
      //   .select("user_company_roles.role_id", "roles.name")
      //   .first();

      // if (!roleRecord) {
      //   return errorResponse(
      //     "You are not authorized to update this company",
      //     undefined,
      //     ErrorCode.UNAUTHORIZED
      //   );
      // }

      // const allowedRoles: RoleName[] = ["super_admin", "admin", "client"];
      // if (!allowedRoles.includes(roleRecord.name))
      //   return errorResponse(
      //     "You are not authorized to update company details",
      //     undefined,
      //     ErrorCode.FORBIDDEN
      //   );

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

      const [updatedRow] = await trx("companies")
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
        await updateFirm(trx, updatedRow.id, {
          slug: validInput.data.slug,
          firm_type: validInput.data.firmType,
        });
      }

      const refreshed = await getSingleCompany(companyId);
      const refreshedData = Array.isArray(refreshed.data)
        ? refreshed.data[0]
        : refreshed.data;

      if (!refreshedData) {
        return errorResponse("Company not found after update", refreshed, {
          report: true,
        });
      }

      return successResponse(
        "Successfully updated company details",
        refreshedData
      );
    });

    return result;
  } catch (error) {
    return errorResponse("Error updating company details", error, {
      report: true,
    });
  }
};
