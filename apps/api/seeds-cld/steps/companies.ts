import type { Knex } from 'knex';
import type { SeedStep, SeedContext, MarkFunction } from '../utils/types.js';
import { upsertByKey } from '../utils/step-runner.js';
import { getCountryData } from '../data/countries/index.js';
import { getCompanyTypeData } from '../data/companies/index.js';

export const companiesStep: SeedStep = {
  id: 'companies',
  name: 'Companies and Users',
  version: 1,
  description: 'Creates demo companies and their associated users',
  dependencies: [],

  async up(knex: Knex, ctx: SeedContext, mark: MarkFunction): Promise<void> {
    const countryData = getCountryData(ctx.country!);
    const companyTypeData = getCompanyTypeData(ctx.companyType!);

    // Get country and currency records
    const country = await knex('countries').where('code', ctx.country).first();
    const currency = await knex('currencies').where('code', countryData.currency.code).first();

    if (!country) {
      throw new Error(`Country ${ctx.country} not found in database`);
    }
    if (!currency) {
      throw new Error(`Currency ${countryData.currency.code} not found in database`);
    }

    // Generate company data
    const companyGenerator = companyTypeData.generators.company;
    const companyData = companyGenerator.generate(ctx);

    // Create company
    const [company] = await upsertByKey(knex, 'companies', ['short_code'], {
      short_code: ctx.companyShortCode,
      legal_name: companyData.legalName,
      slug: companyData.slug,
      type: ctx.companyType,
      reporting_currency_id: currency.id,
      country_id: country.id,
      is_demo_company: true,
      year_end_month: 12,
      year_end_day: 31,
      onboarding_state: companyData.onboardingState,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await mark('companies', { id: company.id });

    // Store company ID in context for other steps
    ctx.companyId = company.id;

    // Generate user data
    const userGenerator = companyTypeData.generators.user;
    const userData = userGenerator.generate(ctx);

    // Create user
    const [user] = await upsertByKey(knex, 'users', ['email'], {
      email: userData.email,
      firstname: userData.firstName,
      lastname: userData.lastName,
      password: userData.hashedPassword,
      is_demo_user: true,
      email_verified_at: new Date(),
      onboarding_state: userData.onboardingState,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await mark('users', { id: user.id });

    // Create user-company relationship
    const [userCompanyRole] = await upsertByKey(
      knex,
      'user_company_roles',
      ['user_id', 'company_id'],
      {
        user_id: user.id,
        company_id: company.id,
        role: 'owner',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    );

    await mark('user_company_roles', { id: userCompanyRole.id, company_id: company.id });

    console.log(`✓ Created company: ${company.legal_name} (${company.short_code})`);
    console.log(`✓ Created user: ${user.firstname} ${user.lastname} (${user.email})`);
  },

  async down(knex: Knex, ctx: SeedContext): Promise<void> {
    // Deletion handled by generic artifact system
    console.log('Companies step cleanup handled by artifact system');
  },
};
