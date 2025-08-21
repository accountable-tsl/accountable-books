import type { Knex } from 'knex';
import type { SeedStep, SeedContext, MarkFunction } from '../utils/types.js';
import { upsertByKey } from '../utils/step-runner.js';
import { getCountryData } from '../data/countries/index.js';
import { getCompanyTypeData } from '../data/companies/index.js';

export const contactsStep: SeedStep = {
  id: 'contacts',
  name: 'Contacts',
  version: 1,
  description: 'Creates demo contacts (customers, vendors, employees)',
  dependencies: ['companies'],

  async up(knex: Knex, ctx: SeedContext, mark: MarkFunction): Promise<void> {
    if (!ctx.companyId) {
      throw new Error('Company ID not found in context. Run companies step first.');
    }

    const countryData = getCountryData(ctx.country!);
    const companyTypeData = getCompanyTypeData(ctx.companyType!);

    // Get company record
    const company = await knex('companies').where('id', ctx.companyId).first();
    if (!company) {
      throw new Error(`Company with ID ${ctx.companyId} not found`);
    }

    // Generate contacts data
    const contactsGenerator = companyTypeData.generators.contacts;
    const contactsData = contactsGenerator.generate(ctx);

    for (const contactData of contactsData) {
      // Create contact
      const [contact] = await upsertByKey(knex, 'contacts', ['company_id', 'email'], {
        company_id: ctx.companyId,
        type: contactData.type,
        display_name: contactData.displayName,
        legal_name: contactData.legalName,
        email: contactData.email,
        phone: contactData.phone,
        address_line_1: contactData.address?.line1,
        address_line_2: contactData.address?.line2,
        city: contactData.address?.city,
        state: contactData.address?.state,
        postal_code: contactData.address?.postalCode,
        country_code: ctx.country,
        tax_id: contactData.taxId,
        payment_terms: contactData.paymentTerms,
        currency_id: company.reporting_currency_id,
        is_active: true,
        is_demo_contact: true,
        metadata: contactData.metadata ? JSON.stringify(contactData.metadata) : null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await mark('contacts', { id: contact.id, company_id: ctx.companyId });

      console.log(`✓ Created ${contact.type}: ${contact.display_name} (${contact.email})`);
    }
  },

  async down(knex: Knex, ctx: SeedContext): Promise<void> {
    // Deletion handled by generic artifact system
    console.log('Contacts step cleanup handled by artifact system');
  },
};
