import type { Knex } from 'knex';
import type { DemoFilter } from '../../shared/config';
import { addNewProjects } from '../../../../src/domains/projects/projects.model';
import { deleteDemoData } from '../../shared/utils';
import { generateDemoProjectsMap } from './projects.data';
import { dedupeByNormalizedKey, uuidV5ForCompanyProject } from '../../shared/id.js';

export const createDemoProjects = async (trx: Knex.Transaction, filters?: DemoFilter) => {
  const projectsMap = generateDemoProjectsMap(filters);
  for (const item of projectsMap) {
    const { projects, user, company } = item;
    if (!projects) continue;

    // Fetch available contacts for the company for valid FK assignment
    const contacts = await trx('contacts')
      .where({ company_id: company.id, is_deleted: false })
      .select('id', 'display_name');

    if (contacts.length === 0) {
      throw new Error(`No contacts found for company ${company.name} (${company.id})`);
    }
    const contactIds = contacts.map((c) => c.id);

    // Deduplicate projects by normalized name within the company
    const deduped = dedupeByNormalizedKey(projects, (p) => p.name);

    // Compute deterministic project IDs and attach valid contact IDs
    const prepared = deduped.map((p) => ({
      id: uuidV5ForCompanyProject(company.id, p.name),
      name: p.name,
      code: p.code ?? null,
      description: p.description ?? null,
      status: p.status,
      contactId: p['contactId' as keyof typeof p] as string | undefined /* ignore incoming */,
      startDate: p.startDate ?? null,
      endDate: p.endDate ?? null,
    }));

    // Ensure each project has a valid contactId; sample from available where missing/invalid
    const normalizedPrepared = prepared.map((p) => {
      const hasValidContact = p.contactId && contactIds.includes(p.contactId);
      const contactId = hasValidContact
        ? (p.contactId as string)
        : (contactIds[Math.floor(Math.random() * contactIds.length)] as string);
      return { ...p, contactId };
    });

    const res = await addNewProjects({
      input: normalizedPrepared,
      trx,
      companyId: company.id,
      userId: user.id,
    });
    if (!res.success) {
      throw new Error(res.message || `Failed to create demo projects for ${company.name}`);
    }
  }
};

export const deleteDemoProjects = async (trx: Knex.Transaction, filters?: DemoFilter) => {
  return await deleteDemoData({
    trx,
    table: 'projects',
    filters,
  });
};
