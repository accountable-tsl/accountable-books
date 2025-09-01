import type { Knex } from 'knex';
import {
  companyType,
  type FetchCompaniesOptions,
  fieldToColumnMap,
  type GetCompanyResponse,
  type NewCompany,
  newCompany,
  newCompanyInput,
  type NewCompanyInput,
  type UpdateCompanySchema,
  updateCompanySchema,
} from './companies.types.js';
import type { ApiResponse } from '../../core/types/api.types.js';
import { camelToSnake, isValidUUID, snakeToCamel } from '../../shared/utils/formatting.utils.js';
import {
  AppError,
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import generateSecureShortCode, { shortCodelooksWeird } from '../../shared/utils/crypto.utils.js';
import { knexClient } from '../../db/knexClient.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import { updateFirm } from '../accountingFirms/firms.model.js';
import { type AuthUserContext } from '../../features/auth/auth.types.js';
import {
  createInitialCompanyOnboardingState,
  markCompanyOnboardingStepComplete,
} from '../../features/onboarding/onboarding.utils.js';
import { logger, logError, logDatabaseOperation, logTiming } from '../../shared/utils/logger.js';
import { getCurrency } from '../currencies/currencies.utils.js';
import { getCountry } from '../countries/countries.utils.js';

/**
 * Generates a unique short code for a company with collision handling
 *
 * @param trx - Database transaction
 * @param providedShortCode - Optional specific short code to use
 * @param operationLogger - Logger instance for this operation
 * @returns Object with generated short code and attempt count
 */
async function generateUniqueShortCode(
  trx: Knex.Transaction,
  providedShortCode: string | undefined,
  operationLogger: any,
): Promise<{ shortCode: string; attempts: number }> {
  let shortCode: string;
  let exists = false;
  let attempts = 0;
  const maxAttempts = 5;

  do {
    shortCode = providedShortCode || generateSecureShortCode();

    // If no provided short code, check if generated code looks weird
    if (!providedShortCode && shortCodelooksWeird(shortCode, 4)) {
      attempts++;
      continue; // Skip the database check, just generate another
    }

    exists = !!(await trx('companies').where({ short_code: shortCode }).first());
    attempts++;

    // If we provided a specific short_code and it exists, fail immediately
    if (providedShortCode && exists) {
      operationLogger.warn({ providedShortCode }, 'Provided short code already exists');
      throw new AppError(
        'Provided short code already exists',
        { shortCode: providedShortCode },
        true,
      );
    }
  } while (exists && attempts < maxAttempts);

  if (exists) {
    const error = `Unable to generate unique short code after ${maxAttempts} attempts`;
    operationLogger.error({ attempts: maxAttempts }, error);
    throw new AppError(error, { attempts: maxAttempts }, true);
  }

  return { shortCode, attempts };
}

/**
 * Options for creating a company
 */
export interface CreateCompanyOptions {
  /** Company creation data */
  company: NewCompanyInput;
  /** Database transaction context (required) */
  transaction: Knex.Transaction;
}

/**
 * Creates a new company in the database with full transaction safety.
 *
 * This function handles:
 * - Input validation and sanitization
 * - Atomic database operations within provided transaction
 * - User authorization verification
 * - Unique short code generation with collision handling
 * - Firm assignment and relationship creation
 * - Complete audit logging and error handling
 *
 * @param options - Company creation options with named parameters
 * @returns ApiResponse with company creation result
 */
export const createCompany = async (
  options: CreateCompanyOptions,
): Promise<ApiResponse<NewCompany>> => {
  const { company: input, transaction: trx } = options;
  const startTime = Date.now();
  const operationId = `create-company-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const companyLogger = logger.child({
    operation: 'createCompany',
    operationId,
    legalName: input.legal_name,
    companyType: input.type,
    createdById: input.created_by_id,
  });

  companyLogger.info('Starting company creation');

  // Input validation and sanitization
  // const snakeInput = camelToSnake(input);
  const validateInput = newCompanyInput.safeParse(input);

  if (!validateInput.success) {
    const validationError = 'Invalid input provided for company creation';
    companyLogger.warn(
      {
        validationErrors: validateInput.error.flatten(),
      },
      validationError,
    );
    return errorResponse(validationError, validateInput.error.flatten());
  }

  if (!input.created_by_id) {
    const userIdError = 'User ID is required for company creation';
    companyLogger.warn(userIdError);
    return errorResponse(userIdError);
  }

  const {
    slug,
    reporting_currency_id,
    reporting_currency_code,
    country_code,
    country_id,
    ...rest
  } = validateInput.data;

  const countryId = country_id ? country_id : country_code && (await getCountry(country_code)).id;

  const reportingCurrencyId = reporting_currency_id
    ? reporting_currency_id
    : reporting_currency_code && (await getCurrency(reporting_currency_code)).id;

  // Sanitize company names (trim and basic cleaning)
  const sanitizedData = {
    ...rest,
    legal_name: rest.legal_name.trim(),
    display_name: rest.display_name?.trim() || rest.legal_name.trim(),
    reporting_currency_id: reportingCurrencyId,
    country_id: countryId,
  };

  const { assigned_firm_id } = sanitizedData;

  // Execute company creation within the provided transaction
  try {
    // Verify user exists and has permission
    logDatabaseOperation('SELECT', 'users', { userId: input.created_by_id });
    const userExists = await trx('users').where({ id: input.created_by_id }).first();

    if (!userExists) {
      const authError = `Non-existent user attempting to create company`;
      companyLogger.warn({ userId: input.created_by_id }, authError);
      throw new AppError(
        'Unauthorized',
        `${authError}: ${sanitizedData.legal_name} with userId: ${input.created_by_id}`,
        true,
      );
    }

    companyLogger.debug({ userId: userExists.id }, 'User authorization verified');

    // Resolve firm assignment
    let firmId = assigned_firm_id || null;
    if (!firmId) {
      logDatabaseOperation('SELECT', 'accounting_firms_meta', { isPlatform: true });
      const [firm] = await trx('accounting_firms_meta as af')
        .join('companies as c', 'af.company_id', 'c.id')
        .where('c.is_platform', true)
        .select('af.company_id as id');

      firmId = firm?.id;
      if (!firmId) {
        const firmError = 'No platform firm available for company assignment';
        companyLogger.error(firmError);
        throw new AppError('Company must be assigned to a firm');
      }
      companyLogger.debug({ firmId }, 'Assigned to platform firm');
    } else {
      companyLogger.debug({ firmId }, 'Using provided firm assignment');
    }

    // Generate unique short code with collision handling
    const { shortCode, attempts } = await generateUniqueShortCode(
      trx,
      input.short_code,
      companyLogger,
    );
    companyLogger.debug({ shortCode, attempts }, 'Short code generated successfully');

    // Prepare company data with defaults
    const onboardingState =
      sanitizedData.onboarding_state || createInitialCompanyOnboardingState(sanitizedData.type);

    const companyData = {
      ...sanitizedData,
      ...(sanitizedData.id ? { id: sanitizedData.id } : {}),
      ...(sanitizedData.is_demo_company ? { is_demo_company: sanitizedData.is_demo_company } : {}),
      legal_name: sanitizedData.legal_name,
      display_name: sanitizedData.display_name,
      short_code: shortCode,
      year_end_day: sanitizedData.year_end_day || 31,
      year_end_month: sanitizedData.year_end_month || 12,
      reporting_framework: sanitizedData.reporting_framework || 'ifrs',
      created_by_id: userExists.id,
      last_updated_by_id: userExists.id,
      accounting_basis:
        sanitizedData.accounting_basis ??
        (sanitizedData.type === 'individual' ? 'modified_cash_basis' : 'modified_accrual_basis'),
      is_demo_company: sanitizedData.is_demo_company || false,
      industry:
        sanitizedData.industry || sanitizedData.type === 'accounting_firm'
          ? 'professional_services'
          : null,
      onboarding_state: onboardingState,
    };

    // Insert company record
    logDatabaseOperation('INSERT', 'companies', {
      legalName: sanitizedData.legal_name,
      shortCode,
    });
    const [company] = await trx('companies').insert(companyData).returning('*');

    if (!company?.id) {
      const insertError = 'Failed to create company record - no company returned';
      companyLogger.error(insertError);
      throw new AppError(insertError);
    }

    companyLogger.info({ companyId: company.id }, 'Company record created successfully');

    // Create firm assignment
    logDatabaseOperation('INSERT', 'client_firm_assignments', {
      clientCompanyId: company.id,
      firmId,
    });
    const firmAssignment = await trx('client_firm_assignments').insert({
      client_company_id: company.id,
      accounting_firm_company_id: firmId,
      created_by_id: userExists.id,
      updated_by_id: userExists.id,
    });

    if (!firmAssignment) {
      const assignmentError = 'Failed to assign company to firm';
      companyLogger.error({ companyId: company.id, firmId }, assignmentError);
      throw new AppError(assignmentError);
    }

    companyLogger.info({ companyId: company.id, firmId }, 'Company assigned to firm successfully');

    // Validate and return company data
    const companyDataValidation = newCompany.safeParse(company);
    const finalCompanyData = companyDataValidation.success ? companyDataValidation.data : company;

    logTiming('createCompany', startTime, {
      companyId: company.id,
      operationId,
    });

    companyLogger.info({ companyId: company.id }, 'Company creation completed successfully');
    return successResponse('Company created successfully', finalCompanyData);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    companyLogger.error(
      {
        error: error instanceof Error ? error : new Error(String(error)),
        operationId,
      },
      `Company creation failed: ${errorMessage}`,
    );

    logError(error instanceof Error ? error : new Error(String(error)), {
      operation: 'createCompany',
      legalName: sanitizedData.legal_name,
      operationId,
    });

    return errorResponse(
      'Unable to create company',
      process.env.NODE_ENV === 'production' ? undefined : error,
    );
  }
};

export const verifyCompanyDependenciesExist = async (
  knex: Knex,
  input: { reportingCurrencyId: string; countryId: string },
) => {
  const [currency, country] = await Promise.all([
    knex('currencies').where({ id: input.reportingCurrencyId }).first(),
    knex('countries').where({ id: input.countryId }).first(),
  ]);

  if (!currency) throw new Error(`Currency ${input.reportingCurrencyId} not found`);
  if (!country) throw new Error(`Country ${input.countryId} not found`);
};

export const switchCompany = async (
  { user, newCompanyId }: { user: AuthUserContext; newCompanyId: string }, // The company they wish to switch to
): Promise<ApiResponse<any>> => {
  try {
    const companyUUID = await getCompanyUUID(newCompanyId);
    // Get company details
    const company = await knexClient('companies')
      .select('is_demo_company')
      .where({ is_deleted: false, id: companyUUID })
      .first();

    if (!company) {
      return errorResponse('Company not found');
    }

    // console.log(company);

    // Grant demo access if needed
    // if (company.is_demo_company) {
    //   const accessGranted = await grantAccessToCompany({
    //     companyId: companyUUID,
    //     userId: user.id,
    //     roleName: "demo_user",
    //   });

    //   console.log({ accessGranted });
    // }

    // Confirm access
    // const accessCheck = await hasAccessToCompany({
    //   userId: user.id,
    //   companyId: companyUUID,
    // });

    // console.log({ accessCheck });
    // if (!accessCheck.data?.hasAccess) {
    //   return errorResponse("You do not have access to this company");
    // }

    // // Update user's last active company
    // if (!company.is_demo_company) {
    //   await knexClient("users")
    //     .where("id", user.id)
    //     .update("last_active_company_id", companyUUID);
    // }

    // const userData = {
    //   sub: user.id,
    //   email: user.email,
    //   firstname: user.firstname,
    //   lastname: user.lastname,
    //   status: user.status,
    //   currentCompanyId: companyUUID,
    // };
    // console.log(userData);
    // // Generate new tokens reflecting the new active company
    // const { accessToken, refreshToken } = generateAuthTokens(userData);

    // // Store refresh token in Redis
    // await redis.sadd(`refreshTokens:${user.id}`, refreshToken);
    // await redis.expire(`refreshTokens:${user.id}`, 604800); // 7 days

    // const authContext = await buildAuthContext(userData);

    return successResponse('Company switched successfully', {
      // accessToken,
      // refreshToken,
      // user: authContext.user,
      // company: authContext.company,
    });
  } catch (error) {
    return errorResponse('Something went wrong', error);
  }
};

const companyFields = [
  'companies.short_code as id',
  'companies.legal_name as legalName',
  'companies.display_name as displayName',
  'companies.address as address',
  'companies.type as companyType',
  'companies.logo_url as companyLogo',
  'companies.logo_key as companyLogoKey',
  'companies.description as description',
  'companies.website as website',
  'companies.industry as industry',
  'companies.team_size as companySize',
  'companies.revenue as revenue',
  'companies.year_end_day as yearEndDay',
  'companies.year_end_month as yearEndMonth',
  'companies.registration_number as companyRegistrationNumber',
  'companies.tax_id as companyTaxId',
  'companies.country_id as countryId',
  'companies.created_by_id as createdById',
  'companies.created_at as createdAt',

  'countries.code as countryCode',
  'countries.name as countryName',
  'countries.phone_code as countryPhoneCode',
  'countries.flag as countryFlag',
  'countries.continent as countryContinent',

  'companies.reporting_framework as reportingFramework',
  'companies.accounting_basis as accountingBasis',
  'companies.onboarding_state as onboardingState',
  'companies.is_demo_company as isDemoCompany',

  'companies.reporting_currency_id as reportingCurrencyId',
  'currencies.code as reportingCurrencyCode',
  'currencies.name as reportingCurrencyName',
  'currencies.symbol as reportingCurrencySymbol',

  // accounting firm fields
  'companies.assigned_firm_id as assignedFirmId',
  'accounting_firms_meta.slug as assignedFirmSlug',
  'firm_meta.display_name as assignedFirmName',
  'firm_meta.is_platform as assignedFirmIsPlatform',
  'firm_meta.logo_url as assignedFirmLogo',
  'firm_meta.logo_key as assignedFirmLogoKey',
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
export const fetchCompanies = async ({ identifiers, filters }: FetchCompaniesOptions = {}): Promise<
  ApiResponse<GetCompanyResponse[]>
> => {
  try {
    const query = knexClient('companies')
      .select(companyFields)
      .leftJoin('countries', 'companies.country_id', 'countries.id')
      .leftJoin('currencies', 'companies.reporting_currency_id', 'currencies.id')
      .leftJoin(
        'accounting_firms_meta',
        'companies.assigned_firm_id',
        'accounting_firms_meta.company_id',
      )
      .leftJoin('companies as firm_meta', 'accounting_firms_meta.company_id', 'firm_meta.id'); // Get actual firm details from companies table (since firms are also companies)

    if (identifiers?.length) {
      const companyIds = [];

      for (const identifier of identifiers) {
        const companyId = await getCompanyUUID(identifier);
        if (!companyId) {
          return errorResponse(`Invalid company identifier: ${identifier}`, undefined, {
            code: ErrorCode.INVALID_CREDENTIALS,
          });
        }

        companyIds.push(companyId);
      }

      query.whereIn('companies.id', companyIds);
    }

    if (filters) {
      if (filters.companyType?.length) {
        if (filters.companyType.every((type) => companyType.options.includes(type))) {
          query.whereIn('companies.type', filters.companyType);
        } else {
          return errorResponse(`Invalid company type(s): ${filters.companyType}`);
        }
      }

      if (filters.country) {
        if (filters.country.length === 2) {
          query.where('countries.code', filters.country);
        } else {
          query.where('companies.country_id', filters.country);
        }
      }

      if (typeof filters.assignedFirm === 'string') {
        if (isValidUUID(filters.assignedFirm)) {
          query.where('companies.assigned_firm_id', filters.assignedFirm);
        } else if (filters.assignedFirm.length <= 20) {
          query.where('accounting_firms_meta.slug', filters.assignedFirm);
        } else {
          return errorResponse(`Invalid assigned firm identifier: ${filters.assignedFirm}`);
        }
      }

      if (typeof filters?.isDemoCompany !== 'undefined') {
        query.where('companies.is_demo_company', filters.isDemoCompany);
      } else {
        query.where('companies.is_demo_company', false); // Exclude demo companies by default
      }
    }

    const result = await query;

    if (!result || (Array.isArray(result) && result.length === 0)) {
      return errorResponse(
        `No ${identifiers?.length === 1 ? 'company matches' : 'companies match'} the provided input`,
      );
    }

    const data = snakeToCamel(result);

    return successResponse<GetCompanyResponse[]>(
      identifiers?.length === 1
        ? `Successfully retrieved company`
        : filters
          ? `Successfully retrieved filtered companies`
          : `Successfully retrieved all companies`,
      data as GetCompanyResponse[],
    );
  } catch (error: any) {
    return errorResponse('An unexpected error occured', error?.message);
  }
};

export const getCompanies = (options?: FetchCompaniesOptions) => fetchCompanies(options ?? {});

export const getCompaniesByIds = async (
  ids: string[],
): Promise<ApiResponse<GetCompanyResponse[]>> => {
  if (!ids || ids.length === 0) {
    return errorResponse('No company identifiers provided', null);
  }

  return fetchCompanies({ identifiers: ids });
};

export const getSingleCompany = async (id: string): Promise<ApiResponse<GetCompanyResponse>> => {
  const res = await fetchCompanies({ identifiers: [id] });
  console.log(res);
  if (!res.success || !res.data || res.data.length === 0) {
    return errorResponse(res.message, null);
  }

  return successResponse<GetCompanyResponse>('Successfully retrieved company', res.data[0]);
};

export const updateCompany = async (
  identifier: string,
  payload: UpdateCompanySchema,
  userId: string,
  trx?: Knex.Transaction,
): Promise<ApiResponse<GetCompanyResponse | null>> => {
  try {
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
          value === null || (typeof value === 'string' && value.trim() === '') ? null : value;
    }

    const fn = async (knex: Knex.Transaction) => {
      const companyId = await getCompanyUUID(identifier, knex);
      if (!companyId) {
        return errorResponse(`Invalid company identifier: ${identifier}`, undefined, {
          code: ErrorCode.NOT_FOUND,
        });
      }

      const baseRequiredFields = [
        'legal_name',
        'display_name',
        'short_code',
        'type',
        'year_end_day',
        'year_end_month',
        'country_id',
        'reporting_currency_id',
      ] as const;

      const [updatedRow] = await knex('companies')
        .update({ ...dbUpdates, last_updated_by_id: userId })
        .where('id', companyId)
        .returning([...baseRequiredFields, 'onboarding_state', 'id']);

      if (!updatedRow) {
        return errorResponse('Error updating company details');
      }

      if (
        updatedRow.type === 'accounting_firm' &&
        (validInput.data.slug || validInput.data.firmType)
      ) {
        await updateFirm(knex, companyId, {
          slug: validInput.data.slug,
          firm_type: validInput.data.firmType,
        });
      }

      // Query beyond this point should not break the transaction

      try {
        const bankAccounts = await knex('bank_accounts').where('company_id', companyId).first();

        // check if all the required field are filled from the db response
        const missingBaseFields = baseRequiredFields.filter(
          (field) => updatedRow[field as keyof typeof updatedRow] == null,
        );

        let finalOnboardingObject;

        if (missingBaseFields.length === 0) {
          const currentOnbStatus = updatedRow.onboarding_state;
          finalOnboardingObject = markCompanyOnboardingStepComplete(
            currentOnbStatus,
            'company_details_confirmed',
          );
        }

        if (bankAccounts?.id) {
          finalOnboardingObject = markCompanyOnboardingStepComplete(
            finalOnboardingObject,
            'first_bank_account_added',
          );
        }

        if (finalOnboardingObject) {
          await knex('companies')
            .where('id', companyId)
            .update({ onboarding_state: finalOnboardingObject });
        }
      } catch (error) {
        errorResponse('Error updating onboarding state:', error);
      }

      if (Object.keys(dbUpdates).length === 0) {
        return successResponse('Nothing to update – no valid fields supplied', null);
      }

      return successResponse('Successfully updated company details', null);
    };

    const result = trx ? await fn(trx) : knexClient.transaction((newTrx) => fn(newTrx));

    return result;
  } catch (error) {
    return errorResponse('Error updating company details', error, {
      report: true,
    });
  }
};
