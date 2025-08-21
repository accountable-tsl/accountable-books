import type { Knex } from 'knex';
import type { SeedStep, SeedContext, MarkFunction } from '../utils/types.js';
import { upsertByKey } from '../utils/step-runner.js';
import { getCountryData } from '../data/countries/index.js';
import { getCompanyTypeData } from '../data/companies/index.js';

export const projectsStep: SeedStep = {
  id: 'projects',
  name: 'Projects',
  version: 1,
  description: 'Creates demo projects and client engagements',
  dependencies: ['companies', 'contacts'],

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

    // Check if company type requires projects
    if (!companyTypeData.businessRules.projectsRequired) {
      console.log(`⏭️ Projects not required for ${ctx.companyType} companies`);
      return;
    }

    // Get available contacts (potential clients)
    const contacts = await knex('contacts')
      .where('company_id', ctx.companyId)
      .whereIn('type', ['customer', 'client']);

    // Generate projects data
    const projectsGenerator = companyTypeData.generators.projects;
    const projectsData = projectsGenerator.generate(ctx);

    for (const projectData of projectsData) {
      // Assign a client if available
      const clientContact =
        contacts.length > 0 ? contacts[Math.floor(Math.random() * contacts.length)] : null;

      // Create project
      const [project] = await upsertByKey(knex, 'projects', ['company_id', 'name'], {
        company_id: ctx.companyId,
        name: projectData.name,
        description: projectData.description,
        code: projectData.code,
        status: projectData.status,
        client_id: clientContact?.id,
        start_date: projectData.startDate,
        end_date: projectData.endDate,
        budget_amount: projectData.budgetAmount,
        currency_id: company.reporting_currency_id,
        hourly_rate: projectData.hourlyRate,
        is_billable: projectData.isBillable,
        is_active: true,
        is_demo_project: true,
        metadata: projectData.metadata ? JSON.stringify(projectData.metadata) : null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await mark('projects', { id: project.id, company_id: ctx.companyId });

      const clientInfo = clientContact ? ` for ${clientContact.display_name}` : '';
      console.log(`✓ Created project: ${project.name} (${project.code})${clientInfo}`);
    }
  },

  async down(knex: Knex, ctx: SeedContext): Promise<void> {
    // Deletion handled by generic artifact system
    console.log('Projects step cleanup handled by artifact system');
  },
};
