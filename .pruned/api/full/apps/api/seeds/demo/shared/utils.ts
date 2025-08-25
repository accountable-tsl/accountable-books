import type { Knex } from 'knex';
import { DEMO_COMPANIES, DEMO_COMPANIES_IDS } from '../config/002_companies/companies.data.js';
import { DemoFilter } from './config.js';

export const resolveFiltersToIds = (f: DemoFilter): string[] => {
  if (!f) return [];

  const out = new Set<string>();

  // Filter by direct company IDs or shortCodes (validate they exist)
  if (f.companyIds?.length) {
    const validIds = new Set(DEMO_COMPANIES.map((c) => c.id));
    const shortCodeToId = new Map(DEMO_COMPANIES.map((c) => [c.shortCode, c.id]));

    for (const identifier of f.companyIds) {
      // Check if it's a direct ID match
      if (validIds.has(identifier)) {
        out.add(identifier);
      }
      // Check if it's a shortCode match
      else if (shortCodeToId.has(identifier)) {
        out.add(shortCodeToId.get(identifier)!);
      }
    }
  }

  // Filter by country codes
  if (f.countryCodes?.length) {
    for (const company of DEMO_COMPANIES) {
      if (f.countryCodes.includes(company.countryCode)) {
        out.add(company.id);
      }
    }
  }

  // Filter by company types
  if (f.companyTypes?.length) {
    for (const company of DEMO_COMPANIES) {
      if (f.companyTypes.includes(company.companyType)) {
        out.add(company.id);
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

  // Resolve company IDs from filters
  const companyIds = filters ? resolveFiltersToIds(filters) : DEMO_COMPANIES_IDS;
  if (requireFilters && companyIds.length === 0) return;

  if (before) await before();

  const qb = trx(table)
    .join('companies', `${table}.${targetCompanyIdCol}`, 'companies.id')
    .where('companies.is_demo_company', true);

  if (companyIds.length) {
    qb.whereIn('companies.id', companyIds);
  }

  if (dryRun) {
    const sql = qb.clone().clearSelect().delete().toSQL();
    return { sql: sql.sql, bindings: sql.bindings ?? [] };
  }

  await qb.delete();
  return;
};
