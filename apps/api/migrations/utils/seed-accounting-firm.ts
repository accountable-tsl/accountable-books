import type { Knex } from 'knex';

import { VEYRA_COA_TEMPLATE } from '../data/veyra-advisory-firms.js';

import type { VeyraAdvisoryFirmSeed } from '../data/veyra-advisory-firms.js';

const completeOnbState = {
  steps: {
    company_details_confirmed: true,
    first_bank_account_added: true,
  },
  completed_at: {
    company_details_confirmed: new Date(),
    first_bank_account_added: new Date(),
  },
  metadata: null,
};

export type SeedAccountingFirmInput = VeyraAdvisoryFirmSeed & {
  createdById: string;
};

export type SeededAccountingFirmCompany = {
  id: string;
  legal_name: string;
  display_name: string | null;
  short_code: string;
  reporting_currency_id: string;
  created_by_id: string;
};

export async function seedAccountingFirmCompany(
  knex: Knex,
  input: SeedAccountingFirmInput,
): Promise<SeededAccountingFirmCompany> {
  const existing = await knex('companies')
    .where((builder) =>
      builder.where({ id: input.id }).orWhere({ short_code: input.shortCode }),
    )
    .first<SeededAccountingFirmCompany>();

  if (existing) {
    console.log(
      `Accounting firm company already exists (${input.shortCode}). Skipping insert.`,
    );
    return existing;
  }

  const [inserted] = await knex('companies')
    .insert({
      id: input.id,
      legal_name: input.legalName,
      display_name: input.displayName,
      short_code: input.shortCode,
      type: 'accounting_firm',
      country_id: input.countryId,
      default_timezone: input.defaultTimezone,
      reporting_currency_id: input.reportingCurrencyId,
      created_by_id: input.createdById,
      year_end_day: 31,
      year_end_month: 12,
      reporting_framework: input.reportingFramework,
      is_platform: false,
      is_demo_company: false,
      accounting_basis: 'modified_accrual_basis',
      onboarding_state: completeOnbState,
    })
    .returning([
      'id',
      'legal_name',
      'display_name',
      'short_code',
      'reporting_currency_id',
      'created_by_id',
    ]);

  console.log(`Created accounting firm company: ${input.legalName}`);
  return inserted;
}

export async function seedAccountingFirmMeta(
  knex: Knex,
  companyId: string,
  slug: string,
): Promise<void> {
  const existing = await knex('accounting_firms_meta')
    .where({ company_id: companyId })
    .first();

  if (existing) {
    console.log(`Accounting firm metadata already exists (${slug}). Skipping.`);
    return;
  }

  await knex('accounting_firms_meta').insert({
    company_id: companyId,
    slug,
  });

  console.log(`Created accounting firm metadata: ${slug}`);
}

export async function seedAccountingFirmSelfAssignment(
  knex: Knex,
  company: SeededAccountingFirmCompany,
): Promise<void> {
  const existing = await knex('client_firm_assignments')
    .where({ client_company_id: company.id })
    .first();

  if (existing) {
    console.log(
      `Client-firm assignment already exists for ${company.short_code}. Skipping.`,
    );
    return;
  }

  await knex('client_firm_assignments').insert({
    client_company_id: company.id,
    accounting_firm_company_id: company.id,
    created_by_id: company.created_by_id,
    updated_by_id: company.created_by_id,
  });

  await knex('companies')
    .where({ id: company.id })
    .update({ assigned_firm_id: company.id });

  console.log(`Linked ${company.short_code} to itself as managing firm.`);
}

export async function seedAccountingFirmCoaFromTemplate(
  knex: Knex,
  company: SeededAccountingFirmCompany,
  templateName: string = VEYRA_COA_TEMPLATE,
): Promise<void> {
  const existingCoa = await knex('coa')
    .where({ company_id: company.id })
    .first();

  if (existingCoa) {
    console.log(`COA already exists for ${company.short_code}. Skipping.`);
    return;
  }

  const coaTemplate = await knex('coa_templates')
    .where('is_active', true)
    .where('template_name', templateName)
    .select(['code', 'name', 'description', 'account_type_id', 'locked']);

  if (!coaTemplate.length) {
    throw new Error(`COA template not found: ${templateName}`);
  }

  const toInsert = coaTemplate.map((row) => ({
    code: row.code,
    name: row.name,
    account_type_id: row.account_type_id,
    description: row.description,
    is_active: true,
    currency_id: company.reporting_currency_id,
    company_id: company.id,
    created_by_id: company.created_by_id,
    locked: row.locked,
    source: 'template',
  }));

  await knex('coa').insert(toInsert);
  console.log(
    `Loaded COA template for ${company.short_code}: ${toInsert.length} accounts`,
  );
}

export async function seedAccountingFirm(
  knex: Knex,
  input: SeedAccountingFirmInput,
): Promise<SeededAccountingFirmCompany> {
  const company = await seedAccountingFirmCompany(knex, input);
  await seedAccountingFirmMeta(knex, company.id, input.slug);
  await seedAccountingFirmSelfAssignment(knex, company);
  await seedAccountingFirmCoaFromTemplate(knex, company);
  return company;
}

export async function removeSeededAccountingFirm(
  knex: Knex,
  companyId: string,
): Promise<void> {
  const billingAccount = await knex('billing_accounts')
    .where({ owner_company_id: companyId })
    .first<{ id: string }>();

  if (billingAccount) {
    await knex('workspace_billing_ownership')
      .where({ billing_account_id: billingAccount.id })
      .orWhere({ workspace_company_id: companyId })
      .delete();

    await knex('billing_accounts').where({ id: billingAccount.id }).delete();
  }

  await knex('coa').where({ company_id: companyId }).delete();

  await knex('client_firm_assignments')
    .where({ client_company_id: companyId })
    .orWhere({ accounting_firm_company_id: companyId })
    .delete();

  await knex('accounting_firms_meta').where({ company_id: companyId }).delete();
  await knex('companies').where({ id: companyId }).delete();
}
