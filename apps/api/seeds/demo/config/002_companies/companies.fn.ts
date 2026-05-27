import type { Knex } from 'knex';

import {
  provisionCompanyWorkspace,
  reconcileCompanyWorkspace,
} from '../../../../src/domains/companies/company-provisioning.service.js';
import { COMPANY_TYPES } from '../../shared/config.js';
import { getDemoUserMap, resolveFiltersToIds } from '../../shared/utils.js';
import {
  DEMO_COMPANIES_IDS,
  generateDemoCompaniesMap,
} from './companies.data.js';

import type { DemoCompanyType, DemoFilter } from '../../shared/config.js';

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
        reporting_framework:
          c.country.code === 'US' ? ('us_gaap' as const) : ('ifrs' as const),
        onboarding_state: completeOnbState(c.companyType),
        onboarding_completed_at: new Date(),
        workspace_class: 'demo' as const,
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

  let insertedCount = 0;
  let reconciledCount = 0;

  for (const item of data) {
    const existing = await trx('companies')
      .where({ short_code: item.c.short_code })
      .first<{ id: string }>('id');

    const creator = await trx('users')
      .where({ id: item.c.created_by_id })
      .select('email')
      .first<{ email: string }>();

    if (!creator?.email) {
      throw new Error(
        `Demo user email not found for company ${item.c.short_code}`,
      );
    }

    const provisioningInput = {
      trx,
      actorUserId: item.c.created_by_id,
      ownerUserId: item.c.created_by_id,
      billingEmail: creator.email,
      policy: { kind: 'demo' } as const,
      company: {
        ...item.c,
        ...(item.f ? { slug: item.f.slug } : {}),
        skip_side_effects: true,
      },
    };

    if (existing?.id) {
      await reconcileCompanyWorkspace({
        ...provisioningInput,
        companyId: existing.id,
      });
      reconciledCount++;
    } else {
      await provisionCompanyWorkspace(provisioningInput);
      insertedCount++;
    }
  }

  console.log(
    `Companies processed: ${insertedCount} inserted, ${reconciledCount} reconciled`,
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
    .where('workspace_class', 'demo')
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
