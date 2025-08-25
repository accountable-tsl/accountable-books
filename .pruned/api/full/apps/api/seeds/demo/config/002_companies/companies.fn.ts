import type { Knex } from 'knex';
import { createCompany } from '../../../../src/domains/companies/companies.model';
import { DEMO_COMPANIES_IDS, DemoCompany, generateDemoCompaniesMap } from './companies.data';
import {
  NewCompanyInput,
  NewCompanyInputCamel,
} from '../../../../src/domains/companies/companies.types';
import { COMPANY_TYPES, DemoFilter } from '../../shared/config';
import { createCompleteCompanyOnboardingState } from '../../../../src/features/onboarding/onboarding.utils';
import { NewUserInputCamel } from '../../../../src/domains/users/users.types';
import { registerNewAccount } from '../../../../src/features/signup/signup.service';
import { resolveFiltersToIds } from '../../shared/utils';

// export const createDemoCompanies = async (trx: Knex.Transaction, filters?: DemoFilter) => {
//   const companiesMap = generateDemoCompaniesMap(filters);

//   for (const item of companiesMap) {
//     const i = item.company;
//     const company: NewCompanyInput = {
//       id: i.id,
//       legal_name: i.name,
//       short_code: i.shortCode,
//       type: i.companyType,
//       reporting_currency_code: i.currencyCode,
//       country_code: i.countryCode,
//       ...(i.companyType === COMPANY_TYPES.ACCOUNTING_FIRM && 'slug' in i ? { slug: i.slug } : {}),
//       ...(i.companyType === COMPANY_TYPES.INDIVIDUAL
//         ? { accounting_basis: 'modified_cash_basis' }
//         : {}),
//       created_by_id: i.createdBy,
//       onboarding_state: createCompleteCompanyOnboardingState(i.companyType),
//       is_demo_company: true,
//     };

//     await createCompany({ company, transaction: trx });
//   }
// };

export const createDemoCompaniesAndUsers = async (trx: Knex.Transaction, filters?: DemoFilter) => {
  const companiesMap = generateDemoCompaniesMap(filters);

  for (const item of companiesMap) {
    const c = item.company;
    const company: NewCompanyInputCamel = {
      id: c.id,
      legalName: c.name,
      shortCode: c.shortCode,
      type: c.companyType,
      reportingCurrencyCode: c.currencyCode,
      countryCode: c.countryCode,
      ...(c.companyType === COMPANY_TYPES.ACCOUNTING_FIRM && 'slug' in c ? { slug: c.slug } : {}),
      ...(c.companyType === COMPANY_TYPES.INDIVIDUAL
        ? { accounting_basis: 'modified_cash_basis' }
        : {}),
      createdById: c.createdBy,
      onboardingState: createCompleteCompanyOnboardingState(c.companyType),
      isDemoCompany: true,
    };

    const u = item.user;
    const user: NewUserInputCamel = {
      id: u.id,
      firstname: u.firstname,
      lastname: u.lastname,
      email: u.email,
      password: u.password,
      isDemoUser: true,
    };

    await registerNewAccount({ company, user, trx });
  }
};

export const deleteDemoCompanies = async (trx: Knex.Transaction, filters?: DemoFilter) => {
  // Get demo companies to delete
  const companyIds = filters ? resolveFiltersToIds(filters) : DEMO_COMPANIES_IDS;

  // Delete in proper order to handle foreign key constraints
  // 1. Delete accounting firm metadata
  await trx('accounting_firms_meta').whereIn('company_id', companyIds).delete();

  // 2. Delete user company roles
  await trx('user_company_roles').whereIn('company_id', companyIds).delete();

  // 3. Delete client firm assignments
  await trx('client_firm_assignments').whereIn('client_company_id', companyIds).delete();
  await trx('client_firm_assignments').whereIn('accounting_firm_company_id', companyIds).delete();

  // 4. Finally delete companies
  const result = await trx('companies').where('is_demo_company', true).delete();

  return result;
};
