import type { Knex } from 'knex';
import pino from 'pino';

import { knexClient } from '../../../db/knexClient.js';
import { redis } from '../../../lib/redis.js';
import { generateChecksumSync } from '../../../shared/index.js';

import type { CompanyContextCache } from './enrichment.types.js';

const logger = pino();

const CACHE_TTL_SECONDS = 86400; // 24 hours
const CACHE_KEY_PREFIX = 'company:banktx-enrichment';

/**
 * Build cache key for company context
 */
function getCacheKey(companyUUID: string): string {
  return `${CACHE_KEY_PREFIX}:${companyUUID}`;
}

/**
 * Get company context with caching
 * First checks Redis, then loads from DB if cache miss
 */
export async function getCompanyContext(
  companyUUID: string,
): Promise<CompanyContextCache> {
  const cacheKey = getCacheKey(companyUUID);

  try {
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug({ companyUUID }, 'Company context cache hit');
      return JSON.parse(cached);
    }

    // Cache miss - load from database
    logger.debug(
      { companyUUID },
      'Company context cache miss - loading from DB',
    );
    const context = await loadCompanyContextFromDB({ companyUUID });

    // Store in cache
    await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(context));
    logger.debug({ companyUUID }, 'Company context cached');

    return context;
  } catch (error) {
    logger.error({ error, companyUUID }, 'Error getting company context');
    throw error;
  }
}

/**
 * Load company context from database
 * Fetches company, currency, and fiscal year settings
 */
async function loadCompanyContextFromDB({
  companyUUID,
  snapshotVersion,
  trx,
}: {
  companyUUID: string;
  snapshotVersion?: string;
  trx?: Knex.Transaction;
}): Promise<CompanyContextCache> {
  const db = trx ?? knexClient;

  const company = await db('companies as c')
    .select(
      'c.id',
      'c.legal_name',
      'c.display_name',
      'c.type',
      'c.description',
      'c.website',
      'c.industry',
      'c.year_end_day',
      'c.year_end_month',
      'c.accounting_basis',
      'c.reporting_framework',
      'c.country_id',
      'c.default_timezone',
      'c.reporting_currency_id',
      'currencies.code as reporting_currency_code',
      'countries.code as country_code',
    )
    .leftJoin('countries', 'c.country_id', 'countries.id')
    .leftJoin('currencies', 'c.reporting_currency_id', 'currencies.id')
    .where({ 'c.id': companyUUID, 'c.is_deleted': false })
    .first();

  if (!company) {
    throw new Error(`Company not found: ${companyUUID}`);
  }

  // Get latest COA snapshot version
  const coaSnapshotQ = db('coa_snapshot_versions')
    .where({
      company_id: companyUUID,
      is_deleted: false,
    })
    .orderBy('created_at', 'desc');

  if (snapshotVersion) {
    coaSnapshotQ.where('snapshot_version', snapshotVersion);
  }

  const coaSnapshot = await coaSnapshotQ
    .select('id', 'snapshot_version', 'checksum')
    .first();

  if (!coaSnapshot || !coaSnapshot.id) {
    throw new Error(
      `Company COA snapshot not found: ${companyUUID} ${snapshotVersion ? `, version ${snapshotVersion}` : ''}`,
    );
  }

  const coa_snapshot_id = coaSnapshot.id;
  const coa_snapshot_version = coaSnapshot.snapshot_version;
  const coa_snapshot_checksum = coaSnapshot.checksum;
  const companySettingsChecksum = generateChecksumSync(
    {
      accounting_basis: company.accounting_basis,
      reporting_framework: company.reporting_framework,
      reporting_currency_id: company.reporting_currency_id,
      reporting_currency_code: company.reporting_currency_code,
      year_end_day: company.year_end_day,
      year_end_month: company.year_end_month,
      default_timezone: company.default_timezone,
      country_code: company.country_code,
      ...(company?.region_code ? { region_code: company.region_code } : {}),
      ...(company?.subregion_code
        ? { subregion_code: company.subregion_code }
        : {}),
      type: company.type,
    },
    { sortKeys: true },
  );

  const context: CompanyContextCache = {
    company_uuid: companyUUID || company.id,
    legal_name: company.legal_name,
    display_name: company.display_name,
    type: company.type,
    description: company.description,
    website: company.website,
    industry: company.industry,
    tags: [], // Default to empty array - tags column not yet in companies table
    accounting_basis: company.accounting_basis,
    reporting_framework: company.reporting_framework,
    country_id: company.country_id,
    country_code: company.country_code,
    ...(company?.region_code ? { region_code: company.region_code } : {}),
    ...(company?.subregion_code
      ? { subregion_code: company.subregion_code }
      : {}),
    reporting_currency_id: company.reporting_currency_id,
    reporting_currency_code: company.reporting_currency_code,
    year_end_day: company.year_end_day,
    year_end_month: company.year_end_month,
    default_timezone: company.default_timezone,
    company_settings_checksum: companySettingsChecksum,
    coa_snapshot_version,
    coa_snapshot_id,
    coa_snapshot_checksum,
    cached_at: new Date(),
  };

  return context;
}

/**
 * Invalidate company context cache
 * Call this when company settings change (COA, currency, basis, etc.)
 * Added to coa.model.ts file already
 */
export async function invalidateCompanyContext(
  companyId: string,
): Promise<void> {
  const cacheKey = getCacheKey(companyId);

  try {
    await redis.del(cacheKey);
    logger.info({ companyId }, 'Company context cache invalidated');
  } catch (error) {
    logger.error({ error, companyId }, 'Error invalidating company context');
    throw error;
  }
}

/**
 * Invalidate multiple company contexts (batch operation)
 */
export async function invalidateMultipleCompanyContexts(
  companyIds: string[],
): Promise<void> {
  if (companyIds.length === 0) return;

  const keys = companyIds.map(getCacheKey);

  try {
    await redis.del(...keys);
    logger.info(
      { count: companyIds.length },
      'Batch invalidated company contexts',
    );
  } catch (error) {
    logger.error(
      { error, count: companyIds.length },
      'Error invalidating multiple contexts',
    );
    throw error;
  }
}

/**
 * Warm up cache by pre-loading company context
 * Useful for batch operations
 */
export async function warmUpCompanyContext(
  companyId: string,
): Promise<CompanyContextCache> {
  return getCompanyContext(companyId);
}
