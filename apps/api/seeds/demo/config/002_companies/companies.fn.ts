import type { Knex } from 'knex';
import { createCompany } from '../../../../src/domains/companies/companies.model';
import { DemoCompany, generateDemoCompaniesMap } from './companies.data';
import { NewCompanyInput } from '../../../../src/domains/companies/companies.types';
import { COMPANY_TYPES, DemoFilter } from '../../shared/config';
import { createCompleteCompanyOnboardingState } from '../../../../src/features/onboarding/onboarding.utils';

export const createDemoCompanies = async (trx: Knex.Transaction, filters?: DemoFilter) => {
  const companiesMap = generateDemoCompaniesMap(filters);

  for (const item of companiesMap) {
    const i = item.company;
    const company: NewCompanyInput = {
      id: i.id,
      legal_name: i.name,
      short_code: i.shortCode,
      type: i.companyType,
      reporting_currency_code: i.currencyCode,
      country_code: i.countryCode,
      ...(i.companyType === COMPANY_TYPES.ACCOUNTING_FIRM && 'slug' in i ? { slug: i.slug } : {}),
      ...(i.companyType === COMPANY_TYPES.INDIVIDUAL
        ? { accounting_basis: 'modified_cash_basis' }
        : {}),
      created_by_id: i.createdBy,
      onboarding_state: createCompleteCompanyOnboardingState(i.companyType),
      is_demo_company: true,
    };

    await createCompany({ company, transaction: trx });
  }
};

export const deleteDemoCompanies = async (trx: Knex.Transaction, filters?: DemoFilter) => {
  const result = await trx('companies').where('is_demo_company', true).delete();
  return result;
};
