import type { Knex } from 'knex';
import { registerNewAccount } from '../../../src/features/signup/signup.service.js';
import type { MarkFn, SeedCtx } from '../old_engine/helpers.js';
import { upsertByKey } from '../old_engine/helpers.js';

export async function up(knex: Knex, ctx: SeedCtx, mark: MarkFn) {
  const { user, company } = ctx as any;

  // If either exists, upsert baseline to prevent drift. Else, create both.
  const existingCompany = await knex('companies')
    .select('id')
    .where({ short_code: company.shortCode })
    .first();
  const existingUser = await knex('users').select('id').where({ email: user.email }).first();

  if (existingCompany && existingUser) {
    await knex.transaction(async (trx) => {
      await upsertByKey(trx, 'companies', ['short_code'], {
        short_code: company.shortCode,
        legal_name: company.legalName,
        type: company.type,
        reporting_currency_id: company.reportingCurrencyId,
        country_id: company.countryId,
        is_demo_company: true,
        year_end_day: company.yearEndDay,
        year_end_month: company.yearEndMonth,
        onboarding_state: company.onboardingState,
        accounting_basis:
          company.type === 'individual' ? 'modified_cash_basis' : 'modified_accrual_basis',
        created_by_id: existingUser.id,
        last_updated_by_id: existingUser.id,
      } as any);
      await upsertByKey(trx, 'users', ['email'], {
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname,
        is_demo_user: true,
        email_verified_at: user.emailVerifiedAt,
        onboarding_state: user.onboardingState,
      } as any);
    });
    // Mark artifacts for purge targeting
    await mark('companies', { id: existingCompany.id }, { id: existingCompany.id });
    await mark('users', { id: existingUser.id }, { id: existingUser.id });
    return;
  }

  const res = await registerNewAccount({ user, company });
  if (!res.success || !res.data) throw new Error(res.message);
  const createdUser = res.data.user;
  const createdCompany = res.data.company;
  await mark('users', { id: createdUser.id }, createdUser);
  await mark('companies', { id: createdCompany.id }, createdCompany);
}
