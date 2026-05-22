import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { redis } from '../../lib/redis.js';
import { snakeToCamel } from '../../shared/utils/formatting.utils.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { isPlatformWorkspace } from '../companies/workspace-class.js';
import { newAccFirm } from './firms.types.js';
import {
  firmSlugRedisKey,
  isReservedSlug,
  isValidSlug,
} from './firms.utils.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type {
  AccFirmCamelResponse,
  AccFirmWithId,
  NewAccFirm,
} from './firms.types.js';

export const resolveFirm = async (
  trx: Knex.Transaction,
  firmId?: string,
): Promise<string> => {
  if (firmId) {
    const [verifyFirm] = await trx('accounting_firms_meta')
      .where('id', firmId)
      .select('id');

    if (verifyFirm) {
      return verifyFirm.id;
    }
  }

  const platformFirm = await trx('accounting_firms_meta as af')
    .join('companies as c', 'af.company_id', 'c.id')
    .where('c.workspace_class', 'platform')
    .select('af.id');

  if (!platformFirm || platformFirm.length > 1) {
    throw new Error('Unable to resolve firm to assign');
  }
  return platformFirm[0].id;
};

export const createAccountingFirm = async (
  knexTrx: Knex,
  input: NewAccFirm,
): Promise<ApiResponse<AccFirmWithId>> => {
  const validatedInput = newAccFirm.safeParse(input);

  if (!validatedInput.success) {
    return errorResponse('Invalid input', validatedInput.error.flatten());
  }
  const { data } = validatedInput;

  if (data.slug) {
    if (!isValidSlug(data.slug)) {
      return errorResponse('Invalid slug format');
    }
    if (isReservedSlug(data.slug)) {
      return errorResponse('Slug is reserved');
    }
  }

  try {
    const [newFirm] = await knexTrx('accounting_firms_meta')
      .insert(data)
      .returning('*');

    if (!newFirm) return errorResponse('Failed to create firm');
    const { company_id: id, ...rest } = newFirm;

    return successResponse('Accounting firm successfully created', {
      id,
      ...rest,
    });
  } catch (error) {
    return errorResponse('Unknown error occured', error);
  }
};

export const getSlugs = async (): Promise<ApiResponse<string[]>> => {
  try {
    const slugs = await knexClient('accounting_firms_meta')
      .pluck('slug')
      .whereNotNull('slug')
      .where('deleted_at', null)
      .where('is_deleted', false);

    if (!slugs || slugs.length === 0) {
      return errorResponse('No slugs found');
    }

    return successResponse('Slugs retrieved successfully', slugs);
  } catch (error) {
    return errorResponse('Error retrieving slugs', error);
  }
};

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Check if a slug is available for use
 * This is for signup/slug change flows
 */
export const checkSlugAvailability = async (
  slug: string,
): Promise<ApiResponse<{ isAvailable: boolean }>> => {
  if (!slug || typeof slug !== 'string')
    return errorResponse('Missing or invalid slug');

  if (!isValidSlug(slug)) return errorResponse('Invalid slug format');
  if (isReservedSlug(slug)) return errorResponse('Slug is reserved');

  try {
    // Only cache confirmed ownership, not availability
    const redisKey = `slug:taken:${slug}`;
    const isTaken = await redis.get(redisKey);

    if (isTaken)
      return successResponse('Slug is already taken', { isAvailable: false });

    // Check database
    const existingSlug = await knexClient('accounting_firms_meta')
      .where({ slug })
      .first();

    if (existingSlug) {
      // Cache that this slug is taken
      await redis.set(redisKey, 'true', 'EX', CACHE_TTL_SECONDS);
      return successResponse('Slug is already taken', { isAvailable: false });
    }

    return successResponse('Slug is available', { isAvailable: true });
  } catch (error) {
    return errorResponse('Error checking slug availability', error);
  }
};

export const updateFirm = async (
  trx: Knex.Transaction,
  id: string,
  data: Partial<NewAccFirm>,
): Promise<ApiResponse<AccFirmCamelResponse>> => {
  try {
    if (!id || typeof id !== 'string') {
      return errorResponse('Invalid or missing company ID');
    }

    if (!data || typeof data !== 'object') {
      return errorResponse('Nothing to update');
    }

    if (data.slug && isReservedSlug(data.slug)) {
      return errorResponse('Slug is reserved');
    }

    if (data.slug && !isValidSlug(data.slug)) {
      return errorResponse(
        'Invalid format. Slug must be 3-20 characters long, lowercase, and can contain hyphens.',
      );
    }

    const companyUUID = await getCompanyUUID(id, trx);
    if (!companyUUID) {
      throw new Error('Invalid company ID');
    }

    const [firm, company] = await Promise.all([
      trx('accounting_firms_meta').where('company_id', companyUUID).first(),
      trx('companies').where('id', companyUUID).first(),
    ]);

    if (!firm) {
      return errorResponse('Firm not found', null, {
        code: ErrorCode.NOT_FOUND,
      });
    }

    if (!company) {
      return errorResponse('Company not found', null, {
        code: ErrorCode.NOT_FOUND,
      });
    }

    if (isPlatformWorkspace(company.workspace_class)) {
      return errorResponse('Cannot update', null, {
        code: ErrorCode.FORBIDDEN,
      });
    }

    const validatedData = newAccFirm.partial().safeParse(data);
    if (!validatedData.success) {
      return errorResponse(validatedData.error.message);
    }

    const [updatedFirm] = await trx('accounting_firms_meta')
      .where({ company_id: companyUUID })
      .update(validatedData.data)
      .returning(['company_id', 'slug', 'firm_type']);

    const oldSlug = firm.slug;
    const newSlug = validatedData.data.slug || oldSlug;
    if (newSlug !== oldSlug) {
      const oldRedisKey = firmSlugRedisKey(oldSlug);
      const newRedisKey = firmSlugRedisKey(newSlug);

      await redis.del(oldRedisKey);
      await redis.set(newRedisKey, companyUUID, 'EX', 60 * 60 * 24);
    }

    const result = snakeToCamel(updatedFirm);
    return successResponse('Firm updated successfully', result);
  } catch (error) {
    return errorResponse('Internal server error', error);
  }
};

/**
 * Get the current slug for a company
 * This handles the complex join logic
 */
export const getCompanySlug = async (
  companyId: string,
): Promise<ApiResponse<{ slug: string | null }>> => {
  if (!companyId) {
    return errorResponse('Company ID is required');
  }

  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse('Invalid company ID');
    }

    // Check cache first
    const cacheKey = `company:slug:${companyUUID}`;
    const cachedSlug = await redis.get(cacheKey);

    if (cachedSlug) {
      return successResponse('Company slug retrieved', {
        slug: cachedSlug === 'NULL' ? null : cachedSlug,
      });
    }

    // Query with proper joins
    const result = await knexClient('companies')
      .join(
        'accounting_firms_meta',
        'companies.assigned_firm_id',
        'accounting_firms_meta.id',
      )
      .where('companies.id', companyUUID)
      .select('accounting_firms_meta.slug')
      .first();

    const slug = result?.slug || null;

    // Cache the result
    await redis.set(cacheKey, slug || 'NULL', 'EX', CACHE_TTL_SECONDS);

    return successResponse('Company slug retrieved', { slug });
  } catch (error) {
    return errorResponse('Error retrieving company slug', error);
  }
};

/**
 * Check if a slug is available AND if it's the company's current slug
 * This combines both functions for the specific use case where you need both pieces of info
 */
export const checkSlugForCompany = async ({
  slug,
  companyId,
}: {
  slug: string;
  companyId: string;
}): Promise<ApiResponse<{ isAvailable: boolean; isCurrent: boolean }>> => {
  // First check if slug is available
  const availabilityCheck = await checkSlugAvailability(slug);
  if (
    !availabilityCheck.success &&
    availabilityCheck.message !== 'Slug is already taken'
  ) {
    // Return validation errors (invalid format, reserved, etc.)
    return errorResponse(availabilityCheck.message || 'Slug validation failed');
  }

  const isAvailable = availabilityCheck.data?.isAvailable ?? false;

  // Then check if it's the company's current slug
  const companySlugResult = await getCompanySlug(companyId);
  if (!companySlugResult.success) {
    return errorResponse(
      companySlugResult.message || 'Failed to get company slug',
    );
  }

  const isCurrent = companySlugResult.data?.slug === slug;

  // If slug is taken but it's this company's current slug, that's fine
  const actuallyAvailable = isAvailable || isCurrent;

  return successResponse('Slug check completed', {
    isAvailable: actuallyAvailable,
    isCurrent,
  });
};
