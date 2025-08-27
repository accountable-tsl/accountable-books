import type { Knex } from 'knex';
import type { DemoFilter } from '../shared/config.js';
import { DEMO_COMPANIES } from '../config/002_companies/companies.data.js';
import { resolveFiltersToIds } from '../shared/utils.js';

/**
 * Complete company ecosystem data from database
 */
export type CompanyEcosystemData = {
  companyId: string;
  companyName: string;
  companyType: string;
  countryCode: string;
  currencyCode: string;

  // User info
  userId: string;
  userEmail: string;

  // Related data (with IDs from database)
  contacts: Array<{
    id: string;
    displayName: string;
    email: string;
    status: string;
  }>;

  projects: Array<{
    id: string;
    name: string;
    code?: string;
    status: string;
    contactId: string;
  }>;
};

/**
 * Get complete company ecosystem data from database
 * This queries the database directly for the most up-to-date view
 */
export const getCompanyEcosystemData = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
): Promise<CompanyEcosystemData[]> => {
  // Determine which companies to query
  const targetCompanyIds = filters ? resolveFiltersToIds(filters) : DEMO_COMPANIES.map((c) => c.id);

  const ecosystemData: CompanyEcosystemData[] = [];

  for (const companyId of targetCompanyIds) {
    // Get company info
    const company = await trx('companies').where({ id: companyId }).first();

    if (!company) continue;

    // Get user info
    const user = await trx('users').where({ id: company.created_by_id }).first();

    // Get contacts for this company
    const contacts = await trx('contacts')
      .where({ company_id: companyId, is_deleted: false })
      .select('id', 'display_name as displayName', 'email', 'status');

    // Get projects for this company
    const projects = await trx('projects')
      .where({ company_id: companyId, is_deleted: false })
      .select('id', 'name', 'code', 'status', 'contact_id as contactId');

    ecosystemData.push({
      companyId: company.id,
      companyName: company.name,
      companyType: company.company_type,
      countryCode: company.country_code,
      currencyCode: company.currency_code,

      userId: user?.id || '',
      userEmail: user?.email || '',

      contacts: contacts || [],
      projects: projects || [],
    });
  }

  return ecosystemData;
};

/**
 * Get complete ecosystem data with automatic creation
 * Creates missing contacts and projects as needed
 */
export const getOrCreateCompanyEcosystemData = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
): Promise<CompanyEcosystemData[]> => {
  // Import the creation functions dynamically to avoid circular deps
  const { getOrCreateDemoContactsMap } = await import('../config/010_contacts/contacts.fn.js');
  const { getOrCreateDemoProjectsMap } = await import('../config/012_projects/projects.fn.js');

  // Ensure contacts exist
  await getOrCreateDemoContactsMap(trx, filters);

  // Ensure projects exist
  await getOrCreateDemoProjectsMap(trx, filters);

  // Now get the complete data from database
  return await getCompanyEcosystemData(trx, filters);
};
