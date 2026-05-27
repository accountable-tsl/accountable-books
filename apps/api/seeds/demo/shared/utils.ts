import type { Knex } from 'knex';

import {
  DEMO_COMPANIES,
  DEMO_COMPANIES_IDS,
} from '../config/002_companies/companies.data.js';
import { type DemoFilter } from './config.js';

// In-memory cache for company data
let demoCompaniesCache: CompanyRecord[] | null = null;

// In-memory cache for account types
let accountTypesCache: AccountTypeRecord[] | null = null;

// In-memory cache for banks
let banksCache: BankRecord[] | null = null;

// In-memory cache for demo users
let demoUsersCache: DemoUserRecord[] | null = null;

type CompanyRecord = {
  id: string;
  short_code: string;
  workspace_class: 'demo';
};

type AccountTypeRecord = {
  id: string;
  key: string;
  label: string;
};

type BankRecord = {
  id: string;
  key: string;
  display_name: string;
};

type DemoUserRecord = {
  id: string;
  email: string;
  firstname: string;
  lastname: string;
};

export const resolveFiltersToIds = (f: DemoFilter): string[] => {
  if (!f) return [];

  const out = new Set<string>();

  // Filter by direct company IDs or shortCodes (validate they exist)
  if (f.companyIds?.length) {
    // const validIds = new Set(DEMO_COMPANIES.map((c) => c.id));
    const validShortCodes = new Set(DEMO_COMPANIES.map((c) => c.shortCode));

    for (const id of f.companyIds) {
      if (validShortCodes.has(id)) {
        out.add(id);
      }
    }
  }

  // Filter by country codes
  if (f.countryCodes?.length) {
    for (const company of DEMO_COMPANIES) {
      if (f.countryCodes.includes(company.country.code)) {
        out.add(company.shortCode);
      }
    }
  }

  // Filter by company types
  if (f.companyTypes?.length) {
    for (const company of DEMO_COMPANIES) {
      if (f.companyTypes.includes(company.companyType)) {
        out.add(company.shortCode);
      }
    }
  }

  return Array.from(out);
};

type DeleteDemoDataOpts = {
  trx: Knex.Transaction;
  table: string; // target table to delete from
  filters?: DemoFilter; // resolves to company IDs
  targetCompanyIdCol?: string; // column on target table that FKs to companies.id
  requireFilters?: boolean; // fail fast if no companyIds
  dryRun?: boolean; // return SQL instead of executing
  allowTables?: ReadonlyArray<string>; // optional whitelist for safety
  before?: () => Promise<void> | void; // optional pre-hook
};

export const deleteDemoData = async ({
  trx,
  table,
  filters,
  targetCompanyIdCol = 'company_id',
  requireFilters = true,
  dryRun = false,
  allowTables,
  before,
}: DeleteDemoDataOpts) => {
  //  Hard safety: table whitelist (future)
  if (allowTables && !allowTables.includes(table)) {
    throw new Error(`Deletion from table ${table} is not allowed`);
  }

  // Resolve company shortCodes from filters
  const shortCodes = filters
    ? resolveFiltersToIds(filters)
    : DEMO_COMPANIES_IDS;
  if (requireFilters && shortCodes.length === 0) return;

  if (before) await before();

  const qb = trx(table)
    .join('companies', `${table}.${targetCompanyIdCol}`, 'companies.id')
    .where('companies.workspace_class', 'demo');

  if (shortCodes.length) {
    qb.whereIn('companies.short_code', shortCodes);
  }

  if (dryRun) {
    const sql = qb.clone().clearSelect().delete().toSQL();
    return { sql: sql.sql, bindings: sql.bindings ?? [] };
  }

  await qb.delete();
  return;
};

/**
 * Fetch and cache all demo company data from database
 * This is the SINGLE source of truth for company data
 */
export const loadDemoCompanies = async (
  trx: Knex,
  refresh = false,
): Promise<CompanyRecord[]> => {
  if (!refresh && demoCompaniesCache) {
    return demoCompaniesCache;
  }

  demoCompaniesCache = (await trx('companies')
    .where('workspace_class', 'demo')
    .select('id', 'short_code', 'workspace_class')) as CompanyRecord[];

  return demoCompaniesCache;
};

/**
 * Get company ID mapping - uses cached data, loads if needed
 */
export const getCompanyIdMap = async (
  trx: Knex,
  refresh = false,
): Promise<Map<string, string>> => {
  const companies = await loadDemoCompanies(trx, refresh);
  return new Map(companies.map((c) => [c.short_code, c.id]));
};

/**
 * Get a single company ID by shortCode - uses cached data
 */
export const getCompanyId = async (
  trx: Knex,
  shortCode: string,
): Promise<string | undefined> => {
  const companies = await loadDemoCompanies(trx);
  const company = companies.find((c) => c.short_code === shortCode);
  return company?.id;
};

/**
 * Get filtered company IDs (actual database IDs, not shortCodes) - uses cached data
 */
export const getFilteredCompanyIds = async (
  trx: Knex,
  filters?: DemoFilter,
): Promise<string[]> => {
  const shortCodes = filters
    ? resolveFiltersToIds(filters)
    : DEMO_COMPANIES_IDS;
  const companies = await loadDemoCompanies(trx);

  return companies
    .filter((c) => shortCodes.includes(c.short_code))
    .map((c) => c.id);
};

/**
 * Get filtered demo company records - uses cached data
 */
export const getDemoCompanies = async (
  trx: Knex,
  filters?: DemoFilter,
): Promise<CompanyRecord[]> => {
  const shortCodes = filters
    ? resolveFiltersToIds(filters)
    : DEMO_COMPANIES_IDS;

  if (shortCodes.length === 0) {
    return [];
  }

  const companies = await loadDemoCompanies(trx);
  return companies.filter((c) => shortCodes.includes(c.short_code));
};

/**
 * Clear the company cache (useful for testing or when companies change)
 */
export const clearCompanyCache = (): void => {
  demoCompaniesCache = null;
};

/**
 * Fetch and cache all account types from database
 * This is the SINGLE source of truth for account type data
 */
export const loadAccountTypes = async (
  trx: Knex,
  refresh = false,
): Promise<AccountTypeRecord[]> => {
  if (!refresh && accountTypesCache) {
    return accountTypesCache;
  }

  accountTypesCache = (await trx('account_types').select(
    'id',
    'key',
    'label',
  )) as AccountTypeRecord[];

  return accountTypesCache;
};

/**
 * Get account type by key - uses cached data, loads if needed
 */
export const getAccountTypeByKey = async (
  trx: Knex,
  key: string,
): Promise<AccountTypeRecord | undefined> => {
  const accountTypes = await loadAccountTypes(trx);
  return accountTypes.find((at) => at.key === key);
};

/**
 * Get account type mapping - uses cached data, loads if needed
 */
export const getAccountTypeMap = async (
  trx: Knex,
  refresh = false,
): Promise<Map<string, string>> => {
  const accountTypes = await loadAccountTypes(trx, refresh);
  return new Map(accountTypes.map((at) => [at.key, at.id]));
};

/**
 * Clear the account types cache (useful for testing)
 */
export const clearAccountTypesCache = (): void => {
  accountTypesCache = null;
};

/**
 * Fetch and cache all banks from database
 */
export const loadBanks = async (
  trx: Knex,
  refresh = false,
): Promise<BankRecord[]> => {
  if (!refresh && banksCache) {
    return banksCache;
  }

  banksCache = (await trx('banks').select(
    'id',
    'key',
    'display_name',
  )) as BankRecord[];

  return banksCache;
};

/**
 * Get bank mapping - uses cached data
 */
export const getBankMap = async (
  trx: Knex,
  refresh = false,
): Promise<Map<string, string>> => {
  const banks = await loadBanks(trx, refresh);
  return new Map(banks.map((b) => [b.key, b.id]));
};

/**
 * Clear banks cache
 */
export const clearBanksCache = (): void => {
  banksCache = null;
};

/**
 * Fetch and cache all demo users from database
 */
export const loadDemoUsers = async (
  trx: Knex,
  refresh = false,
): Promise<DemoUserRecord[]> => {
  if (!refresh && demoUsersCache) {
    return demoUsersCache;
  }

  demoUsersCache = (await trx('users')
    .where('user_type', 'demo')
    .select('id', 'email', 'firstname', 'lastname')) as DemoUserRecord[];

  return demoUsersCache;
};

/**
 * Get demo user by email - uses cached data
 */
export const getDemoUserByEmail = async (
  trx: Knex,
  email: string,
): Promise<DemoUserRecord | undefined> => {
  const users = await loadDemoUsers(trx);
  return users.find((u) => u.email === email);
};

/**
 * Get demo user mapping - uses cached data
 */
export const getDemoUserMap = async (
  trx: Knex,
  refresh = false,
): Promise<Map<string, string>> => {
  const users = await loadDemoUsers(trx, refresh);
  return new Map(users.map((u) => [u.email, u.id]));
};

/**
 * Clear demo users cache
 */
export const clearDemoUsersCache = (): void => {
  demoUsersCache = null;
};

/**
 * Clear all caches
 */
export const clearAllCaches = (): void => {
  clearCompanyCache();
  clearAccountTypesCache();
  clearBanksCache();
  clearDemoUsersCache();
};
