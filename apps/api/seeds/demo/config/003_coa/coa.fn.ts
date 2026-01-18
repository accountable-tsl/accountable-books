import type { Knex } from 'knex';

import type { DemoFilter } from '../../shared/config.js';
import { COMPANY_TYPES } from '../../shared/config.js';
import {
  deleteDemoData,
  getCompanyIdMap,
  getDemoUserMap,
} from '../../shared/utils.js';
import { generateDemoCompaniesMap } from '../002_companies/companies.data.js';

// Template options for business companies
const BUSINESS_TEMPLATES = [
  'biz:int_design:adv:code:v1',
  'biz:int_design:adv:nocode:v1',
  'biz:saas:basic:code:v1',
  'biz:none:basic:nocode:v1',
  'biz:saas:basic:nocode:v1',
];

// Template mapping based on company type
const getCoaTemplate = (companyType: string): string => {
  if (companyType === COMPANY_TYPES.INDIVIDUAL) {
    return 'ind:none:basic:nocode:v1';
  }

  if (companyType === COMPANY_TYPES.BUSINESS) {
    const randomIndex = Math.floor(Math.random() * BUSINESS_TEMPLATES.length);
    return BUSINESS_TEMPLATES[randomIndex];
  }

  if (companyType === COMPANY_TYPES.ACCOUNTING_FIRM) {
    return 'acc:prof:basic:code:v1';
  }

  throw new Error(`Unknown company type: ${companyType}`);
};

export const createDemoCoa = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  const companiesMap = generateDemoCompaniesMap(filters);

  if (companiesMap.length === 0) {
    console.log('No companies found for COA creation');
    return;
  }

  // Get company database IDs and user IDs
  const companyIdMap = await getCompanyIdMap(trx);
  const userMap = await getDemoUserMap(trx);

  // Helper to get user ID safely
  const getUserId = (email: string) => {
    const userId = userMap.get(email);
    if (!userId) {
      throw new Error(`Demo user not found for email: ${email}`);
    }
    return userId;
  };

  for (const item of companiesMap) {
    const company = item.company;
    const companyId = companyIdMap.get(company.shortCode);

    if (!companyId) {
      console.log(
        `Company ID not found for ${company.shortCode}, skipping COA creation`,
      );
      continue;
    }

    // Check if COA already exists for this company
    const existingCoa = await trx('coa')
      .where({ company_id: companyId })
      .first();

    if (existingCoa) {
      console.log(
        `COA already exists for company ${company.shortCode}, skipping`,
      );
      continue;
    }

    // Get the appropriate template
    const templateName = getCoaTemplate(company.companyType);

    // Fetch template entries
    const coaTemplate = await trx('coa_templates')
      .where('is_active', true)
      .where('template_name', templateName)
      .select(['code', 'name', 'description', 'account_type_id', 'locked']);

    if (!coaTemplate.length) {
      console.warn(
        `COA template '${templateName}' not found for company ${company.shortCode}`,
      );
      continue;
    }

    // Prepare COA entries for insertion
    const toInsert = coaTemplate.map((template) => ({
      code: template.code,
      name: template.name,
      account_type_id: template.account_type_id,
      description: template.description,
      is_active: true,
      currency_id: company.currency.id,
      company_id: companyId,
      created_by_id: getUserId(company.createdBy.email),
      locked: template.locked,
      source: 'template',
    }));

    // Insert COA entries with idempotency
    const insertedCoa = await trx('coa')
      .insert(toInsert)
      .onConflict()
      .ignore()
      .returning('id');

    console.log(
      `Created ${insertedCoa.length} COA entries for company ${company.shortCode} using template ${templateName}`,
    );
  }
};

export const deleteDemoCoa = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  await deleteDemoData({
    trx,
    table: 'coa',
    filters,
  });
};
