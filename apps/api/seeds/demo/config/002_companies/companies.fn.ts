import type { Knex } from 'knex';

import { initializeCompanySettings } from '../../../../src/domains/settings/settings.service.js';
import type { DemoCompanyType, DemoFilter } from '../../shared/config.js';
import { COMPANY_TYPES } from '../../shared/config.js';
import { getDemoUserMap, resolveFiltersToIds } from '../../shared/utils.js';
import {
  DEMO_COMPANIES_IDS,
  generateDemoCompaniesMap,
} from './companies.data.js';

const completeOnbState = (companyType: DemoCompanyType) => {
  return {
    steps: {
      ...(companyType !== 'individual'
        ? { company_details_confirmed: true }
        : {}),
      first_bank_account_added: false,
    },
    completed_at: {},
  };
};

export const createDemoCompaniesAndUsers = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  const companiesMap = generateDemoCompaniesMap(filters);
  console.log('companiesMap', companiesMap.length);

  if (companiesMap.length === 0) {
    console.log('No companies to create based on filters');
    return;
  }

  // Get actual user IDs from database (users now have dynamic IDs)
  const userMap = await getDemoUserMap(trx);

  // Helper to get user ID safely
  const getUserId = (email: string) => {
    const userId = userMap.get(email);
    if (!userId) {
      throw new Error(`Demo user not found for email: ${email}`);
    }
    return userId;
  };

  /**
   * For each company,
   * - insert company (idempotent)
   * - if firm, insert accounting firm metadata (idempotent)
   * - In client_firm_assignments table; Assign company to platform firm, if firm, assign to the company itself (the one just inserted)
   * - Assign roles to user in user_company_roles table
   * ----for firm, assign role with key '"firm_owner"'
   * ----for others, asign role with key ""client_owner""

   */
  const data = companiesMap.map((item) => {
    const c = item.company;
    const isFirm =
      c.companyType === COMPANY_TYPES.ACCOUNTING_FIRM && 'slug' in c;
    if (c.companyType === COMPANY_TYPES.ACCOUNTING_FIRM && !('slug' in c)) {
      throw new Error('Accounting firm must have a slug');
    }
    return {
      c: {
        legal_name: c.name,
        display_name: c.name,
        short_code: c.shortCode,
        type: c.companyType,
        year_end_day: 31,
        year_end_month: 12,
        accounting_basis: c.accountingBasis ?? 'modified_cash_basis',
        reporting_framework: c.country.code === 'US' ? 'us_gaap' : 'ifrs',
        onboarding_state: completeOnbState(c.companyType),
        onboarding_completed_at: new Date(),
        is_demo_company: true,
        country_id: c.country.id,
        reporting_currency_id: c.currency.id,
        created_by_id: getUserId(c.createdBy.email),
        last_updated_by_id: getUserId(c.createdBy.email),
        default_timezone:
          c.country.code === 'NG'
            ? 'Africa/Lagos'
            : c.country.code === 'US'
              ? 'America/Adak'
              : undefined,
      },
      ...(isFirm
        ? {
            f: {
              slug: c.slug,
            },
          }
        : {}),
    };
  });

  // Insert companies with idempotency (ignore conflicts on short_code)
  const companiesToInsert = data.map((item) => item.c);
  const insertedCompanies = await trx('companies')
    .insert(companiesToInsert)
    .onConflict(['short_code'])
    .ignore()
    .returning('*');

  // Get all companies (including existing ones) for further processing
  const allShortCodes = companiesToInsert.map((c) => c.short_code);
  const existingCompanies = await trx('companies')
    .whereIn('short_code', allShortCodes)
    .select('*');

  // For accounting firms, insert metadata using the company ID (idempotent)
  const firmMetadataToInsert = data
    .map((item) => {
      const company = existingCompanies.find(
        (c) => c.short_code === item.c.short_code,
      );
      return { item, companyId: company?.id };
    })
    .filter(({ item, companyId }) => 'f' in item && companyId)
    .map(({ item, companyId }) => ({
      company_id: companyId,
      slug: (item as any).f.slug,
    }));

  if (firmMetadataToInsert.length > 0) {
    await trx('accounting_firms_meta')
      .insert(firmMetadataToInsert)
      .onConflict(['company_id'])
      .ignore();
  }

  // Get platform firm (first accounting firm in the system)
  const platformFirm = await trx('companies')
    .join(
      'accounting_firms_meta',
      'companies.id',
      'accounting_firms_meta.company_id',
    )
    .where('companies.type', 'accounting_firm')
    .where('companies.is_demo_company', false)
    .first();

  // Get role IDs for firm_owner and client_owner
  const roles = await trx('roles')
    .whereIn('key', ['firm_owner', 'client_owner'])
    .select('id', 'key');

  const roleMap = new Map(roles.map((r) => [r.key, r.id]));

  // Assign companies to platform firm and set up user roles (idempotent)
  const clientFirmAssignments: any[] = [];
  const userCompanyRoles: any[] = [];

  for (const company of existingCompanies) {
    const originalCompany = data.find(
      (d) => d.c.short_code === company.short_code,
    );
    if (!originalCompany) continue;

    const isFirm = company.type === COMPANY_TYPES.ACCOUNTING_FIRM;

    // Client firm assignments
    if (isFirm) {
      // Firm assigns itself
      clientFirmAssignments.push({
        client_company_id: company.id,
        accounting_firm_company_id: company.id,
        created_by_id: originalCompany.c.created_by_id,
      });
    } else if (platformFirm) {
      // Other companies assign to platform firm
      clientFirmAssignments.push({
        client_company_id: company.id,
        accounting_firm_company_id: platformFirm.id,
        created_by_id: originalCompany.c.created_by_id,
      });
    }

    // User company roles
    const roleKey = isFirm ? 'firm_owner' : 'client_owner';
    const roleId = roleMap.get(roleKey);

    if (roleId) {
      userCompanyRoles.push({
        user_id: originalCompany.c.created_by_id,
        company_id: company.id,
        role_id: roleId,
        created_by_id: originalCompany.c.created_by_id,
      });
    }
  }

  // Insert client firm assignments (idempotent)
  if (clientFirmAssignments.length > 0) {
    await trx('client_firm_assignments')
      .insert(clientFirmAssignments)
      .onConflict(['client_company_id'])
      .ignore();

    // Update assigned_firm_id for each company after successful client-firm assignment
    for (const assignment of clientFirmAssignments) {
      await trx('companies')
        .where({ id: assignment.client_company_id })
        .update({ assigned_firm_id: assignment.accounting_firm_company_id });
    }
  }

  // Insert user company roles (idempotent)
  if (userCompanyRoles.length > 0) {
    await trx('user_company_roles')
      .insert(userCompanyRoles)
      .onConflict(['user_id', 'company_id'])
      .ignore();
  }

  // Initialize default settings for all created/existing companies
  for (const company of existingCompanies) {
    const originalCompany = data.find(
      (d) => d.c.short_code === company.short_code,
    );
    if (!originalCompany) continue;

    try {
      await initializeCompanySettings({
        companyId: company.id,
        userId: originalCompany.c.created_by_id,
        trx,
      });
      console.log(`Settings initialized: ${company.short_code}`);
    } catch (error) {
      console.warn(
        `Settings init failed for ${company.short_code} (non-critical):`,
        error,
      );
      // Continue with other companies
    }
  }

  console.log(
    `Companies processed: ${insertedCompanies.length} inserted, ${existingCompanies.length - insertedCompanies.length} already existed`,
  );
};

export const deleteDemoCompanies = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  // Get demo companies to delete
  const shortCodes = filters
    ? resolveFiltersToIds(filters)
    : DEMO_COMPANIES_IDS;

  // Convert shortCodes to actual database IDs
  const companies = await trx('companies')
    .whereIn('short_code', shortCodes)
    .where('is_demo_company', true)
    .select('id');

  const companyIds = companies.map((c) => c.id);

  if (companyIds.length === 0) {
    console.log('No demo companies found to delete');
    return 0;
  }

  // Delete in proper order to handle foreign key constraints
  // 1. Delete accounting firm metadata
  await trx('accounting_firms_meta').whereIn('company_id', companyIds).delete();

  // 2. Delete user company roles
  await trx('user_company_roles').whereIn('company_id', companyIds).delete();

  // 3. Delete client firm assignments
  await trx('client_firm_assignments')
    .whereIn('client_company_id', companyIds)
    .delete();
  await trx('client_firm_assignments')
    .whereIn('accounting_firm_company_id', companyIds)
    .delete();

  // 4. Finally delete companies
  const result = await trx('companies').whereIn('id', companyIds).delete();

  return result;
};
