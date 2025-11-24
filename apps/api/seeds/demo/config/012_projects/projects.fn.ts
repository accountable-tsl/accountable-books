import type { Knex } from 'knex';
import {
  deleteDemoData,
  getDemoCompanies,
  getDemoUserMap,
} from '../../shared/utils.js';
import {
  getRawProjectsForInsertion,
  generateDemoProjectsMap,
  type CompanyProjectsMap,
} from './projects.data.js';
import { demoProjectsByCompanyMap } from './projects.state.js';
import type { DemoFilter } from '../../shared/config.js';
import { addNewProjects } from '../../../../src/domains/projects/projects.model.js';

/**
 * Assign contact IDs to projects using database query
 */
async function assignContactsToProjects(
  projects: any[],
  companyId: string,
  trx: Knex.Transaction,
): Promise<any[]> {
  // Fetch available contacts for the company
  const contacts = await trx('contacts')
    .where({ company_id: companyId, is_deleted: false })
    .select('id', 'display_name');

  if (contacts.length === 0) {
    throw new Error(`No contacts found for company ${companyId}`);
  }

  const contactIds = contacts.map((c: any) => c.id);

  return projects.map((project) => {
    // If project already has a valid contactId, keep it
    const hasValidContact =
      project.contactId && contactIds.includes(project.contactId);
    if (hasValidContact) {
      return project;
    }

    // Otherwise assign a contact
    const contactId = contactIds[Math.floor(Math.random() * contactIds.length)];
    return { ...project, contactId };
  });
}

/**
 * Create demo projects in the database
 */
export const createDemoProjects = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  const projectsMap = await getRawProjectsForInsertion(trx, filters);

  if (projectsMap.length === 0) {
    console.log('Found no projects to create');
    return [];
  }

  // Get user mapping for dynamic user ID lookup
  const userMap = await getDemoUserMap(trx);

  // Helper to get user ID safely
  const getUserId = (email: string) => {
    const userId = userMap.get(email);
    if (!userId) {
      throw new Error(`Demo user not found for email: ${email}`);
    }
    return userId;
  };

  const results: any[] = [];

  for (const item of projectsMap) {
    const { projects, user, company } = item;
    if (!projects || projects.length === 0) continue;

    // Check if projects already exist for this company (idempotency)
    const existingProjects = await trx('projects')
      .where({ company_id: company.id })
      .first();

    if (existingProjects) {
      console.log(
        `Projects already exist for company ${company.shortCode}, skipping`,
      );
      continue;
    }

    console.log(
      `Creating ${projects.length} projects for company ${company.shortCode}`,
    );

    // Prepare projects for insertion (no IDs, let DB generate them)
    const prepared = projects.map((p) => ({
      name: p.name,
      code: p.code ?? null,
      description: p.description ?? null,
      status: p.status,
      contactId: undefined, // Will be assigned in next step
      startDate: p.startDate ?? null,
      endDate: p.endDate ?? null,
    }));

    // Assign contacts using database query
    const withContacts = await assignContactsToProjects(
      prepared,
      company.id,
      trx,
    );

    // Create projects
    const userId = getUserId(user.email ?? '');
    const res = await addNewProjects({
      input: withContacts,
      trx,
      companyId: company.id,
      userId,
    });

    if (!res.success) {
      throw new Error(
        res.message ||
          `Failed to create demo projects for ${company.shortCode}`,
      );
    }

    // Store results in state map
    if (res.data) {
      const projectsForState = res.data.map((project: any) => ({
        id: project.id,
        name: project.name,
        code: project.code,
        description: project.description,
        status: project.status,
        contactId: project.contactId,
        startDate: project.startDate,
        endDate: project.endDate,
        companyId: company.id,
        userId,
      }));

      demoProjectsByCompanyMap.set(company.id, projectsForState);
    }

    results.push(res);
  }

  return results;
};

/**
 * Get demo projects map with lazy creation
 * If projects don't exist for the filtered companies, create them first
 */
export const getOrCreateDemoProjectsMap = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
): Promise<CompanyProjectsMap[]> => {
  const companies = await getDemoCompanies(trx, filters);
  const targetCompanyIds = companies.map((c) => c.id);

  // Check if projects exist for all target companies
  const hasAllProjects = targetCompanyIds.every((id) =>
    demoProjectsByCompanyMap.has(id),
  );

  // Create projects if they don't exist
  if (!hasAllProjects) {
    await createDemoProjects(trx, filters);
  }

  // Return the projects map with IDs
  return generateDemoProjectsMap(trx, filters);
};

/**
 * Delete demo projects from the database
 */
export const deleteDemoProjects = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  // Clear the state map
  demoProjectsByCompanyMap.clear();

  return await deleteDemoData({
    trx,
    table: 'projects',
    filters,
  });
};
