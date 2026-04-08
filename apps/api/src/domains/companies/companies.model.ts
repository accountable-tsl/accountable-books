import type { Knex } from 'knex';
import {
  getDefaultTimezoneForCountry,
  normalizeTimezoneId,
} from '@accountable-books/utils/timezone';
import z from 'zod';

import { NODE_ENV } from '../../config/env.js';
import { knexClient } from '../../db/knexClient.js';
import {
  type AuthUserContext,
  type DecodedToken,
} from '../../features/auth/auth.types.js';
import {
  buildAuthContext,
  generateAuthTokens,
} from '../../features/auth/auth.utils.js';
import {
  createInitialCompanyOnboardingState,
  markCompanyOnboardingStepComplete,
} from '../../features/onboarding/onboarding.utils.js';
import { redis } from '../../lib/redis.js';
import generateSecureShortCode, {
  shortCodelooksWeird,
} from '../../shared/utils/crypto.utils.js';
import {
  isValidUUID,
  snakeToCamel,
} from '../../shared/utils/formatting.utils.js';
import {
  logDatabaseOperation,
  logError,
  logger,
  logTiming,
} from '../../shared/utils/logger.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  AppError,
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { updateFirm } from '../accountingFirms/firms.model.js';
import {
  getCountryFromCode,
  getCountryFromId,
} from '../countries/countries.utils.js';
import { getCurrency } from '../currencies/currencies.utils.js';
import { enqueueFiscalCalendarGeneration } from '../reporting/fiscal-calendar/index.js';
import { initializeCompanySettings } from '../settings/settings.service.js';
import { writeCompanyProfileUpdatedAudit } from './companies.audit.js';
import {
  companyType,
  fieldToColumnMap,
  getCompanyResponse,
  newCompany,
  newCompanyInput,
  updateCompanySchema,
} from './companies.types.js';
import { companyNullableStringsEqual } from './companies.utils.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type {
  AuditActorInput,
  AuditContextInput,
} from '../audit/audit.types.js';
import type {
  FetchCompaniesOptions,
  GetCompanyResponse,
  NewCompany,
  NewCompanyInput,
  UpdateCompanySchema,
} from './companies.types.js';

function companyAuditValuesEqual(a: unknown, b: unknown): boolean {
  if (
    typeof a === 'string' ||
    typeof b === 'string' ||
    a == null ||
    b == null
  ) {
    return companyNullableStringsEqual(a, b);
  }

  return a === b;
}

function toAuditValue(value: unknown): unknown | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  return value;
}

/**
 * Map a flat SQL row (plus camelCase keys) to the public company DTO.
 * Strips internal `*VerifiedAt` columns into nested `verification`.
 * Uses getCompanyResponse.safeParse so responses match the contract (instead of casting).
 *
 * On failure: throws AppError — fetchCompanies should surface this (see catch block).
 */
function mapQueryRowToGetCompanyResponse(
  row: Record<string, unknown>,
): GetCompanyResponse {
  const {
    legalNameVerifiedAt,
    addressVerifiedAt,
    registrationNumberVerifiedAt,
    taxIdVerifiedAt,
    ...rest
  } = row;

  // DB: `companies_tz_chk` uses pg_timezone_names. Wire DTO: `companyResponse.defaultTimezone`
  // is validated with Intl (see @accountable-books/contracts). `normalizeTimezoneId` maps
  // aliases to canonical zone ids before safeParse so rows stay compatible with both.
  const defaultTimezone =
    normalizeTimezoneId(
      typeof rest.defaultTimezone === 'string' ? rest.defaultTimezone : null,
    ) ?? 'Etc/UTC';

  const candidate = {
    ...rest,
    defaultTimezone,
    verification: {
      legalName: { verifiedAt: legalNameVerifiedAt },
      address: { verifiedAt: addressVerifiedAt },
      registrationNumber: { verifiedAt: registrationNumberVerifiedAt },
      taxId: { verifiedAt: taxIdVerifiedAt },
    },
  };

  const parsed = getCompanyResponse.safeParse(candidate);
  if (!parsed.success) {
    logger.error(
      { issues: z.flattenError(parsed.error), keys: Object.keys(candidate) },
      'Company row failed getCompanyResponse validation',
    );
    throw new AppError(
      'Invalid company data shape',
      parsed.error.flatten(),
      true,
    );
  }
  return parsed.data;
}

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

    exists = !!(await trx('companies')
      .where({ short_code: shortCode })
      .first());
    attempts++;

    // If we provided a specific short_code and it exists, fail immediately
    if (providedShortCode && exists) {
      operationLogger.warn(
        { providedShortCode },
        'Provided short code already exists',
      );
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

  if (!validateInput.data.created_by_id) {
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
    default_timezone,
    ...rest
  } = validateInput.data;

  const resolvedCountry = country_code
    ? await getCountryFromCode(country_code)
    : country_id
      ? await getCountryFromId(country_id)
      : undefined;

  const countryId = country_id ?? resolvedCountry?.id;
  const countryCode = country_code ?? resolvedCountry?.code;

  const reportingCurrencyId = reporting_currency_id
    ? reporting_currency_id
    : reporting_currency_code &&
      (await getCurrency(reporting_currency_code)).id;

  const timezone =
    normalizeTimezoneId(default_timezone) ??
    getDefaultTimezoneForCountry(countryCode);
  const sanitizedData = {
    ...rest,
    legal_name: rest.legal_name,
    display_name: rest.display_name || rest.legal_name,
    reporting_currency_id: reportingCurrencyId,
    country_id: countryId,
    ...(timezone ? { default_timezone: timezone } : {}),
  };

  const { assigned_firm_id } = sanitizedData;

  // Execute company creation within the provided transaction
  try {
    // Verify user exists and has permission
    logDatabaseOperation('SELECT', 'users', {
      userId: validateInput.data.created_by_id,
    });
    const userExists = await trx('users')
      .where({ id: validateInput.data.created_by_id })
      .first();

    if (!userExists) {
      const authError = `Non-existent user attempting to create company`;
      companyLogger.warn(
        { userId: validateInput.data.created_by_id },
        authError,
      );
      throw new AppError(
        'Unauthorized',
        `${authError}: ${sanitizedData.legal_name} with userId: ${validateInput.data.created_by_id}`,
        true,
      );
    }

    companyLogger.debug(
      { userId: userExists.id },
      'User authorization verified',
    );

    // Resolve firm assignment
    let firmId = assigned_firm_id || null;
    if (!firmId) {
      logDatabaseOperation('SELECT', 'accounting_firms_meta', {
        isPlatform: true,
      });
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
      validateInput.data.short_code,
      companyLogger,
    );
    companyLogger.debug(
      { shortCode, attempts },
      'Short code generated successfully',
    );

    // Prepare company data with defaults
    const onboardingState =
      sanitizedData.onboarding_state ||
      createInitialCompanyOnboardingState(sanitizedData.type);

    // Determine fiscal year-end defaults based on country and company type
    // UK individuals: April 5 (tax year end)
    // All others: December 31
    let defaultYearEndMonth = 12;
    let defaultYearEndDay = 31;

    if (country_code === 'GB' && sanitizedData.type === 'individual') {
      defaultYearEndMonth = 4;
      defaultYearEndDay = 5;
      companyLogger.debug(
        { countryCode: country_code, companyType: sanitizedData.type },
        'Using UK individual fiscal year-end (April 5)',
      );
    }

    const companyData = {
      ...sanitizedData,
      ...(sanitizedData.id ? { id: sanitizedData.id } : {}),
      ...(sanitizedData.is_demo_company
        ? { is_demo_company: sanitizedData.is_demo_company }
        : {}),
      legal_name: sanitizedData.legal_name,
      display_name: sanitizedData.display_name,
      short_code: shortCode,
      year_end_day: sanitizedData.year_end_day || defaultYearEndDay,
      year_end_month: sanitizedData.year_end_month || defaultYearEndMonth,
      reporting_framework: sanitizedData.reporting_framework || 'ifrs',
      created_by_id: userExists.id,
      last_updated_by_id: userExists.id,
      accounting_basis: sanitizedData.accounting_basis ?? 'modified_cash_basis',
      is_demo_company: sanitizedData.is_demo_company || false,
      industry:
        sanitizedData.industry ||
        (sanitizedData.type === 'accounting_firm'
          ? 'professional_services'
          : null),
      onboarding_state: onboardingState,
    };

    // Insert company record
    logDatabaseOperation('INSERT', 'companies', {
      legalName: sanitizedData.legal_name,
      shortCode,
    });
    const [company] = await trx('companies').insert(companyData).returning('*');

    if (!company?.id) {
      const insertError =
        'Failed to create company record - no company returned';
      companyLogger.error(insertError);
      throw new AppError(insertError);
    }

    companyLogger.info(
      { companyId: company.id },
      'Company record created successfully',
    );

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

    companyLogger.info(
      { companyId: company.id, firmId },
      'Company assigned to firm successfully',
    );

    // Enqueue fiscal calendar generation (very fast, ~10ms)
    // Don't fail company creation if calendar generation fails
    try {
      await enqueueFiscalCalendarGeneration({
        type: 'generate-calendar',
        companyId: company.id,
        yearsBack: 2,
        yearsForward: 10,
        triggeredBy: 'company_creation',
        userId: userExists.id,
      });
      companyLogger.info(
        { companyId: company.id },
        'Fiscal calendar generation job enqueued',
      );
    } catch (error) {
      companyLogger.error(
        {
          companyId: company.id,
          error: error instanceof Error ? error : new Error(String(error)),
        },
        'Failed to enqueue fiscal calendar generation (non-critical)',
      );
      // Non-critical: Calendar can be generated manually later if needed
    }

    // Initialize default company settings
    // Don't fail company creation if settings initialization fails
    try {
      const settingsResult = await initializeCompanySettings({
        companyId: company.id,
        userId: userExists.id,
        trx,
      });

      if (settingsResult.success) {
        companyLogger.info(
          { companyId: company.id },
          'Default company settings initialized',
        );
      } else {
        companyLogger.warn(
          { companyId: company.id, error: settingsResult.message },
          'Settings initialization returned error (non-critical)',
        );
      }
    } catch (error) {
      companyLogger.error(
        {
          companyId: company.id,
          error: error instanceof Error ? error : new Error(String(error)),
        },
        'Failed to initialize company settings (non-critical)',
      );
      // Non-critical: Settings will use defaults from registry until explicitly set
    }

    // Validate and return company data
    const companyDataValidation = newCompany.safeParse(company);
    const finalCompanyData = companyDataValidation.success
      ? companyDataValidation.data
      : company;

    logTiming('createCompany', startTime, {
      companyId: company.id,
      operationId,
    });

    companyLogger.info(
      { companyId: company.id },
      'Company creation completed successfully',
    );
    return successResponse('Company created successfully', finalCompanyData);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
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
      NODE_ENV === 'production' ? undefined : error,
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

  if (!currency)
    throw new Error(`Currency ${input.reportingCurrencyId} not found`);
  if (!country) throw new Error(`Country ${input.countryId} not found`);
};

export const switchCompany = async (
  { user, newCompanyId }: { user: AuthUserContext; newCompanyId: string }, // The company they wish to switch to
): Promise<ApiResponse<any>> => {
  try {
    const companyUUID = await getCompanyUUID(newCompanyId);
    // Get company details
    const company = await knexClient('companies')
      .select('short_code')
      .where({ is_deleted: false, id: companyUUID })
      .first();

    if (!company) {
      return errorResponse('Company not found');
    }

    // Update user's last active company

    const [u] = await knexClient('users')
      .where({ id: user.id })
      .update({ last_active_company_id: companyUUID })
      .returning('*');

    if (!u) throw new Error('User not found');

    const userData: DecodedToken = {
      sub: u.id,
      email: u.email,
      firstname: u.firstname,
      lastname: u.lastname,
      currentCompanyId: company.short_code,
      emailVerifiedAt: u.emailVerifiedAt,
      onboardingState: u.onboardingState,
    };

    // Generate new tokens reflecting the new active company
    const { accessToken, refreshToken } = generateAuthTokens(userData);

    // Store refresh token in Redis
    await redis.sadd(`refreshTokens:${user.id}`, refreshToken);
    await redis.expire(`refreshTokens:${user.id}`, 604800); // 7 days

    const authContext = await buildAuthContext(userData);
    if (!authContext.success || !authContext.data) {
      return errorResponse(authContext.message);
    }

    return successResponse('Company switched successfully', {
      accessToken,
      refreshToken,
      user: authContext.data.user,
      company: authContext.data.activeCompany,
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
  'company_logo_file.url as companyLogo',
  'company_logo_file.key as companyLogoKey',
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
  'companies.is_platform as isPlatform',

  'companies.default_timezone as defaultTimezone',
  'companies.legal_name_verified_at as legalNameVerifiedAt',
  'companies.registration_number_verified_at as registrationNumberVerifiedAt',
  'companies.tax_id_verified_at as taxIdVerifiedAt',
  'companies.address_verified_at as addressVerifiedAt',

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
export const fetchCompanies = async (
  { identifiers, filters }: FetchCompaniesOptions = {},
  db: Knex | Knex.Transaction = knexClient,
): Promise<ApiResponse<GetCompanyResponse[]>> => {
  try {
    const query = db('companies')
      .select(companyFields)
      .leftJoin('countries', 'companies.country_id', 'countries.id')
      .leftJoin('files as company_logo_file', function joinCompanyLogoFile() {
        this.on('companies.logo_file_id', '=', 'company_logo_file.id').andOn(
          'company_logo_file.is_deleted',
          '=',
          db.raw('false'),
        );
      })
      .leftJoin(
        'currencies',
        'companies.reporting_currency_id',
        'currencies.id',
      )
      .leftJoin(
        'accounting_firms_meta',
        'companies.assigned_firm_id',
        'accounting_firms_meta.company_id',
      )
      .leftJoin(
        'companies as firm_meta',
        'accounting_firms_meta.company_id',
        'firm_meta.id',
      ); // Get actual firm details from companies table (since firms are also companies)

    if (identifiers?.length) {
      const companyIds = [];

      for (const identifier of identifiers) {
        const companyId = await getCompanyUUID(identifier, db);

        companyIds.push(companyId);
      }

      query.whereIn('companies.id', companyIds);
    }

    if (filters) {
      if (filters.companyType?.length) {
        if (
          filters.companyType.every((type) =>
            companyType.options.includes(type),
          )
        ) {
          query.whereIn('companies.type', filters.companyType);
        } else {
          return errorResponse(
            `Invalid company type(s): ${filters.companyType}`,
          );
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
          return errorResponse(
            `Invalid assigned firm identifier: ${filters.assignedFirm}`,
          );
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

    const camelRows = snakeToCamel(result) as Record<string, unknown>[];
    const data = camelRows.map((row) => mapQueryRowToGetCompanyResponse(row));

    return successResponse<GetCompanyResponse[]>(
      identifiers?.length === 1
        ? `Successfully retrieved company`
        : filters
          ? `Successfully retrieved filtered companies`
          : `Successfully retrieved all companies`,
      data,
    );
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.details, {
        code: error.code,
        report: error.shouldReport,
      });
    }
    const message =
      error instanceof Error ? error.message : 'An unexpected error occured';
    return errorResponse('An unexpected error occured', message);
  }
};

export const getCompanies = (options?: FetchCompaniesOptions) =>
  fetchCompanies(options ?? {});

export const getCompaniesByIds = async (
  ids: string[],
): Promise<ApiResponse<GetCompanyResponse[]>> => {
  if (!ids || ids.length === 0) {
    return errorResponse('No company identifiers provided', null);
  }

  return fetchCompanies({ identifiers: ids });
};

export const getSingleCompany = async (
  id: string,
  db?: Knex | Knex.Transaction,
): Promise<ApiResponse<GetCompanyResponse>> => {
  const res = await fetchCompanies({ identifiers: [id] }, db);
  if (!res.success || !res.data || res.data.length === 0) {
    return errorResponse(res.message, res.error, {
      code: res.code as ErrorCode | undefined,
    });
  }

  return successResponse<GetCompanyResponse>(
    'Successfully retrieved company',
    res.data[0],
  );
};

export const updateCompany = async (
  identifier: string,
  payload: UpdateCompanySchema,
  userId: string,
  trx?: Knex.Transaction,
  options?: {
    audit?: {
      actor: AuditActorInput;
      context?: AuditContextInput;
    };
  },
): Promise<ApiResponse<GetCompanyResponse>> => {
  try {
    const validInput = updateCompanySchema.safeParse(payload);
    if (!validInput.success) {
      return errorResponse('Invalid input', validInput.error.flatten(), {
        code: ErrorCode.INVALID_INPUT,
      });
    }

    const dbUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(validInput.data)) {
      if (value === undefined) continue;
      const column = fieldToColumnMap[key as keyof typeof fieldToColumnMap];
      if (column) dbUpdates[column] = value;
    }

    const fn = async (
      knex: Knex.Transaction,
    ): Promise<ApiResponse<GetCompanyResponse>> => {
      const companyId = await getCompanyUUID(identifier, knex);
      const auditChanges: Record<
        string,
        { previous: unknown | null; next: unknown | null }
      > = {};
      const clearedVerification: string[] = [];

      // Verified-field locks: there is intentionally no platform bypass in this
      // general update flow. Any future override should use a dedicated internal
      // path with explicit authorization and audit logging.
      //
      // Address is intentionally omitted: address_verified_at is informational
      // only, and PATCH may always update address.
      const existing = await knex('companies')
        .select(
          'type',
          'address',
          'legal_name',
          'registration_number',
          'tax_id',
          'display_name',
          'description',
          'website',
          'industry',
          'team_size',
          'revenue',
          'year_end_day',
          'year_end_month',
          'country_id',
          'reporting_currency_id',
          'reporting_framework',
          'accounting_basis',
          'assigned_firm_id',
          'default_timezone',
          'address_verified_at',
          'legal_name_verified_at',
          'registration_number_verified_at',
          'tax_id_verified_at',
        )
        .where('id', companyId)
        .first();

      if (!existing)
        return errorResponse<GetCompanyResponse>(
          `Invalid company identifier: ${identifier}`,
          undefined,
          {
            code: ErrorCode.NOT_FOUND,
          },
        );

      const p = validInput.data;
      if (
        existing.legal_name_verified_at != null &&
        p.legalName !== undefined &&
        !companyNullableStringsEqual(p.legalName, existing.legal_name)
      ) {
        return errorResponse(
          'Legal name is verified and cannot be changed',
          undefined,
          { code: ErrorCode.OPERATION_NOT_ALLOWED },
        );
      }
      if (
        existing.registration_number_verified_at != null &&
        p.companyRegistrationNumber !== undefined &&
        !companyNullableStringsEqual(
          p.companyRegistrationNumber,
          existing.registration_number,
        )
      ) {
        return errorResponse(
          'Registration number is verified and cannot be changed',
          undefined,
          { code: ErrorCode.OPERATION_NOT_ALLOWED },
        );
      }
      if (
        existing.tax_id_verified_at != null &&
        p.companyTaxId !== undefined &&
        !companyNullableStringsEqual(p.companyTaxId, existing.tax_id)
      ) {
        return errorResponse(
          'Tax ID is verified and cannot be changed',
          undefined,
          { code: ErrorCode.OPERATION_NOT_ALLOWED },
        );
      }

      const didChangeAddress =
        p.address !== undefined &&
        !companyNullableStringsEqual(p.address, existing.address);
      if (didChangeAddress) {
        dbUpdates.address_verified_at = null;
        if (existing.address_verified_at != null) {
          clearedVerification.push('address');
        }
      }

      for (const [field, nextValue] of Object.entries(validInput.data)) {
        if (
          nextValue === undefined ||
          field === 'slug' ||
          field === 'firmType'
        ) {
          continue;
        }

        const column = fieldToColumnMap[field as keyof typeof fieldToColumnMap];
        if (!column) continue;

        const previousValue = existing[column];
        const resolvedNextValue =
          dbUpdates[column] !== undefined ? dbUpdates[column] : nextValue;

        if (!companyAuditValuesEqual(previousValue, resolvedNextValue)) {
          auditChanges[field] = {
            previous: toAuditValue(previousValue),
            next: toAuditValue(resolvedNextValue),
          };
        }
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
      const shouldUpdateFirm =
        existing.type === 'accounting_firm' &&
        (p.slug !== undefined || p.firmType !== undefined);
      const existingFirmMeta = shouldUpdateFirm
        ? await knex('accounting_firms_meta')
            .select('slug', 'firm_type')
            .where('company_id', companyId)
            .first()
        : null;

      let didUpdateCompanyRow = false;

      if (Object.keys(dbUpdates).length > 0) {
        const [updatedRow] = await knex('companies')
          .update({ ...dbUpdates, last_updated_by_id: userId })
          .where('id', companyId)
          .returning([...baseRequiredFields, 'onboarding_state', 'id']);

        if (!updatedRow) {
          return errorResponse<GetCompanyResponse>(
            'Error updating company details',
          );
        }
        didUpdateCompanyRow = true;

        // Query beyond this point should not break the transaction

        try {
          const bankAccounts = await knex('bank_accounts')
            .where('company_id', companyId)
            .first();

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
      }

      if (shouldUpdateFirm) {
        if (
          p.slug !== undefined &&
          !companyAuditValuesEqual(existingFirmMeta?.slug, p.slug)
        ) {
          auditChanges.slug = {
            previous: toAuditValue(existingFirmMeta?.slug),
            next: toAuditValue(p.slug),
          };
        }

        if (
          p.firmType !== undefined &&
          !companyAuditValuesEqual(existingFirmMeta?.firm_type, p.firmType)
        ) {
          auditChanges.firmType = {
            previous: toAuditValue(existingFirmMeta?.firm_type),
            next: toAuditValue(p.firmType),
          };
        }

        const firmResult = await updateFirm(knex, companyId, {
          slug: p.slug,
          firm_type: p.firmType,
        });

        if (!firmResult.success) {
          return errorResponse(firmResult.message, firmResult.error, {
            code: firmResult.code as ErrorCode | undefined,
          });
        }
      }

      if (
        options?.audit?.actor &&
        (Object.keys(auditChanges).length > 0 || clearedVerification.length > 0)
      ) {
        await writeCompanyProfileUpdatedAudit({
          companyId,
          entityId: companyId,
          actor: options.audit.actor,
          context: options.audit.context,
          trx: knex,
          payload: {
            changedFields: auditChanges,
            clearedVerification,
          },
        });
      }

      const refreshedCompany = await getSingleCompany(companyId, knex);
      if (!refreshedCompany.success || !refreshedCompany.data) {
        return errorResponse(refreshedCompany.message, refreshedCompany.error, {
          code: refreshedCompany.code as ErrorCode | undefined,
        });
      }

      return successResponse(
        !didUpdateCompanyRow && !shouldUpdateFirm
          ? 'Nothing to update – no valid fields supplied'
          : 'Successfully updated company details',
        refreshedCompany.data,
      );
    };

    const result = trx
      ? await fn(trx)
      : knexClient.transaction((newTrx) => fn(newTrx));

    return result;
  } catch (error) {
    return errorResponse('Error updating company details', error, {
      report: true,
    });
  }
};
